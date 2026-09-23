# GYMLOOP — Register Import (Paper / Excel → Members)

**Mode:** Recon → Build, gated.
**Scope:** New onboarding feature that converts photographed paper registers and spreadsheet exports into reviewed, approved member records.
**You may not write code until GATE 1 is cleared.**

---

## 0. PINNED TRAPS — re-read before every part

| ID | Trap |
|----|------|
| **T-1** | `batch.add()` does not exist in Firestore. Generate a ref with `db.collection(...).doc()`, then `batch.set(ref, data)`. |
| **T-2** | Staff and member docs are created with `addDoc()`, so their doc IDs are **random strings, not Auth UIDs**. Only owner docs live at `users/{uid}`. All access control is `gym_id` scoping, never UID matching. |
| **T-3** | **No LLM call from the client, ever.** Any `VITE_`-prefixed env var is bundled into public JS. The API key lives in Secret Manager and is read only inside Cloud Functions. |
| **T-4** | CollectionGroup indexes must be deployed and confirmed **green in Firebase Console** before any dependent function is deployed. Deploying functions first causes silent `FAILED_PRECONDITION`. |
| **T-5** | Cloud Functions are **CommonJS only**. No TypeScript, no `.ts` files, no ESM `import`. |
| **T-6** | **Do not add a Cloud Scheduler job.** Scheduler is billed per existence, not per run. Use a Firestore `onDocumentCreated` trigger or Cloud Tasks for the job queue. |
| **T-7** | Storage rules must check `request.auth.token.gym_id` (custom JWT claim). Do **not** use `firestore.get()` in Storage rules — it returns null before token refresh completes. |
| **T-8** | Nothing is written to the live `members` collection until a human approves it. Extraction output goes to a staging subcollection only. |
| **T-9** | The model must **never** normalize phone numbers, dates or amounts. It returns raw transcribed strings plus confidence. Parsing and validation happen in deterministic JS. |
| **T-10** | Legacy enrolment and serial numbers are **not unique and not reliable**. Never use them as a doc ID, never enforce uniqueness on them. Store them as indexed searchable strings only. |
| **T-11** | Always deploy with `firebase deploy --only <target>`. Never a bare `firebase deploy`. |
| **T-12** | Deploy order is: indexes green → functions → tighten rules. Never tighten rules first. |

---

## 1. NON-GOALS — do not build these

- ❌ Any change to the existing member creation UI or the existing `members` schema beyond the additive fields in Part 2.
- ❌ Bulk WhatsApp messaging to imported members.
- ❌ Automatic member activation, plan assignment, or payment record creation from imported data.
- ❌ Sending spreadsheet files or spreadsheet rows to the LLM. Spreadsheets are parsed locally (Part 6).
- ❌ Any cross-gym or chain-wide import.
- ❌ Streaming responses, real-time progress sockets, or optimistic UI. Polling a status field is sufficient.
- ❌ Refactoring Settings, navigation, or anything in the in-flight Owner v2 redesign.

---

## 2. GATE 1 — RECONNAISSANCE (READ-ONLY)

**Write no code in this part.** Read `AGENTS.md`, `SECURITY_STATUS.md` and `EFFICIENCY.md` first, then produce the capture table below.

Investigate and report:

1. **Member schema.** Exact field names, types and optionality on a `members` doc. Which fields are required at creation. Where the creation path lives (file + function name).
2. **Phone handling.** Is phone number treated as unique anywhere? Is there an existing normalization helper? Is it used as a lookup key for attendance, WhatsApp or kiosk?
3. **Role & permission helper.** The canonical function/hook used to check whether the current user may write member data, and where it lives.
4. **Storage.** Current bucket structure, existing `storage.rules`, and whether any upload path already exists client-side.
5. **Secrets.** How Cloud Functions currently read secrets (Secret Manager, `functions.config()`, or env). Report the exact existing pattern — do not introduce a second one.
6. **Existing indexes.** Contents of `firestore.indexes.json` and any collectionGroup indexes already declared.
7. **Existing import code.** Any partial CSV/Excel import, member bulk-add, or file-parsing code already in the repo.
8. **Usage/quota precedent.** Any existing per-gym counter or usage doc pattern (from the Firebase cost work) that this feature should reuse rather than reinvent.

**Capture format:**

```
### <Area>
- Path:
- Current behaviour:
- Fields / signature:
- Risk or conflict with this feature:
```

Finish with a **Conflicts & Surprises** list: anything above that contradicts this prompt. If a conflict exists, state it and stop.

### 🚦 GATE 1
Post the recon report. **Wait for my approval before Part 3.**

---

## 3. DATA MODEL

Additive only. Do not modify existing member fields.

**New fields on `members` docs** (all optional, written only by the import commit):
- `legacy_enrollment_no` — string, indexed, searchable. Not unique.
- `legacy_serial_no` — string, indexed. Not unique.
- `import_batch_id` — string, nullable.
- `source` — string enum: `manual | import_register | import_sheet`. Default `manual` for existing records (do **not** backfill; treat missing as `manual` in code).

**New staging structure:**

```
gyms/{gym_id}/import_batches/{batch_id}
  createdBy, createdAt, status, sourceType, pageCount,
  layoutSchema, stats{extracted, approved, rejected, committed},
  ownerAttestation{confirmedBy, confirmedAt, hasMinors}

gyms/{gym_id}/import_batches/{batch_id}/pages/{page_id}
  storagePath, imageHash, status (queued|processing|done|failed),
  attempts, lastError, tokensIn, tokensOut, processedAt

gyms/{gym_id}/import_batches/{batch_id}/rows/{row_id}
  pageId, rowIndex,
  raw{name, phone, enrollment, serial, joinedOn, plan, amount, notes},
  parsed{name, phone, enrollmentNo, serialNo, joinedOn},
  confidence{<field>: 0..1},
  flags[] (low_confidence | invalid_phone | ambiguous_date | possible_duplicate | possible_minor),
  duplicateOf (row_id|null),
  status (pending|approved|rejected|committed),
  idempotencyKey, reviewedBy, reviewedAt, memberId
```

**Quota doc:** `gyms/{gym_id}/usage/import_quota` — `{ month, pagesProcessed, cap, updatedAt }`. Reuse the existing counter pattern found in recon item 8.

### 🚦 GATE 2
Show the schema diff and the `firestore.indexes.json` additions required (`legacy_enrollment_no`, `legacy_serial_no`, and any composite needed for the review UI's row queries). **Deploy indexes and confirm green in console before Part 4.**

---

## 4. BACKEND — extraction pipeline (CommonJS)

Create `functions/services/` modules. Keep each single-purpose.

### 4.1 Provider adapter — `visionExtractor.js`
- Single exported function `extractPage({ imageBuffer, layoutSchema })`.
- Provider selected by secret `LLM_PROVIDER`; implement Gemini Flash tier first. All provider specifics stay inside this file so the model can be swapped without touching callers.
- Hard caps: `max_output_tokens`, and a `maxRows` guard — if the model returns more than 60 rows for one page, mark the page `failed` with `lastError: 'row_count_implausible'` rather than trusting it.
- Return `{ rows, tokensIn, tokensOut }`. No side effects, no Firestore writes.

### 4.2 Callable: `createImportBatch`
- Verifies caller role (Owner or Manager) and `gym_id` from custom claims.
- Requires `ownerAttestation` in the payload (see Part 5.1). Rejects without it.
- Creates the batch doc, returns `batch_id` and signed upload targets.

### 4.3 Firestore trigger: `onImportPageCreated`
Fires on `gyms/{gym_id}/import_batches/{batch_id}/pages/{page_id}` create.

Order of operations, strictly:
1. **Quota check in a transaction.** Read `import_quota`; if `pagesProcessed >= cap`, set page `status: failed`, `lastError: 'quota_exceeded'`, return. Increment inside the same transaction.
2. **Hash check.** If `imageHash` already has a completed page in this gym, copy its rows and return without calling the model. Log `cacheHit: true`.
3. **Concurrency gate.** Count sibling pages with `status: processing`. If ≥ 3, leave the page `queued` and return; a completing page picks up the next queued sibling.
4. **Layout schema.** If `batch.layoutSchema` is null, run the schema-discovery call on this page first (columns present, column order, date format, name script), persist it to the batch doc, then proceed. Every subsequent page reuses it. One discovery call per batch, never per page.
5. **Extract** via `visionExtractor`.
6. **Normalize in JS** (`normalizeRow.js`): phone must reduce to 10 digits starting 6-9 after stripping spaces, `+91`, and common OCR confusions (`O→0`, `l/I→1`, `S→5`); otherwise flag `invalid_phone` and leave `parsed.phone` null. Dates parse using the batch's inferred format only, never per-row guessing; unparseable → flag `ambiguous_date`. Never invent a value to fill a field.
7. **Write rows** in batches of ≤ 450 (T-1).
8. Update page status and token counters.

**Retries:** exponential backoff with jitter, max 3 attempts, on 429/5xx only. Never retry inside the request handler — increment `attempts` and re-queue. After 3, `status: failed` for manual retry of that single page.

### 4.4 Callable: `resolveDuplicates`
- Deterministic first: block on normalized phone, exact match → `possible_duplicate` with high confidence.
- Then fuzzy: lowercase, strip honorifics (Mr/Mrs/Shri/Smt) and standalone initials, token-sort, trigram similarity. Above the high threshold → auto-flag. Below the low threshold → ignore.
- **Only the ambiguous middle band** goes to the model, batched, text-only, max 20 clusters per call: "same person? yes / no / unsure". `unsure` always routes to the human.

### 4.5 Callable: `commitImportBatch`
- Rejects unless every row is `approved` or `rejected`.
- Writes approved rows to `members` in chunks of ≤ 450 using T-1 pattern.
- Uses `idempotencyKey` per row so a retried commit cannot double-create.
- Writes an audit entry: who committed, when, row counts.
- Schedules image deletion (Part 4.6) — do not delete inline.

### 4.6 Retention
- Register images are deleted 30 days after batch commit. Implement as a check inside an **existing** daily function (T-6), not a new scheduler job. Report which existing function you attached it to.

### 🚦 GATE 3
Show the full diff for `functions/`. **Do not deploy until I approve the diff.** Then `firebase deploy --only functions:<names>`.

---

## 5. FRONTEND — capture and review

### 5.1 Upload step
- Camera capture guidance: one page per photo, landscape, fill the frame.
- **Client-side preprocess before upload:** downscale longest edge to 1500px, grayscale, JPEG q80. Compute SHA-256 of the processed image for `imageHash`.
- **Attestation gate** before any upload is allowed, as a required checkbox pair:
  - "I confirm this gym collected these member details and has the right to upload them."
  - "This register does / does not include members under 18." → sets `hasMinors`.
- Show the quota remaining for the month.

### 5.2 Review screen
- Page image on one side, extracted rows on the other. Row currently focused is highlighted by `rowIndex`.
- Fields below confidence threshold rendered in a warning state; `flags` shown as chips.
- Bulk actions: approve page, approve all rows above threshold.
- Duplicate clusters shown grouped with a merge/keep-both choice.
- Nothing is approvable while a required field is null.
- Progress: `{n} of {m} rows reviewed`, polled from the batch doc.

### 5.3 Post-commit
- Summary: created, skipped, merged.
- Link to the member list filtered by `import_batch_id`.

### 🚦 GATE 4
Show the component diff and confirm no client-side write to `members` was introduced. **Wait for approval.**

---

## 6. SPREADSHEET PATH (no vision model)

- Parse `.xlsx` / `.csv` locally in the browser.
- Column mapping UI: detected headers → member fields, user confirms.
- Optional single text-only LLM call passing **only the header row plus 5 sample rows** to suggest a mapping, which the user must confirm. Never send the full sheet.
- Rows land in the same staging structure and reuse the same review screen and commit path.

---

## 7. RULES & DEPLOY

- Firestore rules: `import_batches` and descendants readable/writable only where `request.auth.token.gym_id` matches the path segment and role is Owner or Manager. Members and Trainers have no access.
- Storage rules: `gyms/{gym_id}/imports/**` gated on the `gym_id` JWT claim (T-7). Max file size 5 MB, image content types only.
- Run `npx firebase-tools rules:check` before any rules deploy.
- Deploy sequence: indexes green → `--only functions:<names>` → `--only firestore:rules` → `--only storage`.

### 🚦 GATE 5
Show rules diff and `rules:check` output. **Wait for approval before deploying rules.**

---

## 8. ACCEPTANCE CRITERIA

- [ ] No LLM call originates from client code; no key appears in the Vite bundle (verify with a production build grep).
- [ ] Exactly one schema-discovery call per batch, verified in the token log.
- [ ] Re-uploading an identical photo produces zero model calls and logs `cacheHit: true`.
- [ ] Exceeding the page cap fails the page cleanly with `quota_exceeded` and no model call.
- [ ] No more than 3 pages in `processing` at any moment.
- [ ] A page failing 3 times leaves the rest of the batch intact and retryable alone.
- [ ] Every phone number in `parsed` is 10 digits starting 6-9, or null with `invalid_phone`.
- [ ] No row reaches `members` without `status: approved` and a `reviewedBy`.
- [ ] Running `commitImportBatch` twice creates no duplicate members.
- [ ] Duplicate enrolment numbers across rows do not block import.
- [ ] `batch.add()` appears nowhere in the diff.
- [ ] No new Cloud Scheduler job exists after deploy (verify in GCP console).
- [ ] Upload is blocked until both attestation checkboxes are set.
- [ ] Batch doc records `hasMinors`, and rows in a `hasMinors` batch carry the `possible_minor` flag for manual handling.
- [ ] Register images are deleted 30 days post-commit by an existing scheduled function.
- [ ] An audit entry exists for batch creation, approval and commit.
- [ ] A 30-row test page extracts with ≥ 90% of fields requiring no manual correction on a legible register.

---

## 9. REPORT BACK

At the end, produce:
1. Token cost measured per page on the test register, and extrapolated cost for a 300-member gym.
2. Field-level accuracy on the test pages (correct / corrected / missed).
3. Any trap above that the existing codebase made difficult to honour.
