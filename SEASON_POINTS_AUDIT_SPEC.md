# Season End Points Audit & Reconciliation System Specification

## 1) Purpose and Scope

This specification defines a system for auditing season-end point matrices (currently maintained in Google Sheets, optionally exported/imported as CSV) against the corresponding data in Firebase. The goal is to:

- Detect discrepancies between matrix-derived values and Firebase values.
- Handle periods where the "source of truth" changes over time (matrix authoritative in some windows, Firebase authoritative in others).
- Produce a clear, actionable discrepancy report for manual review.
- Support manual correction based on the user’s paper trail and preserve an audit history.

This is a **read-first audit + guided correction workflow**, not an automatic overwrite process.

---

## 2) Core Design Principles

1. **Time-aware authority**: Truth can switch by date range, event range, or season phase.
2. **Deterministic comparison**: The same inputs and rules always yield the same discrepancy output.
3. **Human-in-the-loop correction**: All proposed corrections are reviewed and approved manually.
4. **Traceability**: Every discrepancy and correction includes evidence and metadata.
5. **Non-destructive operation**: The audit process does not mutate production Firebase data unless explicitly instructed during correction.

---

## 3) Inputs and Data Sources

### 3.1 Matrix input (Google Sheets or CSV)

Support both modes:

- **Primary option**: Read directly from Google Sheets API.
- **Fallback/simpler option**: Import CSV exports from the same sheet tabs.

Recommended implementation path:

- Start with CSV ingestion for speed and reproducibility.
- Add optional Google Sheets connector later for convenience.

Matrix rows should resolve to a canonical record structure:

- `season_id`
- `event_id` (or `week_number` + `date`)
- `player_id` (or stable player key)
- `points_value`
- optional fields: `placement`, `bonuses`, `penalties`, `notes`
- matrix metadata: `matrix_version`, `sheet_tab`, `row_number`, `import_timestamp`

### 3.2 Firebase data input

Read from relevant collections/documents (exact schema mapped during implementation). Extract equivalent canonical fields:

- `season_id`
- `event_id`
- `player_id`
- `points_value`
- optional details and metadata
- Firebase metadata: `doc_path`, `doc_id`, `last_updated`, `updated_by` (if available)

### 3.3 Authority timeline configuration

Create an explicit configuration that determines which source is authoritative by timeframe.

Example config shape (YAML/JSON):

- `season_id`
- `segments[]` where each segment defines:
  - match rule: date range and/or event range
  - `authority`: `MATRIX` or `FIREBASE`
  - optional rationale/comment (e.g., "scoring algorithm changed after week 8")

This configuration is critical and should be version-controlled.

---

## 4) Canonical Data Model and Normalization

Before comparing, normalize both sources to the same canonical schema.

### 4.1 Key harmonization

- Map player names/aliases to stable `player_id` (mapping table maintained in config).
- Normalize event identifiers (e.g., date vs numeric week).
- Normalize numeric formats (integers/decimals, null handling).

### 4.2 Identity key for comparison

Use a deterministic composite key:

`(season_id, event_id, player_id)`

Each key should map to at most one matrix record and one Firebase record after normalization. If duplicates exist in either source, emit a **data integrity warning** before standard comparison.

### 4.3 Validation checks before diff

Run pre-checks and fail fast (or mark run as partial) if severe issues occur:

- Missing required keys
- Unmappable players/events
- Duplicate keys per source
- Invalid points types

---

## 5) Comparison Logic

### 5.1 Record pairing

Perform a full outer join by composite key to classify each pair:

1. Present in both sources
2. Present only in Matrix
3. Present only in Firebase

### 5.2 Field-level comparison

For records present in both, compare:

- `points_value` (primary)
- optional derived/auxiliary fields if relevant

Classify outcome per key:

- `MATCH`
- `MISMATCH_VALUE`
- `MISSING_IN_MATRIX`
- `MISSING_IN_FIREBASE`
- `CONFLICT_DUPLICATE`
- `UNMAPPABLE`

### 5.3 Authority-aware interpretation

For each discrepancy, determine expected direction based on timeline authority:

- If authority is `MATRIX`, Firebase differences are candidates for Firebase correction.
- If authority is `FIREBASE`, matrix differences are candidates for matrix correction/update.

Do **not** auto-correct. Produce recommendation only.

---

## 6) Output Artifacts (Discrepancy Reporting)

Generate three output layers for different audiences.

### 6.1 Machine-readable full diff (JSON)

Contains every key and comparison result, including metadata and authority decision.

Suggested fields:

- `run_id`, `run_timestamp`, `season_id`
- `composite_key`
- `matrix_record` snapshot
- `firebase_record` snapshot
- `diff_type`
- `field_diffs[]`
- `authority_at_time`
- `recommended_action`
- `confidence` / `needs_manual_review`

### 6.2 Analyst-friendly report (CSV)

One row per discrepancy with concise columns:

- Season, event, player
- Matrix points
- Firebase points
- Difference
- Authority source
- Recommended correction target
- Notes placeholder for reviewer
- Paper-trail reference column

### 6.3 Human-readable summary (Markdown/HTML)

Include:

- Total records compared
- Match rate
- Discrepancy counts by type
- Top problematic events/players
- Integrity warnings
- Next-step checklist for manual review

---

## 7) Manual Review and Correction Workflow

Because paper trail exists and authority may vary, use a review queue.

### 7.1 Review queue structure

Persist discrepancy items in a dedicated collection/table (e.g., `audit_discrepancies`) with statuses:

- `NEW`
- `IN_REVIEW`
- `RESOLVED_APPLIED`
- `RESOLVED_NO_CHANGE`
- `ESCALATED`

Include reviewer fields:

- `reviewer`
- `review_timestamp`
- `paper_trail_reference` (scan id, notebook page, etc.)
- `decision_notes`

### 7.2 Decision options per discrepancy

Reviewer can choose:

1. Accept recommended correction (based on authority).
2. Override recommendation (paper trail indicates exception).
3. Mark as expected historical anomaly (no correction).
4. Escalate for rule/config update.

### 7.3 Applying corrections safely

When a correction is approved:

- Write change via controlled script/tooling.
- Record before/after values.
- Record who approved and why.
- Store transaction log in `audit_corrections`.

If possible, use Firebase batched writes/transactions for consistency.

---

## 8) Handling Changing Ground Truth Over Time

This is the key requirement; implement explicit rule layers:

1. **Global default authority** per season.
2. **Segment overrides** by date/event range.
3. **Exception list** for specific composite keys.

Resolution precedence:

`Exception > Segment override > Season default`

Every discrepancy should carry an `authority_resolution_trace` showing which rule was used. This makes audits explainable when logic changes.

Recommended governance:

- Keep authority config in version control.
- Require comment/rationale for each override.
- Re-run historical audits when config changes.

---

## 9) Suggested Implementation Architecture

A practical, incremental architecture:

1. **Ingestion module**
   - CSV reader now; Sheets adapter later.
   - Firebase extractor.
2. **Normalizer module**
   - ID mappings, schema harmonization.
3. **Comparator module**
   - Join + diff classification + authority evaluation.
4. **Reporter module**
   - JSON + CSV + Markdown outputs.
5. **Review/apply module**
   - Queue management + controlled correction writes.

Run modes:

- `audit-only` (default)
- `audit-and-stage` (populate review queue)
- `apply-approved` (execute approved corrections only)

---

## 10) Operational Workflow

1. Export latest matrix CSVs (or pull from Sheets).
2. Run audit for season and target event range.
3. Publish discrepancy outputs.
4. Review discrepancies with paper trail.
5. Approve and apply selected corrections.
6. Re-run audit to confirm zero unresolved critical discrepancies.
7. Archive run artifacts and logs.

Schedule options:

- Ad hoc during backfill cleanup.
- Nightly during active reconciliation period.
- Pre-season-finalization mandatory run.

---

## 11) Data Quality and Edge Cases

Must explicitly handle:

- Player renamed mid-season.
- Event canceled/rescheduled with reused identifiers.
- Fractional vs integer points drift.
- Tie handling rule changes.
- Late corrections in one source only.
- Duplicate Firebase docs from previous app versions.

For each edge case, create test fixtures and expected outcomes.

---

## 12) Testing Strategy

### 12.1 Unit tests

- Normalization rules (IDs, numeric coercion).
- Authority resolution precedence.
- Diff classification logic.

### 12.2 Integration tests

- End-to-end audit run using fixture CSV + fixture Firebase export.
- Verify report outputs and counts.

### 12.3 Regression tests

- Known historical discrepancy scenarios from the paper trail.
- Ensure previously resolved logic remains stable after rule updates.

---

## 13) Security and Access

- Use service account credentials with least privilege read access for audit-only runs.
- Restrict correction apply mode to privileged operators.
- Log all correction actions and retain immutable audit logs.
- Redact sensitive fields in shared reports if needed.

---

## 14) Recommended First Milestone (Fastest Path)

1. Define canonical schema and key mapping table.
2. Implement CSV + Firebase ingestion.
3. Implement authority config with segment overrides.
4. Generate discrepancy CSV + Markdown summary.
5. Manually apply corrections using existing process.

This delivers immediate value without waiting for full UI automation.

---

## 15) Example Discrepancy Row (Conceptual)

- Key: `(2025, Event_12, player_abc)`
- Matrix points: `42`
- Firebase points: `39`
- Authority resolved: `MATRIX` (segment: events 10–14)
- Recommended action: update Firebase to `42`
- Reviewer: checks paper log, confirms matrix was corrected after bugfix, approves apply
- Final status: `RESOLVED_APPLIED` with transaction id and timestamp

---

## 16) Implementation Notes on Google Sheets vs CSV

Given current state (matrices in Google Sheets):

- If speed and reliability are priority, use **CSV exports first**.
- If reducing manual steps is priority, add **Google Sheets API connector** once core logic is stable.

A hybrid approach works well:

- Primary ingestion from Sheets API.
- Automatic snapshot export to versioned CSV for reproducibility and rollback.

