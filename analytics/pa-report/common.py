"""common.py — shared helpers: loading worlds, saving figures/tables, results.json I/O."""
import json
import math
from datetime import date, datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import config as C  # noqa: E402

DATASETS = ["gyms", "funnel_events", "members", "memberships", "attendance_logs"]


def world_dir(world):
    d = C.DATA / world
    d.mkdir(parents=True, exist_ok=True)
    return d


def write_csv(df, path):
    if str(path).endswith(".gz"):
        df.to_csv(path, index=False, compression={"method": "gzip", "mtime": 0})
    else:
        df.to_csv(path, index=False)


def load_world(world, with_attendance=True):
    d = world_dir(world)
    out = {}
    for name in DATASETS:
        if name == "attendance_logs" and not with_attendance:
            continue
        fn = d / (f"{name}.csv.gz" if name == "attendance_logs" else f"{name}.csv")
        out[name] = pd.read_csv(fn, low_memory=False)
    # parse the date-like columns we use downstream
    m = out["memberships"]
    for col in ["membership_start", "membership_end", "renewal_date", "alert_date"]:
        m[col] = pd.to_datetime(m[col])
    mem = out["members"]
    for col in ["start_date", "subscription_expiry", "last_seen"]:
        mem[col] = pd.to_datetime(mem[col])
    out["funnel_events"]["ts"] = pd.to_datetime(out["funnel_events"]["timestamp"].str[:19])
    if with_attendance:
        out["attendance_logs"]["date"] = pd.to_datetime(out["attendance_logs"]["date"])
    return out


# ── figures ──────────────────────────────────────────────────────────────────
def style():
    plt.rcParams.update({
        "figure.facecolor": "white", "axes.facecolor": "white", "savefig.facecolor": "white",
        "axes.edgecolor": "#444444", "axes.spines.top": False, "axes.spines.right": False,
        "axes.grid": True, "grid.color": "#E6E6E6", "grid.linewidth": 0.6, "axes.axisbelow": True,
        "font.size": 10, "axes.labelsize": 10, "xtick.labelsize": 9, "ytick.labelsize": 9,
        "legend.frameon": False, "legend.fontsize": 9,
        "axes.prop_cycle": matplotlib.cycler(color=[C.PALETTE[k] for k in ("primary", "secondary", "tertiary", "neutral", "danger")]),
    })


style()

FIGURES = []   # (filename, description) — collected for RESULTS.md


def savefig(fig, section, name, description):
    C.FIG.mkdir(parents=True, exist_ok=True)
    fn = f"fig_{section}_{name}.png"
    fig.tight_layout()
    fig.savefig(C.FIG / fn, dpi=C.DPI, facecolor="white", metadata={"Software": None})
    plt.close(fig)
    FIGURES.append((fn, description))
    return fn


def savetab(df, section, name):
    C.TAB.mkdir(parents=True, exist_ok=True)
    fn = f"tab_{section}_{name}.csv"
    df.to_csv(C.TAB / fn, index=False)
    return fn


# ── results.json ─────────────────────────────────────────────────────────────
def clean(obj, nd=4):
    """Make an object JSON-safe and deterministic (rounded floats, plain types)."""
    if isinstance(obj, dict):
        return {str(k): clean(v, nd) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v, nd) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, nd)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (date, datetime, pd.Timestamp)):
        return obj.isoformat()[:10]
    return obj


def load_results():
    if C.RESULTS_JSON.exists():
        return json.loads(C.RESULTS_JSON.read_text())
    return {}


def save_results(res):
    C.RESULTS_JSON.write_text(json.dumps(clean(res), indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def update_results(section, payload):
    res = load_results()
    res[section] = clean(payload)
    save_results(res)


def pct(x):
    return round(100.0 * float(x), 2)
