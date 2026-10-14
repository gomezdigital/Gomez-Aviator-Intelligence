/* GOMEZ AVIATOR INTELLIGENCE — statistical research engine
 * No live-game connection, betting automation, or guaranteed prediction.
 * Timestamped history can be imported from CSV or entered manually.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "gomezAviatorIntelligence.records.v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const $ = (id) => document.getElementById(id);
  let records = [];
  let dataSource = "No dataset loaded";
  let invalidRows = 0;
  let lastResearchRun = null;

  function safeNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const cleaned = String(value ?? "").trim().replace(/,/g, "").replace(/[×x]$/i, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function fmtMultiplier(n) {
    return Number(n).toFixed(2) + "×";
  }

  function fmtPercent(n) {
    return Number.isFinite(n) ? n.toFixed(2) + "%" : "—";
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function validRecord(multiplier, timestamp, round) {
    const m = safeNumber(multiplier);
    if (m === null || m < 1 || m > 100000000) return null;
    let time = null;
    const timestampProvided = timestamp !== null && timestamp !== undefined && String(timestamp).trim() !== "";
    let timestampIssue = false;
    if (timestampProvided) {
      const rawTime = String(timestamp).trim();
      const numericTime = /^\d{10,13}$/.test(rawTime) ? Number(rawTime) : null;
      time = numericTime !== null
        ? (rawTime.length === 10 ? numericTime * 1000 : numericTime)
        : new Date(rawTime).getTime();
      if (!Number.isFinite(time)) { time = null; timestampIssue = true; }
    }
    return {
      round: round || null,
      multiplier: m,
      timestamp: time,
      timestampProvided,
      timestampIssue
    };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      setText("quality-message", "Data is active in this tab, but browser storage is unavailable.");
    }
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved)) {
        records = saved.map((r) => {
          const rec = validRecord(r.multiplier, r.timestamp, r.round);
          if (rec) {
            rec.timestampIssue = Boolean(r.timestampIssue);
            rec.timestampProvided = Boolean(r.timestampProvided || r.timestampIssue || r.timestamp !== null);
          }
          return rec;
        }).filter(Boolean);
        if (records.length) dataSource = "Saved browser records";
      }
    } catch (_) {
      records = [];
    }
  }

  function setText(id, text) {
    const node = $(id);
    if (node) node.textContent = text;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        row.push(cell.trim()); cell = "";
      } else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell.trim()); cell = "";
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    if (row.some((v) => v !== "")) rows.push(row);
    if (!rows.length) return { parsed: [], invalid: 0 };

    const normal = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const first = rows[0].map(normal);
    const multNames = ["multiplier", "crash", "result", "odds", "x", "value", "coefficient"];
    const timeNames = ["timestamp", "datetime", "date", "time", "createdat", "roundtime"];
    const roundNames = ["round", "roundid", "id", "roundnumber"];
    let mi = first.findIndex((v) => multNames.includes(v));
    let ti = first.findIndex((v) => timeNames.includes(v));
    let ri = first.findIndex((v) => roundNames.includes(v));
    let start = 0;
    if (mi >= 0) start = 1;
    else mi = 0;
    const parsed = [];
    let invalid = 0;
    for (let i = start; i < rows.length; i++) {
      const row = rows[i];
      const multiplier = row[mi];
      const timestamp = ti >= 0 ? row[ti] : null;
      const round = ri >= 0 ? row[ri] : String(i - start + 1);
      const rec = validRecord(multiplier, timestamp, round);
      if (rec) parsed.push(rec);
      else invalid++;
    }
    return { parsed, invalid };
  }

  function visibleRecords() {
    // Preserve imported row order when timestamps are absent or mixed; sort by time only
    // when every record has a valid timestamp, which avoids an inconsistent comparator.
    const copy = records.slice();
    if (copy.length && copy.every((r) => r.timestamp !== null)) {
      copy.sort((a, b) => a.timestamp - b.timestamp);
    }
    return copy;
  }

  function duplicateTimestampCount() {
    const seen = new Set();
    let duplicates = 0;
    records.forEach((r) => {
      if (r.timestamp === null) return;
      const key = String(r.timestamp) + "|" + String(r.multiplier);
      if (seen.has(key)) duplicates++;
      else seen.add(key);
    });
    return duplicates;
  }

  function dataQualityReport() {
    const missingTimestamps = records.filter((r) => r.timestamp === null && !r.timestampIssue).length;
    const invalidTimestamps = records.filter((r) => r.timestampIssue).length;
    const futureTimestamps = records.filter((r) => r.timestamp !== null && r.timestamp > Date.now() + 60000).length;
    const timestamped = records.filter((r) => r.timestamp !== null);
    let orderInversions = 0;
    for (let i = 1; i < timestamped.length; i++) {
      if (timestamped[i].timestamp < timestamped[i - 1].timestamp) orderInversions++;
    }
    const seenRounds = new Set();
    let duplicateRoundIds = 0;
    records.forEach((r) => {
      if (r.round === null || String(r.round).trim() === "") return;
      const key = String(r.round).trim().toLowerCase();
      if (seenRounds.has(key)) duplicateRoundIds++;
      else seenRounds.add(key);
    });
    return {
      missingTimestamps,
      invalidTimestamps,
      futureTimestamps,
      orderInversions,
      duplicateTimestampPairs: duplicateTimestampCount(),
      duplicateRoundIds,
      timestampCoverage: records.length ? timestamped.length / records.length : 0,
      hasSeriousIssues: invalidTimestamps > 0 || futureTimestamps > 0
    };
  }

  function qualitySummaryText(q) {
    const warnings = [];
    if (q.invalidTimestamps) warnings.push(q.invalidTimestamps + " invalid timestamp(s)");
    if (q.futureTimestamps) warnings.push(q.futureTimestamps + " future timestamp(s)");
    if (q.missingTimestamps) warnings.push(q.missingTimestamps + " missing timestamp(s)");
    if (q.orderInversions) warnings.push(q.orderInversions + " timestamp order inversion(s) in supplied rows");
    if (q.duplicateTimestampPairs) warnings.push(q.duplicateTimestampPairs + " repeated timestamp+multiplier pair(s)");
    if (q.duplicateRoundIds) warnings.push(q.duplicateRoundIds + " duplicate round ID(s)");
    if (!records.length) return "Waiting for data";
    return records.length + " record(s). " + (warnings.length ? "Quality flags: " + warnings.join("; ") + "." : "No basic timestamp/ID flags detected.") +
      " These checks cannot verify the source or authenticity of the records.";
  }

  function csvEscape(value) {
    const s = String(value ?? "");
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadTemplate() {
    downloadCsv("gomez-aviator-history-template.csv", [
      ["timestamp", "multiplier", "round_id"],
      [new Date().toISOString(), "1.42", "example-001"]
    ]);
    setText("quality-message", "CSV template downloaded. Replace the example row with real observed outcomes; keep timestamps and multipliers paired.");
  }

  function exportRecords() {
    if (!records.length) {
      setText("quality-message", "There are no records to export yet.");
      return;
    }
    const rows = [["timestamp", "multiplier", "round_id"]];
    visibleRecords().forEach((r, i) => rows.push([
      r.timestamp !== null ? new Date(r.timestamp).toISOString() : "",
      r.multiplier,
      r.round || (i + 1)
    ]));
    downloadCsv("gomez-aviator-history.csv", rows);
    setText("quality-message", "Exported " + records.length + " record(s) as CSV.");
  }

  function last24Hours() {
    const cutoff = Date.now() - DAY_MS;
    return records.filter((r) => r.timestamp !== null && r.timestamp >= cutoff && r.timestamp <= Date.now());
  }

  function drawChart(data) {
    const canvas = $("distribution-chart");
    if (!canvas) return;
    const empty = $("chart-empty");
    if (empty) empty.style.display = data.length ? "none" : "grid";
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || 500));
    const height = 260;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const labels = ["1–1.49×", "1.5–1.99×", "2–2.99×", "3–4.99×", "5–9.99×", "10×+"];
    const counts = [0, 0, 0, 0, 0, 0];
    data.forEach((r) => {
      const m = r.multiplier;
      const idx = m < 1.5 ? 0 : m < 2 ? 1 : m < 3 ? 2 : m < 5 ? 3 : m < 10 ? 4 : 5;
      counts[idx]++;
    });
    const pad = { top: 18, right: 12, bottom: 48, left: 36 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max(1, ...counts);
    ctx.font = "11px DM Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + plotH * i / 4;
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
      ctx.fillStyle = "#8f929c";
      ctx.fillText(String(Math.round(max * (4 - i) / 4)), pad.left - 8, y);
    }
    const gap = Math.max(7, plotW * 0.025);
    const barW = (plotW - gap * (counts.length - 1)) / counts.length;
    counts.forEach((count, i) => {
      const barH = (count / max) * (plotH - 5);
      const x = pad.left + i * (barW + gap);
      const y = pad.top + plotH - barH;
      ctx.fillStyle = "#ff8a32";
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath(); ctx.roundRect(x, y, Math.max(2, barW), Math.max(2, barH), 4); ctx.fill();
      } else ctx.fillRect(x, y, Math.max(2, barW), Math.max(2, barH));
      ctx.fillStyle = "#e7e7eb";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(labels[i], x + barW / 2, height - pad.bottom + 13);
    });
  }

  function updateMetrics(data) {
    const values = data.map((r) => r.multiplier);
    setText("metric-rounds", values.length.toLocaleString());
    setText("metric-median", values.length ? fmtMultiplier(median(values)) : "—");
    setText("metric-two", values.length ? fmtPercent(values.filter((v) => v >= 2).length / values.length * 100) : "—");
    setText("metric-ten", values.length ? fmtPercent(values.filter((v) => v >= 10).length / values.length * 100) : "—");
    setText("dataset-label", dataSource);
    setText("records-count", records.length + (records.length === 1 ? " RECORD" : " RECORDS"));
    setText("baseline-status", values.length ? "Descriptive baseline calculated from " + values.length + " supplied rounds" : "Waiting for data");
    setText("baseline-pill", values.length ? "CALCULATED" : "NOT RUN");
    const q = dataQualityReport();
    setText("quality-message", values.length
      ? qualitySummaryText(q) + " " + invalidRows + " invalid CSV row(s) skipped."
      : "Waiting for data");
    render24HourSummary();
    renderRecords(data);
    updateDatasetProfile();
    drawChart(data);
    updateProbability();
  }

  function render24HourSummary() {
    const panel = $("rolling24-panel");
    if (!panel) return;
    const recent = last24Hours();
    const now = Date.now();
    const stampedCount = records.filter((r) => r.timestamp !== null && r.timestamp <= now).length;
    setText("rolling24-count", recent.length.toLocaleString());
    setText("rolling24-two", recent.length ? fmtPercent(recent.filter((r) => r.multiplier >= 2).length / recent.length * 100) : "—");
    setText("rolling24-ten", recent.length ? fmtPercent(recent.filter((r) => r.multiplier >= 10).length / recent.length * 100) : "—");
    setText("rolling24-median", recent.length ? fmtMultiplier(median(recent.map((r) => r.multiplier))) : "—");
    setText("rolling24-window", recent.length
      ? "Window: " + new Date(now - DAY_MS).toLocaleString() + " to " + new Date(now).toLocaleString()
      : "No timestamped records from the last 24 hours. Import a CSV with a timestamp/date column or add observed rounds below.");
    setText("rolling24-coverage", stampedCount + " timestamped record(s) stored; only records with timestamps in the last 24 hours count here.");
  }

  function renderRecords(data) {
    const body = $("records-body");
    if (!body) return;
    body.replaceChildren();
    const latest = data.slice().reverse().slice(0, 10);
    if (!latest.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5; td.className = "table-empty";
      td.textContent = "No records yet. Import a CSV or load synthetic demo data.";
      tr.appendChild(td); body.appendChild(tr); return;
    }
    latest.forEach((r, i) => {
      const tr = document.createElement("tr");
      const cells = [
        String(i + 1),
        r.timestamp !== null ? new Date(r.timestamp).toLocaleString() : String(r.round || "—"),
        fmtMultiplier(r.multiplier),
        r.multiplier >= 2 ? "YES" : "NO",
        r.multiplier >= 10 ? "YES" : "NO"
      ];
      cells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function updateProbability() {
    const rtp = safeNumber($("rtp-input")?.value);
    const target = safeNumber($("target-input")?.value);
    const result = $("probability-value");
    const ringValue = $("ring-value");
    const ring = $("probability-ring");
    const note = $("probability-note");
    if (rtp === null || rtp <= 0 || rtp > 100 || target === null || target <= 1) {
      if (result) result.textContent = "Check inputs";
      if (ringValue) ringValue.textContent = "—";
      if (ring) ring.style.background = "conic-gradient(#ff8a32 0deg, rgba(255,255,255,.09) 0deg)";
      if (note) note.textContent = "Enter RTP from above 0 to 100 and a target multiplier greater than 1.";
      return;
    }
    const probability = Math.min(1, rtp / 100 / target);
    const percent = probability * 100;
    if (result) result.textContent = fmtPercent(percent);
    if (ringValue) ringValue.textContent = Math.round(percent) + "%";
    if (ring) ring.style.background = "conic-gradient(#ff8a32 " + (percent * 3.6) + "deg, rgba(255,255,255,.09) 0deg)";
    if (note) note.textContent = "Illustrative model only: assumes the entered RTP and a simplified standard crash-game formula. Actual game rules may differ. This does not predict the next round.";
  }

  function analyseThreshold() {
    const threshold = safeNumber($("threshold-input")?.value);
    const streakN = safeNumber($("streak-input")?.value);
    const output = $("analysis-result");
    if (!output) return;
    if (!records.length) {
      output.textContent = "Load or import historical records first.";
      return;
    }
    if (threshold === null || threshold <= 1 || streakN === null || streakN < 1 || !Number.isInteger(streakN) || streakN > 100) {
      output.textContent = "Use a threshold above 1× and a whole-number streak length from 1 to 100.";
      return;
    }
    const data = visibleRecords();
    const baseline = data.filter((r) => r.multiplier >= threshold).length / data.length;
    let opportunities = 0, hits = 0;
    for (let i = streakN; i < data.length; i++) {
      let allLow = true;
      for (let j = i - streakN; j < i; j++) {
        if (data[j].multiplier >= threshold) { allLow = false; break; }
      }
      if (allLow) {
        opportunities++;
        if (data[i].multiplier >= threshold) hits++;
      }
    }
    output.replaceChildren();
    const summary = document.createElement("p");
    if (!opportunities) {
      summary.textContent = "No qualifying sequences were found in this dataset. No conclusion can be drawn.";
      output.appendChild(summary); return;
    }
    const observed = hits / opportunities;
    const delta = (observed - baseline) * 100;
    summary.textContent = "After " + streakN + " consecutive rounds below " + fmtMultiplier(threshold) + ", " +
      hits + " of " + opportunities + " next observed rounds reached the threshold (" + fmtPercent(observed * 100) +
      "). Overall historical frequency: " + fmtPercent(baseline * 100) + ". Difference: " +
      (delta >= 0 ? "+" : "") + delta.toFixed(2) + " percentage points.";
    const caution = document.createElement("p");
    caution.className = "small-note";
    caution.textContent = opportunities < 30
      ? "Very small opportunity count (" + opportunities + "). Treat this as descriptive only; it is not reliable evidence of a predictive edge."
      : "This is a retrospective comparison, not a forecast. Check the same rule on later unseen data before claiming an edge.";
    output.append(summary, caution);
  }

  function brierScore(outcomes, predictions) {
    if (!outcomes.length || outcomes.length !== predictions.length) return null;
    return outcomes.reduce((sum, outcome, i) => sum + Math.pow(predictions[i] - outcome, 2), 0) / outcomes.length;
  }

  function wilsonInterval(successes, total, z = 1.96) {
    if (!total) return { low: null, high: null };
    const p = successes / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denom;
    const margin = z * Math.sqrt((p * (1 - p) / total) + (z2 / (4 * total * total))) / denom;
    return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
  }

  function estimateHistoricalRate() {
    const output = $("estimate-result");
    if (!output) return;
    const threshold = safeNumber($("threshold-input")?.value);
    if (threshold === null || threshold <= 1) {
      output.textContent = "Enter a target multiplier greater than 1× in Strategy Lab.";
      return;
    }
    const quality = dataQualityReport();
    if (!records.length) {
      output.textContent = "Load or import historical observations first. No prediction is available without data.";
      return;
    }
    if (quality.hasSeriousIssues) {
      output.textContent = "Estimate paused because invalid or future timestamps were detected. Correct the dataset first.";
      return;
    }
    const data = visibleRecords();
    const hits = data.filter((r) => r.multiplier >= threshold).length;
    const rate = hits / data.length;
    const ci = wilsonInterval(hits, data.length);
    lastResearchRun = {
      kind: "Historical target-rate estimate",
      createdAt: new Date().toISOString(),
      threshold,
      streakN: safeNumber($("streak-input")?.value),
      n: data.length,
      hits,
      rate,
      ciLow: ci.low,
      ciHigh: ci.high,
      dataSource,
      quality: qualitySummaryText(quality)
    };
    output.textContent = "Historical rate for reaching " + threshold.toFixed(2) + "×: " +
      fmtPercent(rate * 100) + " (" + hits + " of " + data.length + " observations). Approximate 95% Wilson interval: " +
      fmtPercent(ci.low * 100) + "–" + fmtPercent(ci.high * 100) + ". This describes the supplied past sample only; it is not a reliable forecast of the next round, and assumes the sample is relevant and observations are comparable.";
    setText("estimate-status", "Historical sample rate calculated");
    setText("estimate-pill", "RESEARCH ONLY");
  }

  function datasetProfile() {
    const data = visibleRecords();
    const timestamps = data.filter((r) => r.timestamp !== null).map((r) => r.timestamp).sort((a, b) => a - b);
    const q = dataQualityReport();
    return {
      source: dataSource,
      records: data.length,
      timestamped: timestamps.length,
      timestampCoverage: data.length ? timestamps.length / data.length : 0,
      start: timestamps.length ? new Date(timestamps[0]).toISOString() : "",
      end: timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : "",
      median: data.length ? median(data.map((r) => r.multiplier)) : null,
      rate2x: data.length ? data.filter((r) => r.multiplier >= 2).length / data.length : null,
      rate10x: data.length ? data.filter((r) => r.multiplier >= 10).length / data.length : null,
      quality: qualitySummaryText(q)
    };
  }

  function updateDatasetProfile() {
    const output = $("dataset-profile");
    if (!output) return;
    const p = datasetProfile();
    if (!p.records) {
      output.textContent = "No dataset loaded. Import timestamped historical observations to create a research profile.";
      return;
    }
    output.textContent = p.records + " records · " + Math.round(p.timestampCoverage * 100) +
      "% timestamp coverage · median " + fmtMultiplier(p.median) +
      " · ≥2× " + fmtPercent(p.rate2x * 100) + " · ≥10× " + fmtPercent(p.rate10x * 100) +
      (p.start ? " · date range " + p.start + " to " + p.end : " · no usable timestamps") +
      ". Source label: " + p.source + ". The dashboard cannot independently authenticate source data.";
  }

  function exportResearchReport() {
    const p = datasetProfile();
    const threshold = safeNumber($("threshold-input")?.value);
    const streakN = safeNumber($("streak-input")?.value);
    const rows = [
      ["field", "value"],
      ["report_created_at", new Date().toISOString()],
      ["dataset_source_label", p.source],
      ["record_count", p.records],
      ["timestamped_records", p.timestamped],
      ["timestamp_coverage_percent", (p.timestampCoverage * 100).toFixed(2)],
      ["timestamp_range_start", p.start],
      ["timestamp_range_end", p.end],
      ["median_multiplier", p.median === null ? "" : p.median],
      ["observed_rate_2x_percent", p.rate2x === null ? "" : (p.rate2x * 100).toFixed(4)],
      ["observed_rate_10x_percent", p.rate10x === null ? "" : (p.rate10x * 100).toFixed(4)],
      ["target_multiplier", threshold === null ? "" : threshold],
      ["low_round_streak_length", streakN === null ? "" : streakN],
      ["historical_estimate", $("estimate-result")?.textContent || "Not run"],
      ["holdout_status", $("holdout-status")?.textContent || ""],
      ["holdout_report", $("holdout-result")?.textContent || "Not run"],
      ["walk_forward_status", $("walk-forward-status")?.textContent || ""],
      ["walk_forward_report", $("walk-forward-result")?.textContent || "Not run"],
      ["data_quality", p.quality],
      ["interpretation_warning", "Historical rates do not reliably predict the next round. Results depend on data quality and may not generalize."]
    ];
    downloadCsv("gomez-aviator-research-report.csv", rows);
    setText("report-status", "Research report exported. It includes the current dataset profile, settings and visible validation results.");
  }

  function evaluateHoldout() {
    const output = $("holdout-result");
    if (!output) return;
    const threshold = safeNumber($("threshold-input")?.value);
    const streakN = safeNumber($("streak-input")?.value);
    if (threshold === null || threshold <= 1 || streakN === null || !Number.isInteger(streakN) || streakN < 1 || streakN > 100) {
      output.textContent = "Enter a target above 1× and a whole-number low-round streak from 1 to 100 in Strategy Lab.";
      return;
    }
    const quality = dataQualityReport();
    if (quality.hasSeriousIssues) {
      output.textContent = "Validation paused: fix invalid or future timestamps before testing. Review the Data Quality flags below the records table, correct the source CSV, then re-import it.";
      setText("holdout-pill", "DATA CHECK");
      setText("holdout-status", "Blocked by timestamp quality flags");
      return;
    }
    const data = visibleRecords();
    if (data.length < 50) {
      output.textContent = "At least 50 valid observations are required for this exploratory 70/30 time-ordered holdout. More data is preferable.";
      setText("holdout-pill", "INSUFFICIENT DATA");
      setText("holdout-status", "Needs at least 50 valid observations");
      return;
    }
    const split = Math.floor(data.length * 0.7);
    const train = data.slice(0, split);
    const test = data.slice(split);
    const trainOutcomes = train.map((r) => r.multiplier >= threshold ? 1 : 0);
    const baseHits = trainOutcomes.reduce((sum, v) => sum + v, 0);
    const baselineP = baseHits / trainOutcomes.length;
    let streakOpportunities = 0;
    let streakHits = 0;
    for (let i = streakN; i < train.length; i++) {
      let allLow = true;
      for (let j = i - streakN; j < i; j++) {
        if (train[j].multiplier >= threshold) { allLow = false; break; }
      }
      if (allLow) {
        streakOpportunities++;
        if (train[i].multiplier >= threshold) streakHits++;
      }
    }
    // Laplace smoothing avoids exact 0% or 100% from a small training sample.
    const conditionalP = (streakHits + 1) / (streakOpportunities + 2);
    const baselinePredictions = [];
    const rulePredictions = [];
    const testOutcomes = [];
    let triggered = 0;
    for (let i = split; i < data.length; i++) {
      const outcome = data[i].multiplier >= threshold ? 1 : 0;
      let allLow = i >= streakN;
      for (let j = i - streakN; allLow && j < i; j++) {
        if (data[j].multiplier >= threshold) allLow = false;
      }
      const prediction = allLow ? conditionalP : baselineP;
      if (allLow) triggered++;
      testOutcomes.push(outcome);
      baselinePredictions.push(baselineP);
      rulePredictions.push(prediction);
    }
    const baselineBrier = brierScore(testOutcomes, baselinePredictions);
    const ruleBrier = brierScore(testOutcomes, rulePredictions);
    const p = document.createElement("p");
    p.textContent = "Chronological split: first " + train.length + " observations for training; final " + test.length + " held out from fitting. Training baseline target-hit rate: " + fmtPercent(baselineP * 100) + ". Training low-streak cases: " + streakOpportunities + "; smoothed conditional rate: " + fmtPercent(conditionalP * 100) + ". Holdout rule triggers: " + triggered + " of " + test.length + " test rounds. Brier score — baseline: " + baselineBrier.toFixed(4) + "; streak rule: " + ruleBrier.toFixed(4) + ".";
    const caution = document.createElement("p");
    caution.className = "small-note";
    caution.textContent = ruleBrier < baselineBrier
      ? "On this one holdout, the streak rule had a lower Brier score than the baseline. This is not proof of a dependable edge; a single split can be lucky."
      : ruleBrier > baselineBrier
        ? "On this one holdout, the streak rule did not beat the baseline. Do not treat the observed pattern as a betting signal."
        : "On this one holdout, both methods had the same Brier score. No improvement was demonstrated.";
    const caveat = document.createElement("p");
    caveat.className = "small-note";
    caveat.textContent = "Research check only: repeated threshold testing, small samples, poor timestamps and dependence between rounds can mislead. Lower Brier score is better. This does not predict the next round.";
    output.replaceChildren(p, caution, caveat);
    setText("holdout-pill", ruleBrier < baselineBrier ? "BEAT BASELINE" : "NO EDGE SHOWN");
    setText("holdout-status", "Evaluated " + test.length + " holdout observations");
  }

  function evaluateWalkForward() {
    const output = $("walk-forward-result");
    if (!output) return;
    const threshold = safeNumber($("threshold-input")?.value);
    const streakN = safeNumber($("streak-input")?.value);
    if (threshold === null || threshold <= 1 || streakN === null || !Number.isInteger(streakN) || streakN < 1 || streakN > 100) {
      output.textContent = "Enter a target above 1× and a whole-number low-round streak from 1 to 100 in Strategy Lab.";
      return;
    }
    const quality = dataQualityReport();
    if (quality.hasSeriousIssues) {
      output.textContent = "Validation paused: fix invalid or future timestamps before testing. Review the Data Quality flags below the records table, correct the source CSV, then re-import it.";
      setText("walk-forward-pill", "DATA CHECK");
      setText("walk-forward-status", "Blocked by timestamp quality flags");
      return;
    }
    const data = visibleRecords();
    if (data.length < 100) {
      output.textContent = "At least 100 valid observations are required. Larger real datasets are strongly preferred.";
      setText("walk-forward-pill", "INSUFFICIENT DATA");
      setText("walk-forward-status", "Needs at least 100 observations");
      return;
    }

    const outcomes = data.map((r) => r.multiplier >= threshold ? 1 : 0);
    const start = Math.max(50, streakN + 2);
    const baselinePredictions = [];
    const rulePredictions = [];
    const testOutcomes = [];
    const rows = [];
    const foldCount = 5;
    const foldSize = Math.ceil((data.length - start) / foldCount);
    let totalTriggers = 0;

    for (let i = start; i < data.length; i++) {
      // At prediction time i, only observations strictly before i may be used.
      const history = outcomes.slice(0, i);
      const baselineP = history.reduce((sum, v) => sum + v, 0) / history.length;
      let streakCases = 0;
      let streakHits = 0;
      for (let j = streakN; j < i; j++) {
        let allLow = true;
        for (let k = j - streakN; k < j; k++) {
          if (outcomes[k] === 1) { allLow = false; break; }
        }
        if (allLow) {
          streakCases++;
          if (outcomes[j] === 1) streakHits++;
        }
      }
      // Laplace smoothing reduces extreme conditional probabilities from sparse patterns.
      const conditionalP = (streakHits + 1) / (streakCases + 2);
      let allLowNow = true;
      for (let k = i - streakN; k < i; k++) {
        if (outcomes[k] === 1) { allLowNow = false; break; }
      }
      const prediction = allLowNow ? conditionalP : baselineP;
      if (allLowNow) totalTriggers++;
      baselinePredictions.push(baselineP);
      rulePredictions.push(prediction);
      testOutcomes.push(outcomes[i]);
      const fold = Math.min(foldCount - 1, Math.floor((i - start) / foldSize));
      if (!rows[fold]) rows[fold] = { n: 0, baseline: [], rule: [], hits: 0 };
      rows[fold].n++;
      rows[fold].baseline.push(baselineP);
      rows[fold].rule.push(prediction);
      rows[fold].hits += outcomes[i];
    }

    const baseScore = brierScore(testOutcomes, baselinePredictions);
    const ruleScore = brierScore(testOutcomes, rulePredictions);
    const p = document.createElement("p");
    p.textContent = "Walk-forward forecasts scored: " + testOutcomes.length + " observations, starting after " + start + " initial history records. At each step, forecasts use only earlier results; the history expands after each observed outcome. Overall Brier score — rolling historical baseline: " + baseScore.toFixed(4) + "; streak rule: " + ruleScore.toFixed(4) + ". Rule triggered after a low streak " + totalTriggers + " time(s).";
    const foldHeading = document.createElement("p");
    foldHeading.textContent = "Chronological period checks (lower Brier score is better):";
    const list = document.createElement("ul");
    rows.filter(Boolean).forEach((fold, index) => {
      const li = document.createElement("li");
      const offset = rows.slice(0,index).reduce((sum, f) => sum + (f ? f.n : 0), 0);
      const localOutcomes = testOutcomes.slice(offset, offset + fold.n);
      const foldBase = brierScore(localOutcomes, fold.baseline);
      const foldRule = brierScore(localOutcomes, fold.rule);
      li.textContent = "Period " + (index + 1) + ": " + fold.n + " forecasts; target-hit rate " + fmtPercent(fold.hits / fold.n * 100) + "; baseline " + foldBase.toFixed(4) + "; streak rule " + foldRule.toFixed(4) + (foldRule < foldBase ? " (rule lower)" : foldRule > foldBase ? " (baseline lower)" : " (tie)") + ".";
      list.appendChild(li);
    });
    const caution = document.createElement("p");
    caution.className = "small-note";
    caution.textContent = ruleScore < baseScore
      ? "The rule had a lower aggregate Brier score in this walk-forward run, but this alone does not establish a dependable edge."
      : ruleScore > baseScore
        ? "The streak rule did not beat the rolling baseline overall in this run."
        : "The rule and baseline tied on aggregate Brier score in this run.";
    const caveat = document.createElement("p");
    caveat.className = "small-note";
    caveat.textContent = "This is retrospective statistical research, not a prediction or betting signal. The first history records are not scored; repeated strategy selection, data errors, dependence and regime changes can distort results. Demo data is synthetic and must not be treated as real evidence.";
    output.replaceChildren(p, foldHeading, list, caution, caveat);
    setText("walk-forward-pill", ruleScore < baseScore ? "RULE LOWER" : "BASELINE/TIE");
    setText("walk-forward-status", "Scored " + testOutcomes.length + " sequential forecasts");
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function loadDemo() {
    const rand = seededRandom(20261014);
    const now = Date.now();
    records = [];
    for (let i = 0; i < 500; i++) {
      const u = Math.max(0.00001, rand());
      // Synthetic heavy-tailed illustration; deliberately not a real Aviator feed or simulator.
      const multiplier = Math.min(100, Math.max(1.01, Math.floor((0.97 / u) * 100) / 100));
      records.push({
        round: i + 1,
        multiplier,
        timestamp: now - (500 - i) * 2.5 * 60 * 1000,
        timestampProvided: true
      });
    }
    dataSource = "SYNTHETIC DEMO — not real game history";
    invalidRows = 0;
    persist();
    updateMetrics(visibleRecords());
    setText("quality-message", "Synthetic demo loaded. Do not use demo records to make betting decisions.");
    analyseThreshold();
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const textContent = await file.text();
      const result = parseCsv(textContent);
      if (!result.parsed.length) {
        setText("quality-message", "No valid multiplier rows found. CSV should include a multiplier column, with an optional timestamp/date column.");
        return;
      }
      records = result.parsed;
      invalidRows = result.invalid;
      dataSource = "Imported CSV: " + file.name;
      persist();
      updateMetrics(visibleRecords());
      analyseThreshold();
      setText("quality-message", qualitySummaryText(dataQualityReport()) + " " + invalidRows + " invalid CSV row(s) skipped.");
    } catch (err) {
      setText("quality-message", "Could not read this CSV. Please try another CSV file.");
    }
  }

  function addManualRecord() {
    const input = $("manual-multiplier");
    if (!input) return;
    const multiplier = safeNumber(input.value);
    if (multiplier === null || multiplier < 1 || multiplier > 100000000) {
      setText("manual-status", "Enter a valid observed multiplier of 1.00× or higher.");
      return;
    }
    const timestampInput = $("manual-timestamp");
    const timestamp = timestampInput && timestampInput.value ? new Date(timestampInput.value).getTime() : Date.now();
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60000) {
      setText("manual-status", "Timestamp must be valid and not in the future.");
      return;
    }
    records.push({
      round: records.length + 1,
      multiplier,
      timestamp,
      timestampProvided: true
    });
    dataSource = "Manually recorded observations (saved in this browser)";
    persist();
    updateMetrics(visibleRecords());
    analyseThreshold();
    input.value = "";
    setText("manual-status", "Recorded " + fmtMultiplier(multiplier) + " at " + new Date(timestamp).toLocaleString() + ".");
  }

  function clearData() {
    records = [];
    dataSource = "No dataset loaded";
    invalidRows = 0;
    lastResearchRun = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    updateMetrics([]);
    const output = $("analysis-result");
    if (output) output.textContent = "Load or import historical records to run the comparison.";
    setText("manual-status", "Dataset cleared.");
  }

  const COLLECTOR_URL_KEY = "gomezAviatorIntelligence.collectorUrl.v1";
  let collectorBaseUrl = "";
  let collectorRounds = [];

  function normalizeCollectorBase(raw) {
    const parsed = new URL(String(raw || "").trim());
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
      throw new Error("Use HTTPS (HTTP is allowed only for localhost testing).");
    }
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  }

  async function collectorGet(pathname) {
    const response = await fetch(collectorBaseUrl + pathname, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }

  async function refreshCollectorStatus() {
    if (!collectorBaseUrl) return;
    setText("collector-connection-status", "Checking collector…");
    try {
      const values = await Promise.all([
        collectorGet("/health"),
        collectorGet("/api/v1/sources"),
        collectorGet("/api/v1/rounds?limit=500")
      ]);
      const health = values[0], sourceData = values[1], roundData = values[2];
      if (!health.ok || !Array.isArray(sourceData.sources) || !Array.isArray(roundData.rounds)) {
        throw new Error("Response does not match the collector API format.");
      }
      collectorRounds = roundData.rounds.filter((r) =>
        r && typeof r.source === "string" && typeof r.roundId === "string" &&
        Number.isFinite(Number(r.multiplier)) && Number(r.multiplier) >= 1 &&
        Number.isFinite(Date.parse(r.endedAt))
      );
      const sourceText = sourceData.sources.map((s) => s.source + ": " + s.records + " stored").join(" · ");
      setText("collector-source-status", sourceText || "No source status returned.");
      const latest = collectorRounds.reduce((best, r) => Math.max(best, Date.parse(r.endedAt)), 0);
      setText("collector-connection-status", "Collector reachable; " + collectorRounds.length +
        " valid stored round(s). " + (health.liveProviderConnected ? "Provider reports connected; verify source status." : "No verified live provider connection reported.") +
        (latest ? " Latest stored round: " + new Date(latest).toLocaleString() + "." : ""));
      const button = $("import-collector-records");
      if (button) button.disabled = collectorRounds.length === 0;
    } catch (error) {
      collectorRounds = [];
      setText("collector-source-status", "");
      setText("collector-connection-status", "Could not connect: " + error.message + ". Check URL, HTTPS, backend status and CORS.");
      const button = $("import-collector-records");
      if (button) button.disabled = true;
    }
  }

  function connectCollector() {
    try {
      collectorBaseUrl = normalizeCollectorBase($("collector-url")?.value);
      $("collector-url").value = collectorBaseUrl;
      try { localStorage.setItem(COLLECTOR_URL_KEY, collectorBaseUrl); } catch (_) {}
      refreshCollectorStatus();
    } catch (error) {
      setText("collector-connection-status", error.message);
    }
  }

  function importCollectorRecords() {
    const imported = collectorRounds.map((r) => ({
      round: r.roundId,
      roundId: r.roundId,
      source: r.source,
      multiplier: Number(r.multiplier),
      timestamp: Date.parse(r.endedAt),
      timestampProvided: true
    })).filter((r) => Number.isFinite(r.multiplier) && r.multiplier >= 1 && Number.isFinite(r.timestamp));
    if (!imported.length) {
      setText("collector-connection-status", "No valid collector records are available.");
      return;
    }
    records = imported.sort((a, b) => a.timestamp - b.timestamp);
    invalidRows = 0;
    dataSource = "Collector API records; source authenticity not independently verified";
    persist();
    updateMetrics(visibleRecords());
    analyseThreshold();
    setText("quality-message", "Loaded " + imported.length + " timestamped collector record(s). This does not prove a verified live feed.");
    setText("collector-connection-status", "Loaded " + imported.length + " record(s) into Data Lab.");
  }

  function predictNextFlightResearch() {
    const output = $("next-flight-result");
    if (!output) return;
    const data = visibleRecords();
    if (!data.length) {
      output.textContent = "";
      const strong = document.createElement("strong");
      strong.textContent = "No data to check yet";
      const p = document.createElement("p");
      p.textContent = "Import a real history CSV or connect a collector first. Demo data is only for testing.";
      output.append(strong, p);
      return;
    }
    const isDemo = /demo|synthetic/i.test(String(dataSource || ""));
    const total = data.length;
    const rate = (target) => (data.filter((r) => r.multiplier >= target).length / total) * 100;
    const lines = [
      "We cannot reliably predict the next flight. Its crash point is unknown.",
      "In the " + total.toLocaleString() + " saved round(s):",
      "• Reached 2×: " + rate(2).toFixed(1) + "%",
      "• Reached 5×: " + rate(5).toFixed(1) + "%",
      "• Reached 10×: " + rate(10).toFixed(1) + "%",
      isDemo ? "WARNING: this is synthetic demo data, not real game history." : "These are past results only, not odds for the next round."
    ];
    output.textContent = "";
    const title = document.createElement("strong");
    title.textContent = "Next flight: unknown ✈️";
    const p = document.createElement("p");
    p.textContent = lines.join("\n");
    output.append(title, p);
  }

  function init() {
    restore();
    const data = visibleRecords();
    updateMetrics(data);
    if ($("csv-file")) $("csv-file").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      importFile(file);
      event.target.value = "";
    });
    $("load-demo")?.addEventListener("click", loadDemo);
    $("download-template")?.addEventListener("click", downloadTemplate);
    $("export-csv")?.addEventListener("click", exportRecords);
    $("run-analysis")?.addEventListener("click", analyseThreshold);
    $("run-holdout")?.addEventListener("click", evaluateHoldout);
    $("run-walk-forward")?.addEventListener("click", evaluateWalkForward);
    $("estimate-rate")?.addEventListener("click", estimateHistoricalRate);
    $("export-research-report")?.addEventListener("click", exportResearchReport);
    $("clear-data")?.addEventListener("click", clearData);
    $("predict-next-flight")?.addEventListener("click", predictNextFlightResearch);
    $("connect-collector")?.addEventListener("click", connectCollector);
    $("collector-url")?.addEventListener("keydown", (event) => { if (event.key === "Enter") connectCollector(); });
    $("import-collector-records")?.addEventListener("click", importCollectorRecords);
    try {
      const saved = localStorage.getItem(COLLECTOR_URL_KEY);
      if (saved && $("collector-url")) {
        collectorBaseUrl = normalizeCollectorBase(saved);
        $("collector-url").value = collectorBaseUrl;
        refreshCollectorStatus();
      }
    } catch (_) {}

    $("rtp-input")?.addEventListener("input", updateProbability);
    $("target-input")?.addEventListener("input", updateProbability);
    $("add-manual-record")?.addEventListener("click", addManualRecord);
    $("manual-multiplier")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addManualRecord();
    });
    $("menu-toggle")?.addEventListener("click", () => {
      const sidebar = $("sidebar");
      const button = $("menu-toggle");
      if (!sidebar || !button) return;
      const open = sidebar.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
        link.classList.add("active");
        $("sidebar")?.classList.remove("open");
        $("menu-toggle")?.setAttribute("aria-expanded", "false");
      });
    });
    window.addEventListener("resize", () => drawChart(visibleRecords()));
    if (typeof ResizeObserver !== "undefined" && $("distribution-chart")) {
      const observer = new ResizeObserver(() => drawChart(visibleRecords()));
      observer.observe($("distribution-chart").parentElement);
    }
    // Keep the 24-hour rolling window fresh while the dashboard stays open.
    window.setInterval(render24HourSummary, 60000);
    window.setInterval(() => { if (collectorBaseUrl) refreshCollectorStatus(); }, 30000);

  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();