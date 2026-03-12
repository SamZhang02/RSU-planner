function toMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function compactMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

const chartState = {
  rows: [],
  width: 0,
  height: 0,
  pad: null
};

function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

function settleVestEvent(vestValue, cashSplitPct, rsuSplitPct, incomeTaxPct, _capGainsPct) {
  const cashSplit = cashSplitPct / 100;
  const rsuSplit = rsuSplitPct / 100;
  const incomeTaxRate = incomeTaxPct / 100;

  const grossCash = vestValue * cashSplit;
  const grossRsu = vestValue * rsuSplit;
  const taxOwed = vestValue * incomeTaxRate;
  const shortfall = Math.max(0, taxOwed - grossCash);

  const rsuSoldForTax = 0;
  const capGainsTaxPaid = 0;
  const outOfPocketDraw = shortfall;
  const rsuKept = grossRsu;
  let netCashFromVest = Math.max(0, grossCash - taxOwed);
  if (shortfall > 0) netCashFromVest = 0;

  return {
    grossCash,
    grossRsu,
    taxOwed,
    shortfall,
    rsuSoldForTax,
    capGainsTaxPaid,
    outOfPocketDraw,
    rsuKept,
    netCashFromVest
  };
}

function runMonteCarlo(years, annualContribution, meanReturnPct, volatilityPct, paths = 600) {
  const mu = meanReturnPct / 100;
  const sigma = volatilityPct / 100;
  const perYear = Array.from({ length: years + 1 }, () => []);

  for (let p = 0; p < paths; p += 1) {
    let balance = 0;
    perYear[0].push(balance);
    for (let y = 1; y <= years; y += 1) {
      const annualReturn = mu + sigma * randn();
      balance = balance * (1 + annualReturn) + annualContribution;
      perYear[y].push(balance);
    }
  }

  const summary = [];
  for (let y = 0; y <= years; y += 1) {
    const sorted = perYear[y].slice().sort((a, b) => a - b);
    summary.push({
      year: y,
      p10: percentile(sorted, 0.1),
      median: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9)
    });
  }
  return summary;
}

function drawGrowthChart(rows, hoverIndex = null) {
  const canvas = document.getElementById("growthChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 960;
  const cssHeight = (cssWidth * 7) / 16;

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = cssWidth;
  const height = cssHeight;
  const pad = { top: 28, right: 26, bottom: 56, left: 86 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxY = Math.max(...rows.map((row) => row.p90), 1);
  const yTickMax = Math.ceil(maxY / 50000) * 50000 || 1;
  const xFor = (index) => pad.left + (index / (rows.length - 1 || 1)) * plotW;
  const yFor = (value) => pad.top + (1 - value / yTickMax) * plotH;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fffef8";
  ctx.fillRect(0, 0, width, height);

  // Horizontal Y ticks
  const yTicks = 5;
  ctx.fillStyle = "#64748b";
  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.textAlign = "right";
  ctx.strokeStyle = "#dbeafe";
  ctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i += 1) {
    const y = pad.top + (i / yTicks) * plotH;
    const value = yTickMax * (1 - i / yTicks);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(compactMoney(value), pad.left - 10, y + 4);
  }

  // Vertical X ticks
  const xTicks = Math.min(6, rows.length - 1);
  ctx.textAlign = "center";
  for (let i = 0; i <= xTicks; i += 1) {
    const year = Math.round((i / xTicks) * (rows.length - 1));
    const x = xFor(year);
    ctx.strokeStyle = "#eef2ff";
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.fillText(`Y${year}`, x, height - pad.bottom + 20);
  }

  // Axes
  ctx.strokeStyle = "#94a3b8";
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  // Shaded range P10-P90
  ctx.fillStyle = "rgba(14, 165, 233, 0.16)";
  ctx.beginPath();
  rows.forEach((row, idx) => {
    const x = xFor(idx);
    const y = yFor(row.p10);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let idx = rows.length - 1; idx >= 0; idx -= 1) {
    const x = xFor(idx);
    const y = yFor(rows[idx].p90);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  function drawLine(accessor, color, widthPx) {
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx;
    ctx.beginPath();
    rows.forEach((row, idx) => {
      const x = xFor(idx);
      const y = yFor(accessor(row));
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  drawLine((row) => row.p10, "#0ea5e9", 1.8);
  drawLine((row) => row.median, "#0f172a", 2.8);
  drawLine((row) => row.p90, "#f97316", 1.8);

  // Axis labels
  ctx.fillStyle = "#475569";
  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText("Time (Years)", pad.left + plotW / 2, height - 14);
  ctx.save();
  ctx.translate(20, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Portfolio Value (USD)", 0, 0);
  ctx.restore();

  if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < rows.length) {
    const row = rows[hoverIndex];
    const x = xFor(hoverIndex);
    const yMedian = yFor(row.median);

    ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(x, yMedian, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  chartState.rows = rows;
  chartState.width = width;
  chartState.height = height;
  chartState.pad = pad;
}

function showChartTooltip(hoverIndex, clientX, clientY) {
  const tooltip = document.getElementById("chartTooltip");
  const frame = document.querySelector(".chart-frame");
  const row = chartState.rows[hoverIndex];
  if (!tooltip || !frame || !row) return;

  tooltip.hidden = false;
  tooltip.innerHTML = `Year ${row.year}<br>Median: ${toMoney(row.median)}<br>P10: ${toMoney(row.p10)}<br>P90: ${toMoney(row.p90)}`;

  const frameRect = frame.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const offsetX = 14;
  const offsetY = 14;

  let left = clientX - frameRect.left + offsetX;
  let top = clientY - frameRect.top + offsetY;

  if (left + tooltipRect.width > frameRect.width - 8) {
    left = clientX - frameRect.left - tooltipRect.width - 10;
  }
  if (top + tooltipRect.height > frameRect.height - 8) {
    top = frameRect.height - tooltipRect.height - 8;
  }
  left = Math.max(8, left);
  top = Math.max(8, top);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function handleChartHover(event) {
  if (!chartState.rows.length || !chartState.pad) return;
  const canvas = document.getElementById("growthChart");
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { pad, width } = chartState;
  const plotW = width - pad.left - pad.right;

  if (x < pad.left || x > width - pad.right) {
    hideChartTooltip();
    drawGrowthChart(chartState.rows);
    return;
  }

  const frac = (x - pad.left) / plotW;
  const index = clamp(Math.round(frac * (chartState.rows.length - 1)), 0, chartState.rows.length - 1);
  drawGrowthChart(chartState.rows, index);
  showChartTooltip(index, event.clientX, event.clientY);
}

function hideChartTooltip() {
  const tooltip = document.getElementById("chartTooltip");
  if (tooltip) tooltip.hidden = true;
  if (chartState.rows.length) drawGrowthChart(chartState.rows);
}

function createVestRow(defaults = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input data-field="vestValue" type="number" min="0" step="100" value="${defaults.vestValue ?? 100000}" /></td>
    <td><input data-field="cashSplit" type="number" min="0" max="100" step="1" value="${defaults.cashSplit ?? 20}" /></td>
    <td><input data-field="rsuSplit" type="number" min="0" max="100" step="1" value="${defaults.rsuSplit ?? 80}" /></td>
    <td><input data-field="incomeTax" type="number" min="0" max="100" step="0.1" value="${defaults.incomeTax ?? 50}" /></td>
    <td><input data-field="capGains" type="number" min="0" max="50" step="0.1" value="${defaults.capGains ?? 15}" /></td>
    <td><button class="danger" type="button" data-remove-row="1">Remove</button></td>
  `;
  return tr;
}

function parseVestRows() {
  const rows = Array.from(document.querySelectorAll("#vestRows tr"));
  return rows.map((tr, idx) => {
    const get = (field) => Number(tr.querySelector(`[data-field="${field}"]`).value);
    return {
      idx: idx + 1,
      vestValue: get("vestValue"),
      cashSplit: get("cashSplit"),
      rsuSplit: get("rsuSplit"),
      incomeTax: get("incomeTax"),
      capGains: get("capGains")
    };
  });
}

function runSimulation() {
  const validationMsg = document.getElementById("validationMsg");
  const annualCashFlow = Number(document.getElementById("annualCashFlow").value);
  const projectionYears = clamp(Number(document.getElementById("projectionYears").value), 1, 40);
  const section2Return = Number(document.getElementById("section2Return").value);
  const section2Volatility = Number(document.getElementById("section2Volatility").value);
  const desiredContribution = Math.max(0, Number(document.getElementById("desiredContribution").value));
  const vestInputs = parseVestRows();

  const baseNumbers = [annualCashFlow, projectionYears, section2Return, section2Volatility, desiredContribution];
  if (baseNumbers.some((n) => Number.isNaN(n))) {
    validationMsg.textContent = "Please enter valid numeric inputs for Sections 1 and 2.";
    return;
  }

  if (vestInputs.length === 0) {
    validationMsg.textContent = "Add at least one vest event in Section 3.";
    return;
  }

  for (const row of vestInputs) {
    const numbers = [row.vestValue, row.cashSplit, row.rsuSplit, row.incomeTax, row.capGains];
    if (numbers.some((n) => Number.isNaN(n))) {
      validationMsg.textContent = `Vest event ${row.idx} has invalid numbers.`;
      return;
    }
    if (Math.abs(row.cashSplit + row.rsuSplit - 100) > 0.001) {
      validationMsg.textContent = `Vest event ${row.idx}: cash % and RSU % must add to 100.`;
      return;
    }
  }

  validationMsg.textContent = "";

  const settledRows = vestInputs.map((row) => ({
    ...row,
    ...settleVestEvent(row.vestValue, row.cashSplit, row.rsuSplit, row.incomeTax, row.capGains)
  }));

  const totals = settledRows.reduce(
    (acc, row) => {
      acc.netVestCash += row.netCashFromVest;
      acc.outOfPocket += row.outOfPocketDraw;
      acc.rsuKept += row.rsuKept;
      acc.rsuSold += row.rsuSoldForTax;
      acc.capGainsTax += row.capGainsTaxPaid;
      return acc;
    },
    { netVestCash: 0, outOfPocket: 0, rsuKept: 0, rsuSold: 0, capGainsTax: 0 }
  );

  const adjustedCashFlow = annualCashFlow + totals.netVestCash - totals.outOfPocket;
  const annualContribution = Math.max(0, adjustedCashFlow);
  let extraCashNeeded = 0;
  if (desiredContribution > 0) {
    if (adjustedCashFlow >= 0) {
      extraCashNeeded = Math.max(0, desiredContribution - adjustedCashFlow);
    } else {
      extraCashNeeded = desiredContribution - adjustedCashFlow;
    }
  }
  const desiredGap = Math.max(0, desiredContribution - annualContribution);

  document.getElementById("outSection1Cash").textContent = toMoney(adjustedCashFlow);
  document.getElementById("outSection2Contribution").textContent = toMoney(annualContribution);
  document.getElementById("outSection3Rsu").textContent = toMoney(totals.rsuKept);
  document.getElementById("outDesiredGap").textContent = toMoney(desiredGap);

  const section1Note = document.getElementById("outSection1Note");
  section1Note.className = adjustedCashFlow >= 0 ? "good" : "warn";
  section1Note.textContent = `Base cash flow ${toMoney(annualCashFlow)} + net vest cash ${toMoney(totals.netVestCash)} - uncovered tax ${toMoney(totals.outOfPocket)}.${
    adjustedCashFlow < 0 ? " Contribution is capped at $0.00 until allowance is positive." : ""
  }`;

  document.getElementById("outSection3Note").textContent = "Tax shortfalls are deducted from Section 1 cash flow allowance; RSU allocation remains intact in this mode.";
  const desiredGapNote = document.getElementById("outDesiredGapNote");
  if (desiredGap === 0) {
    desiredGapNote.textContent = "On track. Current annual contribution meets or exceeds your desired target.";
    desiredGapNote.className = "good";
  } else {
    desiredGapNote.textContent = `Need ${toMoney(extraCashNeeded)} more annual cash flow (${toMoney(extraCashNeeded / 12)} per month) to reach desired contribution of ${toMoney(desiredContribution)}.`;
    desiredGapNote.className = "warn";
  }

  const breakdownBody = document.getElementById("breakdownRows");
  breakdownBody.innerHTML = "";
  settledRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${row.idx}</td>
      <td>${toMoney(row.taxOwed)}</td>
      <td>${toMoney(row.grossCash)}</td>
      <td>${toMoney(row.shortfall)}</td>
      <td>${toMoney(row.rsuSoldForTax)}</td>
      <td>${toMoney(row.capGainsTaxPaid)}</td>
      <td>${toMoney(row.outOfPocketDraw)}</td>
      <td>${toMoney(row.rsuKept)}</td>
    `;
    breakdownBody.appendChild(tr);
  });

  const growthRows = runMonteCarlo(projectionYears, annualContribution, section2Return, section2Volatility);
  drawGrowthChart(growthRows);

  const finalYear = growthRows[growthRows.length - 1];
  document.getElementById("outEndYear").textContent = String(projectionYears);
  document.getElementById("outEndYear2").textContent = String(projectionYears);
  document.getElementById("outEndYear3").textContent = String(projectionYears);
  document.getElementById("outEndP10").textContent = toMoney(finalYear.p10);
  document.getElementById("outEndMedian").textContent = toMoney(finalYear.median);
  document.getElementById("outEndP90").textContent = toMoney(finalYear.p90);
}

function bootstrap() {
  const vestRows = document.getElementById("vestRows");
  const canvas = document.getElementById("growthChart");
  vestRows.appendChild(createVestRow());

  document.getElementById("addVestRow").addEventListener("click", () => {
    vestRows.appendChild(createVestRow({ vestValue: 75000, cashSplit: 30, rsuSplit: 70, incomeTax: 45, capGains: 15 }));
  });

  vestRows.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.removeRow === "1") {
      const rows = vestRows.querySelectorAll("tr");
      if (rows.length > 1) {
        target.closest("tr")?.remove();
      }
    }
  });

  document.getElementById("runBtn").addEventListener("click", runSimulation);
  window.addEventListener("resize", runSimulation);
  canvas.addEventListener("mousemove", handleChartHover);
  canvas.addEventListener("mouseleave", hideChartTooltip);
  runSimulation();
}

bootstrap();
