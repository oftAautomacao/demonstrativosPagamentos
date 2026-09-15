window.__painelCarregado = true;

const state = {
  data: null,
  activeId: null,
  activeTab: window.location.hash === "#relatorio-completo" ? "complete" : "overview",
};

const ids = [
  "root-path", "refresh-button", "report-count", "scan-status", "loading-state", "empty-state",
  "error-state", "error-message", "error-retry", "report-view", "month-select", "year-select",
  "plan-list", "agreement", "payments-body", "payments-foot",
  "report-sections", "raw-report-text", "toast",
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthNames = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatMoney(cents) {
  return money.format((cents || 0) / 100);
}

function escapeHtml(value = "") {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function showOnly(target) {
  [elements["loading-state"], elements["empty-state"], elements["error-state"], elements["report-view"]]
    .forEach((element) => element.classList.toggle("hidden", element !== target));
}

function activeReport() {
  return state.data?.reports.find((report) => report.id === state.activeId) || null;
}

function newestReport(reports) {
  return [...reports].sort((a, b) => {
    const periodA = (a.periodYear || 0) * 100 + (a.periodMonth || 0);
    const periodB = (b.periodYear || 0) * 100 + (b.periodMonth || 0);
    return periodB - periodA || String(b.generatedAt).localeCompare(String(a.generatedAt));
  })[0];
}

function uniqueSorted(values, descending = false) {
  const result = [...new Set(values)];
  result.sort((a, b) => typeof a === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR"));
  return descending ? result.reverse() : result;
}

function fillSelect(select, values, selectedValue, labeler) {
  select.innerHTML = values.map((value) => `<option value="${escapeHtml(String(value))}">${escapeHtml(labeler(value))}</option>`).join("");
  select.value = String(selectedValue);
}

function reportsForPeriod(month, year) {
  return state.data.reports.filter((report) => report.periodMonth === month && report.periodYear === year);
}

function plansForPeriod(month, year) {
  const byPlan = new Map();
  for (const report of reportsForPeriod(month, year)) {
    const existing = byPlan.get(report.agreement);
    byPlan.set(report.agreement, newestReport([existing, report].filter(Boolean)));
  }
  return [...byPlan.values()].sort((a, b) => a.agreement.localeCompare(b.agreement, "pt-BR"));
}

function renderPlanList(reports) {
  elements["report-count"].textContent = reports.length;
  elements["plan-list"].innerHTML = reports.map((report) => `
    <button type="button" class="plan-item ${report.id === state.activeId ? "active" : ""}" data-report-id="${report.id}">
      <span class="plan-item-icon"><svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6zM9 11h6M9 15h6M9 7h3" /></svg></span>
      <span><strong>${escapeHtml(report.agreement)}</strong></span>
      <span class="plan-chevron">›</span>
    </button>
  `).join("");
}

function renderNavigation({ selectedMonth: forcedMonth = 0, selectedYear: forcedYear = 0 } = {}) {
  const current = activeReport() || newestReport(state.data.reports);
  const years = uniqueSorted(state.data.reports.map((report) => report.periodYear).filter(Boolean), true);
  const selectedYear = forcedYear || current?.periodYear || years[0];
  const months = uniqueSorted(state.data.reports
    .filter((report) => report.periodYear === selectedYear)
    .map((report) => report.periodMonth)
    .filter(Boolean), true);
  const selectedMonth = forcedMonth || (current?.periodYear === selectedYear ? current.periodMonth : 0) || months[0];

  fillSelect(elements["month-select"], months.length ? months : [""], selectedMonth || "", (value) => monthNames[value] || "Não identificado");
  fillSelect(elements["year-select"], years.length ? years : [""], selectedYear || "", (value) => value || "Não identificado");
  elements["month-select"].disabled = months.length === 0;
  elements["year-select"].disabled = years.length === 0;

  const available = years.length ? plansForPeriod(Number(selectedMonth), Number(selectedYear)) : state.data.reports;
  if (!available.some((report) => report.id === state.activeId)) state.activeId = available[0]?.id || null;
  renderPlanList(available);
}

function renderPayments(report) {
  const rows = report.paymentsByDate || [];
  elements["payments-body"].innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td><span class="payment-date-cell"><span class="date-dot"></span><strong>${escapeHtml(row.paymentDate)}</strong></span></td>
        <td class="number"><span class="amount-value">${formatMoney(row.paymentCents)}</span></td>
      </tr>
    `).join("")
    : '<tr><td colspan="2" class="table-empty">Nenhum pagamento identificado na tabela.</td></tr>';
  elements["payments-foot"].innerHTML = `
    <tr><td><span class="total-label">Somatório total</span></td><td class="number"><span class="total-value">${formatMoney(report.totals.paymentCents)}</span></td></tr>
  `;
}

function renderFullReport(report) {
  elements["report-sections"].innerHTML = report.fullSections.length
    ? report.fullSections.map((section, index) => `
      <details class="report-section" ${index === 0 ? "open" : ""}>
        <summary><span class="section-index">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.category || "Informações adicionais")}</small></span><span class="chevron"></span></summary>
        ${section.fields?.length ? `<div class="smart-fields">${section.fields.map((field) => `
          <div><small>${escapeHtml(field.label)}</small><strong>${escapeHtml(field.value)}</strong></div>
        `).join("")}</div>` : ""}
        <pre>${escapeHtml(section.content)}</pre>
      </details>
    `).join("")
    : '<p class="table-empty">Não foi possível separar o relatório em seções.</p>';
  elements["raw-report-text"].textContent = report.rawText || "";
}

function renderActiveReport() {
  const report = activeReport();
  if (!report) return;

  elements.agreement.textContent = report.agreement;

  renderPayments(report);
  renderFullReport(report);
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".primary-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".primary-panel").forEach((panel) => panel.classList.add("hidden"));
  document.getElementById(`${tab}-panel`).classList.remove("hidden");
  history.replaceState(null, "", tab === "complete" ? "#relatorio-completo" : window.location.pathname);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("visible"), 2200);
}

async function loadReports({ quiet = false } = {}) {
  if (!quiet) showOnly(elements["loading-state"]);
  elements["refresh-button"].classList.add("loading");
  try {
    const response = await fetch("/api/reports", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || "Erro desconhecido");
    state.data = data;
    if (!data.reports.length) {
      showOnly(elements["empty-state"]);
      return;
    }
    if (!data.reports.some((report) => report.id === state.activeId)) state.activeId = newestReport(data.reports).id;
    elements["root-path"].textContent = data.rootPath;
    elements["scan-status"].textContent = `${data.scannedFiles} arquivo(s) lido(s)`;
    renderNavigation();
    renderActiveReport();
    setActiveTab(state.activeTab);
    showOnly(elements["report-view"]);
    if (quiet) showToast("Relatórios atualizados");
  } catch (error) {
    elements["error-message"].textContent = error.message;
    showOnly(elements["error-state"]);
  } finally {
    elements["refresh-button"].classList.remove("loading");
  }
}

elements["refresh-button"].addEventListener("click", () => loadReports({ quiet: true }));
elements["error-retry"].addEventListener("click", () => loadReports());
elements["plan-list"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-report-id]");
  if (!button) return;
  state.activeId = button.dataset.reportId;
  renderPlanList(plansForPeriod(Number(elements["month-select"].value), Number(elements["year-select"].value)));
  renderActiveReport();
});
elements["month-select"].addEventListener("change", (event) => {
  renderNavigation({ selectedMonth: Number(event.target.value), selectedYear: Number(elements["year-select"].value) });
  renderActiveReport();
});
elements["year-select"].addEventListener("change", (event) => {
  renderNavigation({ selectedYear: Number(event.target.value) });
  renderActiveReport();
});
document.querySelector(".primary-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (button) setActiveTab(button.dataset.tab);
});
loadReports();
