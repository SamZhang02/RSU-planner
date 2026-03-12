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

function runSimulation() {
  const validationMsg = document.getElementById("validationMsg");
  const annualCashFlow = Number(document.getElementById("annualCashFlow").value);
  const desiredContribution = Math.max(0, Number(document.getElementById("desiredContribution").value));
  const vestInputs = parseVestRows();

  if ([annualCashFlow, desiredContribution].some((n) => Number.isNaN(n))) {
    validationMsg.textContent = "Please enter valid numeric inputs for Sections 1 and 2.";
    return;
  }

  if (vestInputs.length === 0) {
    validationMsg.textContent = "Add at least one vest event in Section 3.";
    return;
  }

  for (const row of vestInputs) {
    const numbers = [row.vestValue, row.cashSplit, row.rsuSplit, row.incomeTax];
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

  const adjustedCashFlow = annualCashFlow + totals.netVestCash - totals.outOfPocket;
  const annualContribution = Math.max(0, adjustedCashFlow);
  const extraCashNeeded = Math.max(0, desiredContribution - adjustedCashFlow);
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

  document.getElementById("outSection3Note").textContent = "Capital gains taxes are not modeled yet (cash-flow planner mode).";

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
      <td>${toMoney(row.outOfPocketDraw)}</td>
      <td>${toMoney(row.rsuKept)}</td>
    `;
    breakdownBody.appendChild(tr);
  });
}

function bootstrap() {
  const vestRows = document.getElementById("vestRows");
  vestRows.appendChild(createVestRow());

  document.getElementById("addVestRow").addEventListener("click", () => {
    vestRows.appendChild(createVestRow({ vestValue: 75000, cashSplit: 30, rsuSplit: 70, incomeTax: 45 }));
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
  runSimulation();
}

bootstrap();
