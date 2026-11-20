"""
generate_baseline.py — 4.3: the pre-strategy synthetic Gymloop world.

Also hosts the simulation engine (`build_world`) that generate_strategy.py reuses
with the 4.6 intervention flags switched on. Both worlds use common random
numbers: every owner, gym and member draws from its own seeded stream
(np.random.default_rng([SEED, ...])), so a member who exists in both worlds sees
the same uniforms and differs only where an intervention changes a probability.

Field names mirror the real Firestore schema (RECON.md): users.start_date,
subscription_expiry, plan_id, plan_name, renewal_history; gyms.settings.plans[]
duration_days/price; attendance_logs.date/entry_time/scan_mode; payments
membership_start/membership_end/final_amount. No PII fields are generated.
"""
import sys
import time
from datetime import timedelta

import numpy as np
import pandas as pd

import config as C
from common import world_dir, write_csv

BASE = C.BURN_IN_START - timedelta(days=3650)         # day-index origin (room for long tenures)
D = lambda d: (d - BASE).days                          # noqa: E731  date -> day index
WIN0, WIN1, SIMEND, BURN0 = D(C.WINDOW_START), D(C.WINDOW_END), D(C.SIM_END), D(C.BURN_IN_START)
N_DAYS = SIMEND + 400
CAL = pd.date_range(BASE, periods=N_DAYS, freq="D")
WEEKDAY = CAL.weekday.values
MONTH = CAL.month.values
DAY_FACTOR = np.array(C.WEEKDAY_FACTOR)[WEEKDAY] * np.array([C.MONTH_FACTOR[m] for m in MONTH])
JOIN_FACTOR = np.array([C.JOIN_SEASON[m] for m in MONTH])
DATE_STR = np.array(CAL.strftime("%Y-%m-%d"))
HM_STR = np.array([f"{h:02d}:{m:02d}:00" for h in range(24) for m in range(60)])
SCAN_MODES = np.array(["phone", "kiosk"])
SOURCE = np.array(["qr", "kiosk"])


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def day_to_ts(day_idx, hours):
    ts = pd.Timestamp(BASE) + pd.to_timedelta(day_idx, unit="D") + pd.to_timedelta(hours, unit="h")
    return ts


# ═════════════════════════════════════════════════════════════════════════════
# 1. Owner funnel
# ═════════════════════════════════════════════════════════════════════════════
def simulate_funnel(strategy):
    rng = np.random.default_rng([C.SEED, 1])
    n = C.N_LANDING
    span_h = (C.WINDOW_END - C.WINDOW_START).days * 24 + 24
    # landing time: density ∝ 1 + g·t on [0,1]  (inverse CDF of a linear ramp)
    g = C.LANDING_GROWTH
    u = rng.random(n)
    t = (-1 + np.sqrt(1 + 2 * g * u * (1 + g / 2))) / g
    landing_h = np.sort(t) * span_h
    tier = rng.choice(C.TIERS, size=n, p=C.TIER_SHARE)
    U = rng.random((n, len(C.FUNNEL_CONV)))
    Z = rng.normal(size=(n, len(C.FUNNEL_CONV)))
    u_plan = rng.random(n)
    u_loc = rng.integers(0, len(C.LOCALITIES), size=n)

    conv = np.tile(np.array(C.FUNNEL_CONV), (n, 1))
    gap_med = np.tile(np.array(C.FUNNEL_GAP_MEDIAN_H), (n, 1))
    steps = C.FUNNEL_STEPS
    for step, mult in C.FUNNEL_TIER_MULT.items():
        k = steps.index(step) - 1
        conv[:, k] *= np.vectorize(mult.get)(tier)
    if strategy:
        k = steps.index("first_member_added") - 1
        conv[:, k] *= 1 + C.STRATEGY["bulk_import"]["member_add_conv_rel_lift"]
        gap_med[:, k] = C.STRATEGY["bulk_import"]["member_add_gap_median_h"]
    conv = np.minimum(conv, 0.97)

    win_end_h = span_h
    t0 = pd.Timestamp(C.WINDOW_START)
    rows, owners = [], []
    for i in range(n):
        oid = f"own_{i + 1:04d}"
        gid = None
        plan = None
        reached = {}
        h = landing_h[i]
        reached["landing_visit"] = h
        for k in range(len(C.FUNNEL_CONV)):
            if U[i, k] >= conv[i, k]:
                break
            h = h + gap_med[i, k] * np.exp(C.FUNNEL_GAP_SIGMA * Z[i, k])
            if h >= win_end_h:      # censored by the end of the window
                break
            reached[steps[k + 1]] = h
        if "signup_completed" in reached:
            gid = f"gym_n{i + 1:04d}"
        if "checkout_viewed" in reached:
            opts = C.SAAS_PLAN_BY_TIER[tier[i]]
            keys, probs = list(opts), np.array(list(opts.values()))
            plan = keys[int(np.searchsorted(np.cumsum(probs) / probs.sum(), u_plan[i]))]
        for step, hh in reached.items():
            ts = t0 + pd.to_timedelta(hh, unit="h")
            rows.append({
                "event": step, "owner_id": oid,
                "gym_id": gid if steps.index(step) >= steps.index("signup_completed") else None,
                "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%S") + C.TZ,
                "gym_tier": tier[i], "city": C.CITY, "locality": C.LOCALITIES[u_loc[i]],
                "plan_tier": plan if step in ("checkout_viewed", "subscription_paid") else ("PREMIUM" if step == "trial_started" else None),
                "value": C.SAAS_PLAN_PRICE[plan] if step in ("checkout_viewed", "subscription_paid") else None,
                "ga4_event": C.GA4_EVENT_MAP[step],
            })
        owners.append({"owner_idx": i, "owner_id": oid, "gym_id": gid, "tier": tier[i],
                       "locality": C.LOCALITIES[u_loc[i]], "plan": plan,
                       **{f"h_{s}": reached.get(s) for s in steps}})
    ev = pd.DataFrame(rows).sort_values(["timestamp", "owner_id", "event"], kind="stable").reset_index(drop=True)
    return pd.DataFrame(owners), ev


# ═════════════════════════════════════════════════════════════════════════════
# 2. Gyms
# ═════════════════════════════════════════════════════════════════════════════
def gym_attrs(rng, tier, mult=1.0):
    size = int(np.clip(round(mult * np.exp(rng.normal(*C.GYM_SIZE_LOGNORM))), C.GYM_SIZE_MIN, C.GYM_SIZE_MAX))
    lo, hi = C.MONTHLY_PRICE_RANGE[tier]
    monthly = int(round(rng.uniform(lo, hi) / 50) * 50)
    kiosk = bool(rng.random() < C.KIOSK_PROB_BY_TIER[tier])
    plans = {L: {"plan_id": None, "price": int(round(monthly * C.PLAN_PRICE_MULT[L] / 100) * 100)} for L in C.PLAN_MONTHS}
    return size, monthly, kiosk, plans


def build_gyms(owners, strategy):
    gyms = []
    for j in range(C.N_ESTABLISHED_GYMS):
        rng = np.random.default_rng([C.SEED, 2, j])
        tier = rng.choice(C.TIERS, p=C.TIER_SHARE)
        loc = C.LOCALITIES[int(rng.integers(len(C.LOCALITIES)))]
        size, monthly, kiosk, plans = gym_attrs(rng, tier)
        onboarded = pd.Timestamp("2023-06-01") + pd.to_timedelta(int(rng.integers(0, 540)), unit="D")
        saas = rng.choice(list(C.SAAS_PLAN_BY_TIER[tier]), p=np.array(list(C.SAAS_PLAN_BY_TIER[tier].values())) / sum(C.SAAS_PLAN_BY_TIER[tier].values()))
        gyms.append(dict(gym_key=j, gym_id=f"gym_e{j + 1:03d}", owner_id=f"own_e{j + 1:03d}", origin="established",
                         gym_tier=tier, city=C.CITY, locality=loc, target_size=size, monthly_price=monthly,
                         has_kiosk=kiosk, attendance_mode="qr", saas_plan=saas, saas_status="active",
                         onboarded_at=onboarded.strftime("%Y-%m-%d"), member_start_day=BURN0, plans=plans))
    act = owners[owners["h_first_checkin_recorded"].notna()]
    t0 = pd.Timestamp(C.WINDOW_START)
    roster_days = C.STRATEGY["bulk_import"]["roster_entry_days"] if strategy else C.ROSTER_ENTRY_DAYS_BASELINE
    for _, o in act.iterrows():
        i = int(o.owner_idx)
        rng = np.random.default_rng([C.SEED, 3, i])
        size, monthly, kiosk, plans = gym_attrs(rng, o.tier, C.NEW_GYM_SIZE_MULT)
        first_member = t0 + pd.to_timedelta(o.h_first_member_added, unit="h")
        paid = pd.notna(o.h_subscription_paid)
        trial = pd.notna(o.h_trial_started)
        gyms.append(dict(gym_key=100000 + i, gym_id=o.gym_id, owner_id=o.owner_id, origin="funnel_2026",
                         gym_tier=o.tier, city=C.CITY, locality=o.locality, target_size=size, monthly_price=monthly,
                         has_kiosk=kiosk, attendance_mode="qr",
                         saas_plan=(o.plan if paid else ("PREMIUM" if trial else "FREE")),
                         saas_status=("active" if paid else ("trial" if trial else "free")),
                         onboarded_at=first_member.strftime("%Y-%m-%d"),
                         member_start_day=D(first_member.date()), roster_days=roster_days, plans=plans))
    for gm in gyms:
        for L in C.PLAN_MONTHS:
            gm["plans"][L]["plan_id"] = f"pln_{gm['gym_id'][4:]}_{L}m"
    return gyms


# ═════════════════════════════════════════════════════════════════════════════
# 3. Members, membership periods, attendance
# ═════════════════════════════════════════════════════════════════════════════
def pick_plan(u):
    return C.PLAN_MONTHS[int(np.searchsorted(np.cumsum(C.PLAN_MIX), u))]


def simulate_member(gym, kind, k, first_start, months, prev_renewals, strategy, out_att, out_per, period_start=None):
    """Simulate one member's membership periods; append attendance & periods to the output buffers."""
    rng = np.random.default_rng([C.SEED, 20, gym["gym_key"], kind, k])
    tier = gym["gym_tier"]
    mean = C.VISITS_PER_WEEK_MEAN[tier]
    lam = min(C.VISITS_PER_WEEK_CAP, rng.gamma(C.VISITS_GAMMA_SHAPE, mean / C.VISITS_GAMMA_SHAPE))
    slot = list(C.SLOT_SHARE)[int(np.searchsorted(np.cumsum(list(C.SLOT_SHARE.values())), rng.random()))]
    mu, sd, lo, hi = C.SLOT_HOUR[slot]
    joined_jan = CAL[first_start].month == 1
    member_id = f"m_{gym['gym_id'][4:]}_{'irj'[kind]}{k:04d}"

    s = first_start if period_start is None else period_start
    period = 0
    churned = False
    S = C.STRATEGY
    while s < SIMEND and not churned:
        L = months
        dur = C.PLAN_DURATION_DAYS[L]
        e = s + dur                                  # expiry day (membership_end)
        misc = rng.random(9)
        z = rng.normal()
        Ud = rng.random(dur)
        Hd = rng.normal(size=dur)
        Sd = rng.random(dur)
        decay_len = int(C.DECAY_DAYS_RANGE[0] + misc[1] * (C.DECAY_DAYS_RANGE[1] - C.DECAY_DAYS_RANGE[0]))
        pr = prev_renewals + period
        logit = (C.B0 + C.B_ENG * (lam - 3.0) + C.B_PLAN[L] + C.B_TENURE * min(pr, 3)
                 + C.B_TIER[tier] + (C.B_JAN if joined_jan else 0.0) + C.RENEW_NOISE * z)
        p_renew = sigmoid(logit)
        will_churn = misc[0] >= p_renew
        censored = e + C.CHURN_GRACE_DAYS > SIMEND

        days = np.arange(s, e)
        base_p = lam / 7.0 * DAY_FACTOR[days]
        hm = days - first_start < C.HONEYMOON_DAYS
        base_p = np.where(hm, base_p * C.HONEYMOON_FACTOR, base_p)
        to_exp = e - days
        decay = np.where(to_exp <= decay_len, C.DECAY_FLOOR + (1 - C.DECAY_FLOOR) * (to_exp / decay_len), 1.0)
        p_day = np.minimum(base_p * (decay if will_churn else 1.0), 0.95)
        chk = Ud < p_day

        in_strategy = strategy and e >= WIN0
        alerted = returned = False
        alert_day = None
        saved_by = None
        if in_strategy:
            # at-risk alert: first day with 10+ consecutive days without a check-in (only once the alert exists, i.e. in window)
            idx = np.arange(dur)
            last = np.maximum.accumulate(np.where(chk, idx, -1))
            gap = idx - last
            cand = np.where((gap >= S["at_risk_alert"]["no_checkin_days"]) & (days >= WIN0))[0]
            if cand.size:
                a = int(cand[0])
                alerted, alert_day = True, int(days[a])
                if misc[3] < S["at_risk_alert"]["return_rate"]:
                    returned = True
                    after = idx > a
                    p_after = np.minimum(base_p, 0.95)   # owner reached out -> decay removed
                    chk = np.where(after, Ud < p_after, chk)
                    ret = a + 1 + int(misc[8] * 3)
                    if ret < dur:
                        chk[ret] = True
                    if will_churn and misc[4] < S["at_risk_alert"]["returned_churner_renew_rate"]:
                        will_churn, saved_by = False, "at_risk_alert"
            if will_churn and misc[5] < S["renewal_reminders"]["would_be_churner_save_rate"]:
                will_churn, saved_by = False, "renewal_reminder"

        # attendance rows (window only)
        sel = chk & (days >= WIN0) & (days <= WIN1)
        if sel.any():
            dd = days[sel]
            hours = np.clip(mu + sd * Hd[sel] + np.where(WEEKDAY[dd] >= 5, 0.8 if slot == "morning" else -0.5, 0.0), lo, hi)
            minute = np.minimum((hours * 60).astype(int), 1439)
            kiosk = (Sd[sel] < C.KIOSK_SHARE_IF_KIOSK) if gym["has_kiosk"] else np.zeros(sel.sum(), bool)
            out_att.append((dd, minute, kiosk.astype(np.int8), len(out_per), member_id, gym["gym_id"]))

        # renewal outcome
        if censored:
            renewed, gap_days, nxt = None, None, None
        elif will_churn:
            renewed, gap_days, nxt = False, None, None
            churned = True
        else:
            gap_days = 0 if misc[2] < C.RENEW_GAP_SAME_DAY else 1 + int((misc[2] - C.RENEW_GAP_SAME_DAY) / (1 - C.RENEW_GAP_SAME_DAY) * 7)
            gap_days = min(gap_days, 7)
            renewed, nxt = True, e + gap_days
        reminders = 0
        if strategy and e >= WIN0:
            reminders = 2 if (renewed is not False and gap_days in (None, 0)) else 3   # -7d, -1d (+3d only if not renewed yet)
        plan = gym["plans"][L]
        out_per.append(dict(
            payment_id=f"pay_{member_id[2:]}_{period:02d}", gym_id=gym["gym_id"], member_id=member_id,
            period_index=period, prev_renewals=pr, plan_id=plan["plan_id"], plan_name=C.PLAN_NAME[L],
            plan_months=L, duration_days=dur, final_amount=plan["price"], status="paid",
            membership_start=s, membership_end=e, renewed=renewed,
            renewal_date=(nxt if renewed else None), renewal_gap_days=gap_days,
            churned=(renewed is False), reminders_sent=reminders, at_risk_alerted=alerted,
            alert_date=alert_day, returned_after_alert=returned, saved_by=saved_by,
            first_start=first_start, member_kind="irj"[kind], _slot=slot))
        if renewed:
            if misc[6] < C.PLAN_SWITCH_PROB:
                months = pick_plan(misc[7])
            s = nxt
            period += 1
        else:
            break


def simulate_gym(gym, strategy, out_att, out_per):
    rng = np.random.default_rng([C.SEED, 10, gym["gym_key"]])
    size = gym["target_size"]
    # daily walk-in joins over the whole calendar (same draws in both worlds), used from member_start_day
    lam_day = size * C.JOIN_RATE_PER_MONTH / 30.0 * JOIN_FACTOR[BURN0:SIMEND]
    joins = rng.poisson(lam_day)
    u_plan_j = rng.random(int(joins.sum()) + 1)
    n_roster = int(round(size * C.NEW_GYM_ROSTER_SHARE))
    u_roster = rng.random((n_roster, 3))
    u_init = rng.random((size, 3))
    start = gym["member_start_day"]

    if gym["origin"] == "established":
        for k in range(size):     # initial stock at burn-in start, mid-period
            L = pick_plan(u_init[k, 0])
            dur = C.PLAN_DURATION_DAYS[L]
            s0 = BURN0 - int(u_init[k, 1] * dur)
            prev = int(np.random.default_rng([C.SEED, 11, gym["gym_key"], k]).poisson(1.2))
            simulate_member(gym, 0, k, s0 - prev * dur, L, prev, strategy, out_att, out_per, period_start=s0)
    else:
        rd = gym["roster_days"]
        for k in range(n_roster):  # existing roster entered into the app (manual vs bulk import)
            L = pick_plan(u_roster[k, 0])
            first = start + int(u_roster[k, 1] * rd)
            if first >= SIMEND:
                continue
            simulate_member(gym, 1, k, first, L, 0, strategy, out_att, out_per)
    q = 0
    for di in range(len(joins)):
        day = BURN0 + di
        for _ in range(joins[di]):
            if day >= start:
                simulate_member(gym, 2, q, day, pick_plan(u_plan_j[q]), 0, strategy, out_att, out_per)
            q += 1


# ═════════════════════════════════════════════════════════════════════════════
# 4. Assemble & write
# ═════════════════════════════════════════════════════════════════════════════
def build_world(strategy=False):
    t_start = time.time()
    world = "strategy" if strategy else "baseline"
    owners, events = simulate_funnel(strategy)
    gyms = build_gyms(owners, strategy)
    out_att, out_per = [], []
    for gm in gyms:
        simulate_gym(gm, strategy, out_att, out_per)

    per = pd.DataFrame(out_per)
    # keep members whose life touches the window (last expiry + grace >= window start)
    last_end = per.groupby("member_id")["membership_end"].transform("max")
    per = per[last_end + C.CHURN_GRACE_DAYS >= WIN0].copy()
    keep_members = set(per["member_id"])

    # attendance
    att_parts = [a for a in out_att if a[4] in keep_members]
    day = np.concatenate([a[0] for a in att_parts])
    minute = np.concatenate([a[1] for a in att_parts])
    kio = np.concatenate([a[2] for a in att_parts])
    mid = np.concatenate([np.full(len(a[0]), a[4], dtype=object) for a in att_parts])
    gid = np.concatenate([np.full(len(a[0]), a[5], dtype=object) for a in att_parts])
    pidx = np.concatenate([np.full(len(a[0]), a[3]) for a in att_parts])
    exp_map = np.array([p["membership_end"] for p in out_per])
    plan_map = np.array([p["plan_name"] for p in out_per], dtype=object)
    att = pd.DataFrame({
        "gym_id": gid, "member_id": mid, "date": DATE_STR[day],
        "entry_time": pd.Series(DATE_STR[day], dtype=object) + "T" + HM_STR[minute] + C.TZ,
        "exit_time": None, "scan_mode": SCAN_MODES[kio], "attendance_source": SOURCE[kio],
        "plan_name": plan_map[pidx], "subscription_expiry": DATE_STR[exp_map[pidx]],
        "_day": day, "_min": minute,
    }).sort_values(["_day", "_min", "gym_id", "member_id"], kind="stable").drop(columns=["_day", "_min"]).reset_index(drop=True)
    att.insert(0, "log_id", [f"att_{i:07d}" for i in range(len(att))])

    # memberships (payments-shaped)
    per = per.sort_values(["gym_id", "member_id", "period_index"], kind="stable").reset_index(drop=True)
    for col in ["membership_start", "membership_end", "renewal_date", "alert_date"]:
        per[col] = per[col].map(lambda x: DATE_STR[int(x)] if pd.notna(x) else None)
    per["renewal_gap_days"] = per["renewal_gap_days"].astype("Int64")

    # members (users docs, role=member) — current state at WINDOW_END
    last = per.groupby("member_id").tail(1).set_index("member_id")
    first = per.groupby("member_id")["first_start"].min()
    att_cnt = att.groupby("member_id").size()
    last_seen = att.groupby("member_id")["date"].max()
    n_ren = per[per["renewed"] == True].groupby("member_id").size()  # noqa: E712
    end_d = pd.to_datetime(last["membership_end"])
    win_end = pd.Timestamp(C.WINDOW_END)
    status = np.where(end_d > win_end, "active",
                      np.where(end_d + pd.Timedelta(days=C.CHURN_GRACE_DAYS) > win_end, "expired_grace",
                               np.where(last["churned"], "churned", "active")))
    members = pd.DataFrame({
        "id": last.index, "gym_id": last["gym_id"].values, "role": "member",
        "start_date": [DATE_STR[int(x)] for x in first.reindex(last.index).values],
        "plan_id": last["plan_id"].values, "plan_name": last["plan_name"].values,
        "duration_days": last["duration_days"].values, "plan_price": last["final_amount"].values,
        "subscription_expiry": last["membership_end"].values, "payment_status": "paid",
        "attendance_count": att_cnt.reindex(last.index).fillna(0).astype(int).values,
        "last_seen": last_seen.reindex(last.index).values,
        "renewal_count": n_ren.reindex(last.index).fillna(0).astype(int).values,
        "status": status, "qr_attendance_enabled": True,
        "member_source": last["member_kind"].map({"i": "existing", "r": "roster_import", "j": "walk_in"}).values,
    }).sort_values(["gym_id", "id"]).reset_index(drop=True)
    per = per.drop(columns=["member_kind", "_slot"])
    per["first_start"] = per["first_start"].map(lambda x: DATE_STR[int(x)])

    gyms_df = pd.DataFrame([{k: v for k, v in g.items() if k not in ("plans", "member_start_day", "roster_days", "gym_key")} for g in gyms])
    stock = members.groupby("gym_id").size()
    gyms_df["members_in_window"] = gyms_df["gym_id"].map(stock).fillna(0).astype(int)
    gyms_df["settings_plans"] = [";".join(f"{g['plans'][L]['plan_id']}|{C.PLAN_NAME[L]}|{C.PLAN_DURATION_DAYS[L]}|{g['plans'][L]['price']}" for L in C.PLAN_MONTHS) for g in gyms]

    d = world_dir(world)
    write_csv(gyms_df, d / "gyms.csv")
    write_csv(events, d / "funnel_events.csv")
    write_csv(members, d / "members.csv")
    write_csv(per, d / "memberships.csv")
    write_csv(att, d / "attendance_logs.csv.gz")
    print(f"[{world}] gyms={len(gyms_df)} funnel_events={len(events)} members={len(members)} "
          f"memberships={len(per)} attendance_logs={len(att)}  ({time.time() - t_start:.1f}s)")
    return {"gyms": gyms_df, "funnel_events": events, "members": members, "memberships": per, "attendance_logs": att}


if __name__ == "__main__":
    build_world(strategy=False)
    sys.exit(0)
