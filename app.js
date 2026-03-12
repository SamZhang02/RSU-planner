const STORAGE_KEY = "rsu-cashflow-planner-v1";

function toMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function settleVestEvent(vestValue, cashSplitPct, rsuSplitPct, incomeTaxPct) {
  const cashSplit = cashSplitPct / 100;
  const rsuSplit = rsuSplitPct / 100;
  const incomeTaxRate = incomeTaxPct / 100;

  const grossCash = vestValue * cashSplit;
  const grossRsu = vestValue * rsuSplit;
  const taxOwed = vestValue * incomeTaxRate;
  const shortfall = Math.max(0, taxOwed - grossCash);

  return {
    grossCash,
    grossRsu,
    taxOwed,
    shortfall,
    outOfPocketDraw: shortfall,
    rsuKept: grossRsu,
    netCashFromVest: Math.max(0, grossCash - taxOwed)
  };
}

function createVestRow(defaults = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input data-field="vestValue" type="number" min="0" step="100" value="${defaults.vestValue ?? 100000}" /></td>
    <td><input data-field="cashSplit" type="number" min="0" max="100" step="1" value="${defaults.cashSplit ?? 20}" /></td>
    <td><input data-field="rsuSplit" type="number" min="0" max="100" step="1" value="${defaults.rsuSplit ?? 80}" /></td>
    <td><input data-field="incomeTax" type="number" min="0" max="100" step="0.1" value="${defaults.incomeTax ?? 50}" /></td>
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
      incomeTax: get("incomeTax")
    };
  });
}

function getScalarInputState() {
  return {
    baseSalary: document.getElementById("baseSalary").value,
    baseSalaryTaxRate: document.getElementById("baseSalaryTaxRate").value,
    desiredContribution: document.getElementById("desiredContribution").value,
    preTaxReduction: document.getElementById("preTaxReduction").value
  };
}

function applyScalarInputState(state) {
  if (!state) return;
  if (state.baseSalary !== undefined) document.getElementById("baseSalary").value = state.baseSalary;
  if (state.baseSalaryTaxRate !== undefined) document.getElementById("baseSalaryTaxRate").value = state.baseSalaryTaxRate;
  if (state.desiredContribution !== undefined) document.getElementById("desiredContribution").value = state.desiredContribution;
  if (state.preTaxReduction !== undefined) document.getElementById("preTaxReduction").value = state.preTaxReduction;
}

function saveState() {
  const vestEvents = parseVestRows().map(({ vestValue, cashSplit, rsuSplit, incomeTax }) => ({
    vestValue,
    cashSplit,
    rsuSplit,
    incomeTax
  }));

  const payload = {
    ...getScalarInputState(),
    vestEvents
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_e) {
    // Ignore persistence failures (private mode/storage limits).
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_e) {
    return null;
  }
}

function runSimulation() {
  const validationMsg = document.getElementById("validationMsg");
  const baseSalary = Number(document.getElementById("baseSalary").value);
  const baseSalaryTaxRatePct = Number(document.getElementById("baseSalaryTaxRate").value);
  const preTaxReductionInput = Number(document.getElementById("preTaxReduction").value);
  const preTaxReduction = Math.max(0, preTaxReductionInput);
  const desiredContribution = Math.max(0, Number(document.getElementById("desiredContribution").value));
  const vestInputs = parseVestRows();

  if ([baseSalary, baseSalaryTaxRatePct, preTaxReductionInput, desiredContribution].some((n) => Number.isNaN(n))) {
    validationMsg.textContent = "Please enter valid numeric inputs for Sections 1 and 2.";
    saveState();
    return;
  }

  if (vestInputs.length === 0) {
    validationMsg.textContent = "Add at least one vest event in Section 3.";
    saveState();
    return;
  }

  for (const row of vestInputs) {
    const numbers = [row.vestValue, row.cashSplit, row.rsuSplit, row.incomeTax];
    if (numbers.some((n) => Number.isNaN(n))) {
      validationMsg.textContent = `Vest event ${row.idx} has invalid numbers.`;
      saveState();
      return;
    }
    if (Math.abs(row.cashSplit + row.rsuSplit - 100) > 0.001) {
      validationMsg.textContent = `Vest event ${row.idx}: cash % and RSU % must add to 100.`;
      saveState();
      return;
    }
  }

  validationMsg.textContent = "";

  const baseSalaryTaxRate = baseSalaryTaxRatePct / 100;
  const taxableBaseSalary = Math.max(0, baseSalary - preTaxReduction);
  const baseSalaryTax = taxableBaseSalary * baseSalaryTaxRate;
  const baseSalaryNetCash = baseSalary - preTaxReduction - baseSalaryTax;

  const settledRows = vestInputs.map((row) => ({
    ...row,
    ...settleVestEvent(row.vestValue, row.cashSplit, row.rsuSplit, row.incomeTax)
  }));

  const totals = settledRows.reduce(
    (acc, row) => {
      acc.netVestCash += row.netCashFromVest;
      acc.outOfPocket += row.outOfPocketDraw;
      acc.rsuKept += row.rsuKept;
      return acc;
    },
    { netVestCash: 0, outOfPocket: 0, rsuKept: 0 }
  );

  const adjustedCashFlow = baseSalaryNetCash + totals.netVestCash - totals.outOfPocket;
  const annualContribution = preTaxReduction + Math.max(0, adjustedCashFlow);
  const desiredGap = annualContribution - desiredContribution;

  document.getElementById("outSection1Cash").textContent = toMoney(adjustedCashFlow);
  document.getElementById("outSection2Contribution").textContent = toMoney(annualContribution);
  document.getElementById("outSection3Rsu").textContent = toMoney(totals.rsuKept);
  document.getElementById("outDesiredGap").textContent = toMoney(desiredGap);

  const section1Note = document.getElementById("outSection1Note");
  section1Note.className = adjustedCashFlow >= 0 ? "good" : "warn";
  section1Note.textContent = `Base salary net cash ${toMoney(baseSalaryNetCash)} from ${toMoney(baseSalary)} with ${toMoney(preTaxReduction)} pre-tax reduction, taxed on ${toMoney(taxableBaseSalary)} at ${baseSalaryTaxRatePct.toFixed(1)}% (${toMoney(baseSalaryTax)} tax) + net vest cash ${toMoney(totals.netVestCash)} - uncovered vest tax ${toMoney(totals.outOfPocket)}.${
    adjustedCashFlow < 0 ? " Contribution is capped at $0.00 until allowance is positive." : ""
  }`;

  document.getElementById("outSection3Note").textContent = "Capital gains taxes are not modeled yet (cash-flow planner mode).";

  const desiredGapNote = document.getElementById("outDesiredGapNote");
  if (desiredGap === 0) {
    desiredGapNote.textContent = "No day-to-day leftover after hitting your investment target.";
    desiredGapNote.className = "good";
  } else if (desiredGap > 0) {
    desiredGapNote.textContent = `You have ${toMoney(desiredGap)} per year (${toMoney(desiredGap / 12)} per month) available for day-to-day spending after investing ${toMoney(desiredContribution)}. This includes ${toMoney(preTaxReduction)} of pre-tax investing.`;
    desiredGapNote.className = "good";
  } else {
    const shortfall = Math.abs(desiredGap);
    desiredGapNote.textContent = `You are short ${toMoney(shortfall)} per year (${toMoney(shortfall / 12)} per month) to both fund day-to-day spending at $0 leftover and invest ${toMoney(desiredContribution)}. This includes ${toMoney(preTaxReduction)} of pre-tax investing.`;
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
      <td>${toMoney(row.outOfPocketDraw)}</td>
      <td>${toMoney(row.rsuKept)}</td>
    `;
    breakdownBody.appendChild(tr);
  });

  saveState();
}

function bootstrap() {
  const vestRows = document.getElementById("vestRows");
  const saved = loadState();

  applyScalarInputState(saved);

  if (saved?.vestEvents && Array.isArray(saved.vestEvents) && saved.vestEvents.length > 0) {
    saved.vestEvents.forEach((event) => vestRows.appendChild(createVestRow(event)));
  } else {
    vestRows.appendChild(createVestRow());
  }

  document.getElementById("addVestRow").addEventListener("click", () => {
    vestRows.appendChild(createVestRow({ vestValue: 75000, cashSplit: 30, rsuSplit: 70, incomeTax: 45 }));
    runSimulation();
  });

  vestRows.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.removeRow === "1") {
      const rows = vestRows.querySelectorAll("tr");
      if (rows.length > 1) {
        target.closest("tr")?.remove();
        runSimulation();
      }
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches("input")) {
      runSimulation();
    }
  });

  runSimulation();
}

bootstrap();
