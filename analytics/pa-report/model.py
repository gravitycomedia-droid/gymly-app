"""
model.py — 4.8 churn prediction at expiry − 14 days, and 4.9 risk buckets & ₹ impact.

Unit: one expiring membership period (payments row) in the baseline world.
Label: churned = not renewed within 7 days after subscription_expiry.
Cutoff: membership_end − 14 days. Every feature uses only attendance with
date < cutoff and attributes known at the cutoff (leakage checks below).
Split: time-based — train expiry < 2026-06-15, validation 2026-06-15..07-31
(model selection + threshold), test expiry >= 2026-08-01 (reported metrics).
"""
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, confusion_matrix, f1_score, precision_recall_curve,
                             precision_score, recall_score, roc_auc_score, roc_curve)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

import config as C
from common import load_world, savefig, savetab, update_results, pct

M = C.MODEL
NUM = ["visits_7d", "visits_14d", "visits_30d", "trend_14v14", "days_since_last_visit", "plan_months", "price",
       "tenure_days", "prev_renewals", "gym_size"]
CAT = ["preferred_slot", "gym_tier"]
MODEL_ORDER = ["LogisticRegression", "RandomForest", "XGBoost"]   # simplest first (tie-break)
MODEL_COLOR = {"LogisticRegression": C.PALETTE["primary"], "RandomForest": C.PALETTE["secondary"], "XGBoost": C.PALETTE["tertiary"]}


def slot_of(hour):
    return np.where(hour < 11, "morning", np.where(hour < 16, "midday", "evening"))


def build_features():
    w = load_world("baseline")
    per, att, gyms = w["memberships"], w["attendance_logs"], w["gyms"]
    p = per[per.renewed.notna() & (per.membership_end >= pd.Timestamp(M["min_expiry"])) & (per.membership_end <= pd.Timestamp(M["max_expiry"]))].copy()
    p["cutoff"] = p.membership_end - pd.Timedelta(days=M["cutoff_days_before_expiry"])
    p = p[p.membership_start < p.cutoff]
    a = att[["member_id", "date", "entry_time"]].copy()
    a["hour"] = a.entry_time.str[11:13].astype(int)
    m = a.merge(p[["payment_id", "member_id", "cutoff"]], on="member_id")
    m["d"] = (m.cutoff - m.date).dt.days               # days before cutoff; >= 1 means strictly before the cutoff
    m = m[(m.d >= 1) & (m.d <= 60)]
    assert (m.date < m.cutoff).all()                     # leakage guard: no attendance on/after the cutoff
    g = m.groupby("payment_id")
    f = pd.DataFrame(index=p.payment_id)
    for k in (7, 14, 30):
        f[f"visits_{k}d"] = m[m.d <= k].groupby("payment_id").size()
    f["prev14"] = m[(m.d > 14) & (m.d <= 28)].groupby("payment_id").size()
    f["days_since_last_visit"] = g.d.min()
    f["preferred_slot"] = g.hour.agg(lambda h: pd.Series(slot_of(h.values)).mode().iloc[0])
    f = f.reset_index()
    f[["visits_7d", "visits_14d", "visits_30d", "prev14"]] = f[["visits_7d", "visits_14d", "visits_30d", "prev14"]].fillna(0)
    p = p.merge(f, on="payment_id", how="left")
    hist_days = (p.cutoff - p[["first_start"]].assign(fs=pd.to_datetime(p.first_start)).fs.clip(lower=pd.Timestamp(C.WINDOW_START))).dt.days
    p["days_since_last_visit"] = p.days_since_last_visit.fillna(np.minimum(hist_days, 61))
    p["preferred_slot"] = p.preferred_slot.fillna("none")
    p["trend_14v14"] = p.visits_14d - p.prev14
    p["price"] = p.final_amount
    p["tenure_days"] = (p.cutoff - pd.to_datetime(p.first_start)).dt.days
    gm = gyms.set_index("gym_id")
    p["gym_tier"] = p.gym_id.map(gm.gym_tier)
    p["gym_size"] = p.gym_id.map(gm.target_size)
    p["y"] = p.churned.astype(int)
    p["split"] = np.where(p.membership_end < pd.Timestamp(M["val_start"]), "train",
                          np.where(p.membership_end < pd.Timestamp(M["test_start"]), "val", "test"))
    return p


def make_models():
    pre = lambda: ColumnTransformer([("num", StandardScaler(), NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])  # noqa: E731
    return {
        "LogisticRegression": Pipeline([("pre", pre()), ("clf", LogisticRegression(max_iter=2000, C=1.0))]),
        "RandomForest": Pipeline([("pre", pre()), ("clf", RandomForestClassifier(n_estimators=300, min_samples_leaf=20, max_features="sqrt",
                                                                                   random_state=C.SEED, n_jobs=4))]),
        "XGBoost": Pipeline([("pre", pre()), ("clf", XGBClassifier(n_estimators=400, max_depth=4, learning_rate=0.05, subsample=0.8,
                                                                     colsample_bytree=0.8, min_child_weight=5, eval_metric="logloss",
                                                                     random_state=C.SEED, n_jobs=4, tree_method="hist"))]),
    }


def best_f1_threshold(y, s):
    pr, rc, th = precision_recall_curve(y, s)
    f1 = 2 * pr * rc / np.maximum(pr + rc, 1e-12)
    i = int(np.nanargmax(f1[:-1]))
    return float(th[i])


def metrics(y, s, thr):
    yhat = (s >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, yhat, labels=[0, 1]).ravel()
    return {"roc_auc": roc_auc_score(y, s), "pr_auc": average_precision_score(y, s), "threshold": thr,
            "precision": precision_score(y, yhat, zero_division=0), "recall": recall_score(y, yhat), "f1": f1_score(y, yhat),
            "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}}


def leakage_checks(p):
    tr = p[p.split == "train"]
    single = {c: float(max(roc_auc_score(tr.y, tr[c]), 1 - roc_auc_score(tr.y, tr[c]))) for c in NUM}
    return {
        "attendance_strictly_before_cutoff": True,
        "cutoff": f"membership_end - {M['cutoff_days_before_expiry']} days",
        "label_source": "renewal within 7 days after expiry (memberships.renewed) — not an input feature",
        "excluded_post_cutoff_fields": ["renewed", "renewal_date", "renewal_gap_days", "churned", "status", "last_seen",
                                        "attendance_count", "members.renewal_count", "reminders_sent", "at_risk_alerted"],
        "time_split": {"train_expiry_lt": M["val_start"], "val": [M["val_start"], M["test_start"]], "test_expiry_gte": M["test_start"]},
        "train_test_member_overlap_note": "periods are split by expiry date; a member can appear in train and test with different periods (past behaviour only)",
        "max_single_feature_auc": max(single.values()), "single_feature_auc": single,
        "single_feature_auc_ok": max(single.values()) < 0.95,
    }


def run():
    p = build_features()
    savetab(p[["payment_id", "gym_id", "member_id", "membership_end", "cutoff", "split", "y"] + NUM + CAT].assign(
        membership_end=lambda d: d.membership_end.dt.strftime("%Y-%m-%d"), cutoff=lambda d: d.cutoff.dt.strftime("%Y-%m-%d")).head(0), "4_8", "feature_schema")
    leak = leakage_checks(p)
    assert leak["single_feature_auc_ok"], "leakage check failed: a single feature nearly determines the label"
    tr, va, te = p[p.split == "train"], p[p.split == "val"], p[p.split == "test"]
    trva = p[p.split != "test"]
    X = NUM + CAT

    sel, test_res, scores, fitted = {}, {}, {}, {}
    for name, mdl in make_models().items():
        mdl.fit(tr[X], tr.y)
        sv = mdl.predict_proba(va[X])[:, 1]
        thr = best_f1_threshold(va.y, sv)
        sel[name] = metrics(va.y, sv, thr)
        final = make_models()[name].fit(trva[X], trva.y)
        st = final.predict_proba(te[X])[:, 1]
        test_res[name] = metrics(te.y, st, thr)
        scores[name], fitted[name] = st, final

    best_pr = max(sel[m]["pr_auc"] for m in MODEL_ORDER)
    best = next(m for m in MODEL_ORDER if sel[m]["pr_auc"] >= best_pr - 0.005)
    top = max(MODEL_ORDER, key=lambda m: sel[m]["pr_auc"])
    if best == top:
        why = (f"{best} has the highest validation PR-AUC ({sel[best]['pr_auc']:.3f}); simpler models trail by more than the 0.005 tie margin "
               f"(" + ", ".join(f"{m} {sel[m]['pr_auc']:.3f}" for m in MODEL_ORDER if m != best) + "). PR-AUC is the selection metric because churn is the "
               f"minority class and owners act on the top of the list. On the held-out test months it scores ROC-AUC {test_res[best]['roc_auc']:.3f}, "
               f"PR-AUC {test_res[best]['pr_auc']:.3f}.")
    else:
        why = (f"{top} has the highest validation PR-AUC ({sel[top]['pr_auc']:.3f}) but {best} is within the 0.005 tie margin ({sel[best]['pr_auc']:.3f}), "
               f"so the simpler, more explainable model is preferred for owner-facing risk scores. Test ROC-AUC {test_res[best]['roc_auc']:.3f}, PR-AUC {test_res[best]['pr_auc']:.3f}.")

    rows = [{"model": m, "split": s_, **{k: v for k, v in d[m].items() if k != "confusion_matrix"}} for s_, d in (("validation", sel), ("test", test_res)) for m in MODEL_ORDER]
    savetab(pd.DataFrame(rows).round(4), "4_8", "model_comparison")

    # ── figures ──
    base_rate = te.y.mean()
    fig, ax = plt.subplots(figsize=(5.5, 4.6))
    for m in MODEL_ORDER:
        fpr, tpr, _ = roc_curve(te.y, scores[m])
        ax.plot(fpr, tpr, lw=2, color=MODEL_COLOR[m], label=f"{m} (AUC {test_res[m]['roc_auc']:.3f})")
    ax.plot([0, 1], [0, 1], ls=":", color=C.PALETTE["neutral"], lw=1)
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.legend(loc="lower right")
    savefig(fig, "4_8", "roc_curves", "ROC curves on the held-out test months (expiries Aug–Oct 2026) for the three models.")
    fig, ax = plt.subplots(figsize=(5.5, 4.6))
    for m in MODEL_ORDER:
        pr, rc, _ = precision_recall_curve(te.y, scores[m])
        ax.plot(rc, pr, lw=2, color=MODEL_COLOR[m], label=f"{m} (AP {test_res[m]['pr_auc']:.3f})")
    ax.axhline(base_rate, ls=":", color=C.PALETTE["neutral"], lw=1)
    ax.text(0.02, base_rate + 0.015, f"churn base rate {100 * base_rate:.0f}%", fontsize=8, color=C.PALETTE["ink2"])
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_ylim(0, 1.02)
    ax.legend(loc="lower left")
    savefig(fig, "4_8", "pr_curves", "Precision–recall curves on the test months; dotted line = churn base rate.")
    cm = test_res[best]["confusion_matrix"]
    mat = np.array([[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]])
    fig, ax = plt.subplots(figsize=(4.6, 4))
    ax.imshow(mat, cmap="Blues")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, f"{mat[i, j]:,}\n({100 * mat[i, j] / mat.sum():.1f}%)", ha="center", va="center", fontsize=10,
                    color="white" if mat[i, j] > mat.max() * 0.55 else C.PALETTE["ink"])
    ax.set_xticks([0, 1], ["predicted renew", "predicted churn"])
    ax.set_yticks([0, 1], ["actual renew", "actual churn"])
    ax.grid(False)
    savefig(fig, "4_8", "confusion_matrix", f"Confusion matrix of the selected model ({best}) on the test months at threshold {test_res[best]['threshold']:.2f} (chosen on validation).")
    pi = permutation_importance(fitted[best], te[X], te.y, scoring="average_precision", n_repeats=5, random_state=C.SEED, n_jobs=1)
    imp = pd.DataFrame({"feature": X, "importance": pi.importances_mean, "std": pi.importances_std}).sort_values("importance", ascending=False)
    savetab(imp.round(5), "4_8", "feature_importance")
    fig, ax = plt.subplots(figsize=(6.5, 4.2))
    ii = imp.iloc[::-1]
    ax.barh(ii.feature, ii.importance, xerr=ii["std"], color=C.PALETTE["primary"], height=0.6, edgecolor="white", linewidth=1.5,
            error_kw={"ecolor": C.PALETTE["neutral"], "lw": 1})
    ax.set_xlabel("Permutation importance (drop in PR-AUC on test)")
    ax.grid(axis="y", visible=False)
    savefig(fig, "4_8", "feature_importance", f"Permutation feature importance of the selected model ({best}) on the test months.")

    # ── 4.9 predictions & recommendations ──
    te = te.assign(p=scores[best])
    hb, mb = M["risk_bands"]["High"], M["risk_bands"]["Medium"]
    te["band"] = np.where(te.p >= hb, "High", np.where(te.p >= mb, "Medium", "Low"))
    actions = {
        "High": "Owner/manager calls within 48 h of the alert; renewal offer (e.g. 10% off a quarterly plan or a free PT session); log the outcome.",
        "Medium": "Automated WhatsApp sequence (−7d / −1d / +3d) plus a 'we miss you' nudge after 10 days without a check-in; no discount.",
        "Low": "Standard renewal reminder only; ask for a referral or upsell a longer plan at renewal.",
    }
    span_days = (pd.Timestamp(M["max_expiry"]) - pd.Timestamp(M["test_start"])).days + 1
    bands = []
    for b in ["High", "Medium", "Low"]:
        d = te[te.band == b]
        churners = int(d.y.sum())
        saved = churners * M["save_rate_by_band"][b]
        price = float(d[d.y == 1].price.mean()) if churners else 0.0
        bands.append({"band": b, "members": int(len(d)), "share_pct": pct(len(d) / len(te)), "mean_predicted_pct": pct(d.p.mean()),
                      "actual_churn_pct": pct(d.y.mean()), "actual_churners": churners, "assumed_save_rate": M["save_rate_by_band"][b],
                      "members_saved": round(saved, 1), "avg_plan_price_inr": round(price, 0), "revenue_saved_inr": round(saved * price, 0),
                      "action": actions[b]})
    bt = pd.DataFrame(bands)
    savetab(bt, "4_9", "risk_buckets")
    total_saved = float(bt.members_saved.sum())
    total_rev = float(bt.revenue_saved_inr.sum())
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    x = np.arange(3)
    ax.bar(x, bt.actual_churn_pct, color=[C.PALETTE["secondary"], C.PALETTE["primary"], C.PALETTE["muted"]], width=0.55, edgecolor="white", linewidth=2)
    for xi, r in zip(x, bt.itertuples()):
        ax.text(xi, r.actual_churn_pct + 1.5, f"{r.actual_churn_pct:.0f}% churned\n{r.members:,} members", ha="center", fontsize=8.5, color=C.PALETTE["ink2"])
    ax.set_xticks(x, [f"{b} risk" for b in bt.band])
    ax.set_ylabel("Actual churn in test months (%)")
    ax.set_ylim(0, 100)
    ax.grid(axis="x", visible=False)
    savefig(fig, "4_9", "risk_buckets", f"Test-set members bucketed by predicted churn risk ({best}): actual churn rate and size per bucket.")
    te_out = te[["payment_id", "gym_id", "member_id", "membership_end", "p", "band", "y"]].assign(membership_end=lambda d: d.membership_end.dt.strftime("%Y-%m-%d"))
    savetab(te_out.rename(columns={"p": "churn_probability", "y": "actual_churned"}).round(4), "4_9", "test_predictions")

    update_results("model", {
        "unit": "expiring membership period (baseline world)", "prediction_point": f"expiry - {M['cutoff_days_before_expiry']} days",
        "features": NUM + CAT, "n": {"train": int(len(tr)), "validation": int(len(va)), "test": int(len(te))},
        "churn_rate": {"train": float(tr.y.mean()), "validation": float(va.y.mean()), "test": float(base_rate)},
        "validation": sel, "test": test_res, "best_model": best, "selection_metric": "validation PR-AUC (tie margin 0.005 -> simpler model)",
        "justification": why, "feature_importance": imp.head(8).to_dict("records"), "leakage_checks": leak,
    })
    update_results("predictions", {
        "model": best, "test_months": [M["test_start"], M["max_expiry"]], "bands": bands,
        "band_thresholds": M["risk_bands"], "total_members_saved": total_saved, "total_revenue_saved_inr": total_rev,
        "annualised_revenue_saved_inr": round(total_rev * 365 / span_days, 0),
        "impact_formula": "members saved = actual churners in band x assumed save rate; ₹ = members saved x avg plan price of those churners",
    })
    return best


if __name__ == "__main__":
    run()
