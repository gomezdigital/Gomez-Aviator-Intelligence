# Gomez Aviator Intelligence — data format and test checklist

## CSV import format

Use a header row. Recommended columns:

```csv
timestamp,multiplier,round_id
2026-10-14T12:00:00Z,1.42,round-001
2026-10-14T12:01:00Z,2.35,round-002
2026-10-14T12:02:00Z,1.08,round-003
```

- `timestamp` should be the actual time the round result was observed. ISO 8601 timestamps with a timezone, such as `2026-10-14T12:00:00Z`, are recommended.
- `multiplier` must be a numeric multiplier greater than or equal to 1.00. A trailing `x` is accepted.
- `round_id` is optional and helps identify a round.
- CSV import accepts column names such as `multiplier`, `crash`, `result`, `odds`, `timestamp`, `datetime`, `date`, `round`, and `round_id`.
- If a timestamp is absent, the record can still be used in overall historical summaries, but it is excluded from the rolling 24-hour panel.
- Never assign a current timestamp to an old result. That would make the rolling-window analysis misleading.
- Exported files contain observations currently held by this dashboard. Keep a backup of important data.

## Manual collection workflow

1. Open the dashboard using a trusted browser.
2. After a round finishes, record its displayed multiplier and the observed time.
3. Save the record and periodically export the CSV as a backup.
4. If collecting many records, use the CSV template and keep the original round order.
5. Clearly separate genuine observed records from synthetic demo data.

The dashboard stores records in browser local storage. They do not automatically sync between phones, computers, browsers, or private browsing sessions.

## Initial quality checks

- [ ] Empty dataset shows empty states and no JavaScript error.
- [ ] CSV template downloads with the expected header.
- [ ] CSV with ISO timestamps imports valid multipliers.
- [ ] Invalid, empty, below-1.00, or non-numeric multipliers are rejected.
- [ ] A record with a timestamp inside the last 24 hours is included in the rolling window.
- [ ] A record older than 24 hours is excluded from the rolling window.
- [ ] A record without a timestamp is excluded from the rolling window but retained in overall statistics.
- [ ] Exported CSV can be re-imported without changing multipliers or timestamps.
- [ ] Clearing the dataset removes browser-saved records.
- [ ] Synthetic demo data is always labelled as synthetic.

## Research limitation

This project is an analysis and research dashboard, not a connection to the Aviator app and not an automated betting system. Historical frequencies describe supplied observations; they do not establish that the next crash point is knowable. Any future model must be evaluated chronologically on unseen data and compared with a baseline before its performance is described as useful.


## Chronological holdout research milestone

The Model Research panel now offers a 70/30 chronological holdout test when at least 50 valid observations are loaded.

- The earlier 70% estimates the overall target-hit rate and a Laplace-smoothed rate following the selected low-round streak.
- The later 30% is held out from fitting. Forecasts for each held-out observation use training-only estimates and the preceding observed rounds available at that point.
- The Brier score compares probabilistic forecasts with binary outcomes; lower is better. The streak rule is compared with a constant base-rate forecast fitted on the training segment.
- This is exploratory and can be unstable on small or non-independent data. It is not proof of predictability or a betting signal. A single split can be lucky; stronger research needs larger samples, rules chosen before testing, and repeated walk-forward evaluation.
- If every record has a timestamp, the dashboard sorts by timestamp before splitting. Otherwise, it preserves supplied row order; ensure the CSV is in actual chronological order.


## Expanding walk-forward validation

The Model Research panel includes a sequential walk-forward test for datasets with at least 100 valid observations. It begins after an initial history of at least 50 records (or the selected streak length plus two), then scores each subsequent forecast. At each forecast step, the overall target-hit baseline and the Laplace-smoothed conditional rate after a low streak are calculated from prior observations only. The model then observes the outcome and expands its history for the next step. Aggregate Brier scores and five chronological period checks are shown for the baseline and streak rule. Lower Brier scores are better, but these descriptive results do not prove predictability, establish a durable edge, or recommend a bet. Ensure records are in chronological order; fully timestamped datasets are sorted by timestamp, while untimestamped/mixed datasets preserve supplied row order.


## Data-quality and validation safeguards

The dashboard now reports basic data-quality flags: missing or invalid timestamps, timestamps in the future, timestamp order inversions in supplied rows, repeated timestamp+multiplier pairs, and duplicate round IDs. These are heuristics, not proof that a record is wrong. Identical multipliers alone are not considered duplicates because repeated values can occur naturally. Chronological holdout and walk-forward tests are paused when any supplied timestamp is invalid or materially in the future; correct the source data and re-import it. Records without timestamps remain usable only in their supplied row order, which the user must verify is chronological. The dashboard cannot authenticate a source, prove that the records are complete, or establish that observations are genuine game results.


## Research estimates and report exports

The experimental historical-rate panel calculates the observed proportion of supplied records reaching the selected target and an approximate 95% Wilson score interval. This interval summarizes uncertainty in a binomial sample; it is not a calibrated prediction interval for the next round and does not establish that future outcomes follow the same distribution. The research report CSV exports dataset size, timestamp coverage and range, descriptive rates, selected target/streak settings, visible holdout and walk-forward reports, quality flags, and an interpretation warning. Reports should retain the source dataset separately because the export summary cannot authenticate it.


## Phase 02 — Live data connector readiness

The dashboard does **not** currently connect to a live Aviator feed. The Live Data Connector panel records the prerequisites for a future integration without faking a connection. A real integration requires an authorized provider, documented API permissions/authentication, and usually a server-side relay so private credentials are not exposed in browser JavaScript or a public repository. The relay must validate source timestamps, deduplicate rounds, report feed age/errors, and preserve provenance.

The [official Aviator Studio Round History API documentation](https://docs.crash.aviator.studio/round-history/) describes authenticated provider access and IP allowlisting. It does not by itself grant this project access to Betway's player-facing results. Do not scrape private endpoints, bypass access controls, or put API secrets in this repository. Until an authorized source is approved and configured, data entry/import remains manual and the UI must continue to show **NOT CONNECTED**.
