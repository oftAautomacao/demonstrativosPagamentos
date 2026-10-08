window.__painelCarregado = true;

const state = {
  data: null,
  activeId: null,
  activeTab: window.location.hash === "#relatorio-completo" ? "complete" : window.location.hash === "#ajuste-tuss" ? "tuss" : "overview",
  tussCache: new Map(),
  tussApplied: new Set(),
  tussLoadingFor: null,
  tussRequestToken: 0,
  desiredDateSaveTimer: null,
  selectedMonth: 0,
  selectedYear: 0,
};

const ids = [
  "root-path", "refresh-button", "report-count", "scan-status", "loading-state", "empty-state",
  "error-state", "error-message", "error-retry", "report-view", "period-previous", "period-label", "period-next",
  "plan-select", "agreement", "payments-body", "payments-foot",
  "report-sections", "raw-report-text", "toast", "tuss-refresh", "tuss-loading", "tuss-unavailable",
  "tuss-unavailable-title", "tuss-unavailable-message", "tuss-content", "tuss-file-count",
  "tuss-match-count", "tuss-status-summary", "tuss-status-text", "tuss-files", "tuss-apply", "tuss-result",
  "desired-date-panel", "desired-date-select",
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

function availablePeriods() {
  const periods = new Map();
  for (const report of state.data?.reports || []) {
    if (!report.periodMonth || !report.periodYear) continue;
    periods.set(`${report.periodYear}-${report.periodMonth}`, {
      month: report.periodMonth,
      year: report.periodYear,
    });
  }
  return [...periods.values()].sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));
}

function renderPlanSelect(reports) {
  elements["report-count"].textContent = reports.length;
  elements["plan-select"].innerHTML = reports.length
    ? reports.map((report) => `<option value="${escapeHtml(report.id)}">${escapeHtml(report.agreement)}</option>`).join("")
    : '<option value="">Nenhum plano disponível</option>';
  elements["plan-select"].value = state.activeId || "";
  elements["plan-select"].disabled = reports.length === 0;
}

function renderNavigation({ selectedMonth: forcedMonth = 0, selectedYear: forcedYear = 0 } = {}) {
  const current = activeReport() || newestReport(state.data.reports);
  const periods = availablePeriods();
  let selectedIndex = periods.findIndex((period) => period.month === forcedMonth && period.year === forcedYear);
  if (selectedIndex < 0) {
    selectedIndex = periods.findIndex((period) => period.month === current?.periodMonth && period.year === current?.periodYear);
  }
  if (selectedIndex < 0) selectedIndex = periods.length - 1;

  const selectedPeriod = periods[selectedIndex];
  const selectedMonth = selectedPeriod?.month || 0;
  const selectedYear = selectedPeriod?.year || 0;
  state.selectedMonth = selectedMonth;
  state.selectedYear = selectedYear;
  elements["period-label"].textContent = selectedPeriod
    ? `${monthNames[selectedMonth]} ${selectedYear}`
    : "Não identificado";
  elements["period-previous"].disabled = selectedIndex <= 0;
  elements["period-next"].disabled = selectedIndex < 0 || selectedIndex >= periods.length - 1;

  const available = selectedPeriod ? plansForPeriod(selectedMonth, selectedYear) : state.data.reports;
  if (!available.some((report) => report.id === state.activeId)) state.activeId = available[0]?.id || null;
  renderPlanSelect(available);
}

function movePeriod(direction) {
  const periods = availablePeriods();
  const currentIndex = periods.findIndex((period) => (
    period.month === state.selectedMonth && period.year === state.selectedYear
  ));
  const target = periods[currentIndex + direction];
  if (!target) return;
  renderNavigation({ selectedMonth: target.month, selectedYear: target.year });
  renderActiveReport();
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

function formatCount(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function showTussState(stateName) {
  elements["tuss-loading"].classList.toggle("hidden", stateName !== "loading");
  elements["tuss-unavailable"].classList.toggle("hidden", stateName !== "unavailable");
  elements["tuss-content"].classList.toggle("hidden", stateName !== "content");
}

function renderTussUnavailable(title, message) {
  elements["tuss-unavailable-title"].textContent = title;
  elements["tuss-unavailable-message"].textContent = message;
  elements["tuss-apply"].disabled = true;
  showTussState("unavailable");
}

function tussStatus(file) {
  if (file.correctionStatus === "corrected") return { icon: "✓", label: "Corrigido" };
  if (file.correctionStatus === "pending") return { icon: "!", label: `Pendente · ${formatCount(file.totalMatches)} correção(ões)` };
  if (file.correctionStatus === "not_needed") return { icon: "✓", label: "Sem ajuste necessário" };
  if (file.status === "no_tuss_column") return { icon: "!", label: "Coluna TUSS não encontrada" };
  if (file.status === "protected") return { icon: "!", label: "Arquivo protegido" };
  return { icon: "!", label: file.error || "Falha na análise" };
}

function renderTussAnalysis(analysis) {
  elements["tuss-result"].classList.add("hidden");
  elements["tuss-result"].innerHTML = "";
  if (!analysis.ready) {
    const title = !analysis.mapping?.found
      ? "Tabela de ajuste não encontrada"
      : analysis.totalFiles === 0
        ? "Demonstrativos não encontrados"
        : "A análise TUSS precisa de atenção";
    renderTussUnavailable(title, (analysis.messages || []).join(" ") || "Não foi possível preparar a comparação desta competência.");
    return;
  }

  elements["tuss-file-count"].textContent = formatCount(analysis.totalFiles);
  elements["tuss-match-count"].textContent = formatCount(analysis.totalMatches);
  elements["tuss-status-text"].textContent = analysis.allCorrected
    ? "Tudo corrigido"
    : `${formatCount(analysis.totalPendingFiles)} pendente(s)`;
  elements["tuss-status-summary"].classList.toggle("is-corrected", analysis.allCorrected);
  elements["tuss-status-summary"].classList.toggle("is-pending", !analysis.allCorrected);
  elements["tuss-files"].innerHTML = analysis.files.map((file) => {
    const correction = tussStatus(file);
    return `
    <article class="tuss-file ${file.status} ${file.correctionStatus || "unavailable"}">
      <div class="tuss-file-main">
        <span class="tuss-file-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6zM9 11h6M9 15h6M9 7h3" /></svg>
        </span>
        <span><strong>${escapeHtml(file.fileName)}</strong><small>${escapeHtml(file.relativePath)}</small></span>
      </div>
      <span class="tuss-format">${escapeHtml(file.format)}</span>
      <span class="tuss-file-status"><span class="tuss-status-icon" aria-hidden="true">${correction.icon}</span>${escapeHtml(correction.label)}</span>
      ${file.replacements?.length ? `<div class="tuss-change-list">${file.replacements.map((change) => `
        <span><code>${escapeHtml(change.current)}</code><b>→</b><code>${escapeHtml(change.new)}</code><strong>${formatCount(change.count)}×</strong></span>
      `).join("")}</div>` : ""}
    </article>`;
  }).join("");

  const alreadyApplied = state.tussApplied.has(state.activeId);
  elements["tuss-apply"].disabled = analysis.totalPendingMatches === 0 || alreadyApplied;
  elements["tuss-apply"].textContent = "Gerar";
  showTussState("content");
}

async function loadTussAnalysis({ force = false } = {}) {
  const report = activeReport();
  if (!report) return;
  if (!force && state.tussCache.has(report.id)) {
    renderTussAnalysis(state.tussCache.get(report.id));
    return;
  }
  if (!force && state.tussLoadingFor === report.id) return;
  if (force) {
    state.tussCache.delete(report.id);
    state.tussApplied.delete(report.id);
  }
  const requestToken = ++state.tussRequestToken;
  state.tussLoadingFor = report.id;
  elements["tuss-apply"].disabled = true;
  showTussState("loading");
  elements["tuss-result"].classList.add("hidden");
  try {
    const response = await fetch(`/api/tuss-analysis?reportId=${encodeURIComponent(report.id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || "Erro desconhecido");
    state.tussCache.set(report.id, data);
    if (requestToken === state.tussRequestToken && state.activeId === report.id) renderTussAnalysis(data);
  } catch (error) {
    if (requestToken === state.tussRequestToken && state.activeId === report.id) renderTussUnavailable("Não foi possível analisar os códigos TUSS", error.message);
  } finally {
    if (state.tussLoadingFor === report.id) state.tussLoadingFor = null;
  }
}

function renderActiveReport() {
  const report = activeReport();
  if (!report) return;

  elements.agreement.textContent = report.agreement;

  renderPayments(report);
  renderFullReport(report);
  if (state.activeTab === "tuss") loadTussAnalysis();
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".primary-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".primary-panel").forEach((panel) => panel.classList.add("hidden"));
  document.getElementById(`${tab}-panel`).classList.remove("hidden");
  const hash = tab === "complete" ? "#relatorio-completo" : tab === "tuss" ? "#ajuste-tuss" : window.location.pathname;
  history.replaceState(null, "", hash);
  if (tab === "tuss") loadTussAnalysis();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("visible"), 2200);
}

async function readApiResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(response.ok ? "O servidor retornou uma resposta inválida." : text || "Falha na comunicação com o servidor.");
  }
  if (!response.ok) throw new Error(data.detail || data.error || "Erro desconhecido");
  return data;
}

function fillDesiredDates(selectedMonth, selectedYear) {
  const dates = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(selectedYear, selectedMonth - 1 + index - 2, 1);
    return { month: date.getMonth() + 1, year: date.getFullYear() };
  });
  elements["desired-date-select"].innerHTML = dates.map(({ month, year }) => {
    const value = `${year}-${String(month).padStart(2, "0")}`;
    return `<option value="${value}">${escapeHtml(`${monthNames[month]} ${year}`)}</option>`;
  }).join("");
  elements["desired-date-select"].value = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
}

async function loadDesiredDate() {
  try {
    const response = await fetch("/api/control-date", { cache: "no-store" });
    const data = await readApiResponse(response);
    fillDesiredDates(data.month, data.year);
  } catch (error) {
    fillDesiredDates(new Date().getMonth() + 1, new Date().getFullYear());
    showToast(error.message);
  }
}

async function saveDesiredDate() {
  const panel = elements["desired-date-panel"];
  const [year, month] = elements["desired-date-select"].value.split("-").map(Number);
  panel.classList.add("saving");
  try {
    const response = await fetch("/api/control-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        year,
      }),
    });
    const data = await readApiResponse(response);
    fillDesiredDates(data.month, data.year);
    showToast(`Data Desejada: ${data.value}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    panel.classList.remove("saving");
  }
}

function scheduleDesiredDateSave() {
  clearTimeout(state.desiredDateSaveTimer);
  state.desiredDateSaveTimer = setTimeout(saveDesiredDate, 300);
}

async function loadReports({ quiet = false } = {}) {
  if (!quiet) showOnly(elements["loading-state"]);
  elements["refresh-button"].classList.add("loading");
  try {
    const response = await fetch("/api/reports", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || "Erro desconhecido");
    state.data = data;
    state.tussCache.clear();
    state.tussApplied.clear();
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
elements["desired-date-select"].addEventListener("change", scheduleDesiredDateSave);
elements["desired-date-panel"].addEventListener("submit", (event) => {
  event.preventDefault();
  scheduleDesiredDateSave();
});
elements["plan-select"].addEventListener("change", (event) => {
  state.activeId = event.target.value;
  renderActiveReport();
});
elements["period-previous"].addEventListener("click", () => movePeriod(-1));
elements["period-next"].addEventListener("click", () => movePeriod(1));
document.querySelector(".primary-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (button) setActiveTab(button.dataset.tab);
});
elements["tuss-refresh"].addEventListener("click", () => loadTussAnalysis({ force: true }));
elements["tuss-apply"].addEventListener("click", async () => {
  const report = activeReport();
  const analysis = report ? state.tussCache.get(report.id) : null;
  if (!report || !analysis || analysis.totalPendingMatches === 0) return;

  const button = elements["tuss-apply"];
  button.disabled = true;
  button.textContent = "Gerando...";
  try {
    const response = await fetch("/api/tuss-corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId: report.id, confirmed: true }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || "Erro desconhecido");
    await loadTussAnalysis({ force: true });
    elements["tuss-result"].innerHTML = data.applied
      ? `<strong>${formatCount(data.totalReplacements)} correção(ões) concluída(s)</strong><span>Arquivos criados em <code>${escapeHtml(data.outputFolder)}</code>.</span><ul>${data.outputs.map((item) => `<li>${escapeHtml(item.output)} — ${formatCount(item.replacements)} alteração(ões)</li>`).join("")}</ul>`
      : `<strong>Nenhuma correção necessária</strong><span>${escapeHtml(data.message || "Os códigos já estão atualizados.")}</span>`;
    elements["tuss-result"].classList.remove("hidden");
    button.textContent = "Gerar";
    showToast("Correções TUSS concluídas");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Gerar";
    elements["tuss-result"].innerHTML = `<strong>Falha ao gerar os arquivos</strong><span>${escapeHtml(error.message)}</span>`;
    elements["tuss-result"].classList.remove("hidden");
  }
});
loadReports();
loadDesiredDate();
