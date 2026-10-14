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
