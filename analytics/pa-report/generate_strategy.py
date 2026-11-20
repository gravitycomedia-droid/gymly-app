"""
generate_strategy.py — 4.6: the post-strategy synthetic world.

Same engine and seeds as generate_baseline.py, with the three interventions in
config.STRATEGY switched on from 2026-01-01:
  1. bulk CSV member import + onboarding checklist (owner funnel + roster entry speed)
  2. automated WhatsApp renewal reminders at expiry -7d / -1d / +3d
  3. at-risk alert to the owner after 10+ days with no check-in
"""
from generate_baseline import build_world

if __name__ == "__main__":
    build_world(strategy=True)
