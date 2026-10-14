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
    if (timestamp !== null && timestamp !== undefined && String(timestamp).trim() !== "") {
      const rawTime = String(timestamp).trim();
      const numericTime = /^\\d{10,13}$/.test(rawTime) ? Number(rawTime) : null;
      time = numericTime !== null
        ? (rawTime.length === 10 ? numericTime * 1000 : numericTime)
        : new Date(rawTime).getTime();
      if (!Number.isFinite(time)) time = null;
    }
    return {
      round: round || null,
      multiplier: m,
      timestamp: time,
      timestampProvided: time !== null
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
        records = saved.map((r) => validRecord(r.multiplier, r.timestamp, r.round)).filter(Boolean);
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

  function csvEscape(value) {
    const s = String(value ?? "");
    return /[",\\r\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\\r\\n") + "\\r\\n";
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
    setText("quality-message", values.length
      ? records.filter((r) => r.timestamp === null).length + " record(s) have no timestamp; " + duplicateTimestampCount() + " duplicate timestamp+multiplier pair(s); " + invalidRows + " invalid CSV row(s) skipped."
      : "Waiting for data");
    render24HourSummary();
    renderRecords(data);
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
      setText("quality-message", "Imported " + records.length + " valid record(s); skipped " + invalidRows + " invalid row(s). " +
        records.filter((r) => r.timestamp !== null).length + " record(s) include timestamps.");
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
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    updateMetrics([]);
    const output = $("analysis-result");
    if (output) output.textContent = "Load or import historical records to run the comparison.";
    setText("manual-status", "Dataset cleared.");
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
    $("clear-data")?.addEventListener("click", clearData);
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
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();