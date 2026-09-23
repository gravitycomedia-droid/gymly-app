# Building the GA4 report for the MSc review

Property `gymly-app-06` · Measurement ID `G-6XXNPM9R3Y`
Custom dimensions: registered ✅

Reports need data, and data only exists from the moment the app is deployed and
people use it. Realtime works within seconds; standard reports and Explorations
lag 24–48h. Plan around that.

---

## The four artefacts to submit

A product-analytics review wants **findings**, not screenshots of counters.
Each artefact below answers a question.

### A. Activation funnel — "where do new gyms drop off?"

The single most persuasive exhibit. Shows you can instrument a journey and read
a failure point out of it.

1. Left nav → **Explore** → **Blank**
2. Technique (top left) → **Funnel exploration**
3. Under *Steps*, click the pencil ✏️ and build:

   | Step | Event |
   |---|---|
   | 1 | `sign_up` |
   | 2 | `gym_setup_completed` |
   | 3 | `member_added` |
   | 4 | `feature_first_use` |

4. Toggle **Make open funnel** off (a closed funnel enforces the order)
5. *Breakdown* → drag in **Plan tier** to see whether paid gyms activate better
6. *Show elapsed time* → **on**, to expose where users stall

**What to write:** the biggest percentage drop between two steps is your
finding. "42% of gyms that sign up never complete setup" is an insight. Follow
it with a hypothesis and a proposed fix — that is what earns the marks.

### B. Event volume — "what is actually being used?"

1. **Reports** → *Engagement* → **Events**
2. Confirm your seven custom events appear alongside GA4's built-ins

**What to write:** the ratio between events. `member_added` far exceeding
`dues_recorded` says gyms use Gymloop as a roster first and a billing tool
second — a positioning insight.

### C. Segmentation — "do different customers behave differently?"

1. **Explore** → **Blank** → technique **Free form**
2. *Rows*: **Plan tier** (or **User role**)
3. *Values*: `Active users`, `Event count`
4. Add a second tab with *Rows*: **Feature name**, filtered to
   `feature_first_use`, to rank which paid features get adopted

**What to write:** which plan tier adopts which feature. Direct input to
packaging and pricing.

### D. Behaviour flow — "what do people actually do after logging in?"

1. **Explore** → **Blank** → technique **Path exploration**
2. Starting point → **Event name** → `login`
3. Expand two or three nodes

**What to write:** whether real navigation matches the journey you designed.
Divergence is a usability finding.

---

## Exporting

Any report or Exploration → **share icon, top right** → *Download file* →
**PDF** (or CSV / export to Google Sheets).

Worth including alongside the charts:

- A **DebugView screenshot** — evidence the instrumentation is genuinely live
  rather than mocked up
- The **events table** from `ANALYTICS.md` — shows a deliberate tracking plan
- A note on **privacy design**: no PII collected, IDs redacted from page paths,
  amounts bucketed. Examiners on a product-analytics module notice this, and
  most student submissions ignore it entirely

---

## If there is not enough data by review day

Be straight about it rather than padding. A short, honest section reads far
better than a thin chart:

- Show the **tracking plan** (the event table and param contracts)
- Show **DebugView** proving events fire correctly end to end
- Show whatever **Realtime** data exists
- State the collection window explicitly: "instrumentation deployed 23 Sep;
  data reflects N days and M active gyms"
- Describe what you *would* analyse with a full quarter of data

Demonstrating you built a correct measurement system is itself the deliverable.
A funnel over three days of real data beats a prettier chart over fabricated
data, and it is defensible under questioning.
