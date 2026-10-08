window.__painelCarregado = true;

const state = {
  data: null,
  activeId: null,
  activeTab: window.location.hash === "#pagamentos"
    ? "payments"
    : ["#convenios", "#ajuste-tuss", "#login-senha"].includes(window.location.hash)
      ? "plans"
      : "config",
  planView: window.location.hash === "#login-senha" ? "credentials" : "tuss",
  reportInnerView: "summary",
  tussCache: new Map(),
  tussApplied: new Set(),
  tussLoadingFor: null,
  tussRequestToken: 0,
  tussWorkspaceView: "tables",
  tussTables: [],
  tussTablesLoaded: false,
  tussTableSaveTimers: new Map(),
  tussTableRevisions: new Map(),
  tussTableSaving: new Set(),
  tussTablePending: new Set(),
  planCredentials: [],
  planCredentialsLoaded: false,
  planCredentialSaveTimers: new Map(),
  planCredentialRevisions: new Map(),
  planCredentialSaving: new Set(),
  planCredentialPending: new Set(),
  desiredDateSaveTimer: null,
  selectedMonth: 0,
  selectedYear: 0,
  importConfig: [],
  importConfigLoaded: false,
  importConfigDirty: false,
  importConfigSaveTimer: null,
  controlPayments: [],
  controlPaymentsLoaded: false,
};

const ids = [
  "root-path", "refresh-button", "scan-status", "loading-state", "empty-state",
  "error-state", "error-message", "error-retry", "report-view", "period-previous", "period-label", "period-next",
  "plan-select", "agreement",
  "report-document-title", "report-payment-date", "report-generated-date", "report-processed-period",
  "description-payment-head", "description-payment-body", "description-payment-foot",
  "raw-report-text", "toast", "tuss-refresh", "tuss-loading", "tuss-unavailable",
  "tuss-unavailable-title", "tuss-unavailable-message", "tuss-content", "tuss-file-count",
  "tuss-match-count", "tuss-status-summary", "tuss-status-text", "tuss-files", "tuss-apply", "tuss-result",
  "tuss-workspace-tabs", "tuss-table-editor-view", "tuss-analysis-view", "tuss-table-refresh",
  "tuss-table-loading", "tuss-table-message", "tuss-table-list",
  "desired-date-panel", "desired-date-select", "config-tab", "plans-tab", "plan-inner-tabs", "report-internal-menu", "report-inner-tabs",
  "header-period-filter", "header-plan-filter", "report-subtitle", "demonstrative-summary", "embedded-full-report",
  "guide-information", "guide-groups",
  "config-panel", "config-add", "config-loading", "config-message", "config-content",
  "config-rows",
  "control-payments-tab", "demonstrative-tab", "control-payments-loading", "control-payments-message",
  "control-payments-content", "control-payments-rows",
  "plan-tuss-view", "plan-credentials-view", "plan-credentials-refresh", "plan-credentials-loading",
  "plan-credentials-message", "plan-credentials-list",
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const monthNames = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function escapeHtml(value = "") {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML.replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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

function normalizedText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function descriptionCellClass(column) {
  return /valor|pcc|irrf|iss|inss/.test(normalizedText(column)) ? "number" : "";
}

function renderPaymentDescription(report) {
  elements["report-document-title"].textContent = report.title || "Relatório de demonstrativos de pagamento";
  elements["report-payment-date"].textContent = report.paymentDateText || report.paymentDates?.join(" · ") || "Não informado";
  elements["report-generated-date"].textContent = report.generatedAt || "Não informado";
  elements["report-processed-period"].textContent = report.processedPeriod || (report.periodMonthName && report.periodYear ? `${report.periodMonthName.toLocaleUpperCase("pt-BR")}/${report.periodYear}` : "Não informado");

  const description = report.paymentDescription || { columns: [], rows: [], total: [] };
  elements["description-payment-head"].innerHTML = description.columns.length
    ? `<tr>${description.columns.map((column) => `<th class="${descriptionCellClass(column)}">${escapeHtml(column)}</th>`).join("")}</tr>`
    : "";
  elements["description-payment-body"].innerHTML = description.rows.length
    ? description.rows.map((row) => `<tr>${description.columns.map((column, index) => `<td class="${descriptionCellClass(column)}">${escapeHtml(row[index] || "—")}</td>`).join("")}</tr>`).join("")
    : '<tr><td class="table-empty">A tabela DESCRIÇÃO PAGAMENTO não foi encontrada neste relatório.</td></tr>';
  elements["description-payment-foot"].innerHTML = description.total?.length
    ? `<tr>${description.columns.map((column, index) => `<td class="${descriptionCellClass(column)}">${escapeHtml(description.total[index] || "")}</td>`).join("")}</tr>`
    : "";
}

function renderGuideInformation(report) {
  const groups = report.guideInformation || [];
  elements["guide-groups"].innerHTML = groups.length
    ? groups.map((group) => `
      <article class="guide-group">
        <header class="guide-group-heading">
          <span><small>Data de pagamento</small><strong>${escapeHtml(group.paymentDate || "Não informada")}</strong></span>
          <span class="guide-count">${group.rows.length.toLocaleString("pt-BR")} guia(s)</span>
        </header>
        <div class="table-scroll">
          <table class="guide-table">
            <thead><tr>${group.columns.map((column) => `<th class="${descriptionCellClass(column)}">${escapeHtml(column)}</th>`).join("")}</tr></thead>
            <tbody>${group.rows.map((row) => `<tr>${group.columns.map((column, index) => `<td class="${descriptionCellClass(column)}">${escapeHtml(row[index] || "—")}</td>`).join("")}</tr>`).join("")}</tbody>
            ${group.total?.length ? `<tfoot><tr>${group.columns.map((column, index) => `<td class="${descriptionCellClass(column)}">${escapeHtml(group.total[index] || "")}</td>`).join("")}</tr></tfoot>` : ""}
          </table>
        </div>
      </article>
    `).join("")
    : '<div class="config-message">A seção INFORMAÇÕES GUIAS não foi encontrada neste relatório.</div>';
}

function renderFullReport(report) {
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

function tussCellDisplay(value, columnLabel) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && normalizedText(columnLabel) === "valor") {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}

function showTussTableMessage(message, isError = false) {
  elements["tuss-table-message"].textContent = message;
  elements["tuss-table-message"].classList.toggle("hidden", !message);
  elements["tuss-table-message"].classList.toggle("is-error", isError);
}

function renderTussTables() {
  const tables = state.tussTables;
  if (!tables.length) {
    elements["tuss-table-list"].innerHTML = "";
    elements["tuss-table-list"].classList.add("hidden");
    showTussTableMessage("Nenhuma tabela Ajuste Codigo TUSS.xlsx foi encontrada nos convênios.");
    return;
  }

  showTussTableMessage("");
  elements["tuss-table-list"].innerHTML = tables.map((table) => `
    <article class="tuss-table-card" data-table-id="${escapeHtml(table.id)}">
      <header class="tuss-table-card-header">
        <span class="tuss-table-plan"><span class="config-row-dot" aria-hidden="true"></span><span><strong>${escapeHtml(table.planName)}</strong><small>${escapeHtml(table.fileName)} · ${escapeHtml(table.sheetName)}</small></span></span>
        <span class="tuss-table-save-status" data-table-status="${escapeHtml(table.id)}">Salvo</span>
      </header>
      <div class="table-scroll">
        <table class="tuss-edit-table">
          <thead><tr>${table.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}<th class="tuss-row-action-heading"><span class="visually-hidden">Ações</span></th></tr></thead>
          <tbody>
            ${table.rows.length ? table.rows.map((row, rowIndex) => `
              <tr>
                ${table.columns.map((column, columnIndex) => `<td><input type="text" value="${escapeHtml(tussCellDisplay(row.values[columnIndex], column.label))}" data-tuss-row="${rowIndex}" data-tuss-column="${columnIndex}" aria-label="${escapeHtml(column.label)} da linha ${rowIndex + 1}" /></td>`).join("")}
                <td class="tuss-row-action">
                  <button type="button" data-tuss-remove="${rowIndex}" title="Excluir linha" aria-label="Excluir linha ${rowIndex + 1}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
                  </button>
                </td>
              </tr>
            `).join("") : `<tr class="tuss-empty-table"><td colspan="${table.columns.length + 1}">A tabela está vazia.</td></tr>`}
          </tbody>
        </table>
      </div>
    </article>
  `).join("");
  elements["tuss-table-list"].classList.remove("hidden");
}

async function loadTussTables({ force = false } = {}) {
  if (state.tussTablesLoaded && !force) {
    renderTussTables();
    return;
  }
  elements["tuss-table-loading"].classList.remove("hidden");
  elements["tuss-table-list"].classList.add("hidden");
  showTussTableMessage("");
  try {
    const response = await fetch("/api/tuss-tables", { cache: "no-store" });
    const data = await readApiResponse(response);
    state.tussTables = data.tables || [];
    state.tussTablesLoaded = true;
    state.tussTableRevisions.clear();
    renderTussTables();
    if (data.errors?.length) {
      showToast(`${data.errors.length} tabela(s) TUSS precisam de atenção`);
    }
  } catch (error) {
    state.tussTablesLoaded = false;
    showTussTableMessage(error.message, true);
  } finally {
    elements["tuss-table-loading"].classList.add("hidden");
  }
}

function tussTableById(tableId) {
  return state.tussTables.find((table) => table.id === tableId);
}

function setTussTableStatus(tableId, text, stateName = "") {
  const status = elements["tuss-table-list"].querySelector(`[data-table-status="${tableId}"]`);
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("is-saving", stateName === "saving");
  status.classList.toggle("is-error", stateName === "error");
}

function scheduleTussTableSave(tableId, immediate = false) {
  clearTimeout(state.tussTableSaveTimers.get(tableId));
  setTussTableStatus(tableId, "Salvando...", "saving");
  const timer = setTimeout(() => saveTussTable(tableId), immediate ? 0 : 650);
  state.tussTableSaveTimers.set(tableId, timer);
}

async function saveTussTable(tableId) {
  const table = tussTableById(tableId);
  if (!table) return;
  if (state.tussTableSaving.has(tableId)) {
    state.tussTablePending.add(tableId);
    return;
  }

  state.tussTableSaving.add(tableId);
  state.tussTableSaveTimers.delete(tableId);
  const revision = state.tussTableRevisions.get(tableId) || 0;
  const rows = table.rows.map((row) => ({ values: [...row.values] }));
  try {
    const response = await fetch("/api/tuss-tables", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId, version: table.version, rows }),
    });
    const data = await readApiResponse(response);
    const currentRevision = state.tussTableRevisions.get(tableId) || 0;
    if (currentRevision === revision) {
      const index = state.tussTables.findIndex((item) => item.id === tableId);
      if (index >= 0) state.tussTables[index] = data.table;
      setTussTableStatus(tableId, "Salvo");
    } else {
      table.version = data.table.version;
      state.tussTablePending.add(tableId);
    }
  } catch (error) {
    setTussTableStatus(tableId, "Erro ao salvar", "error");
    showToast(error.message);
  } finally {
    state.tussTableSaving.delete(tableId);
    if (state.tussTablePending.delete(tableId)) scheduleTussTableSave(tableId, true);
  }
}

function showPlanCredentialsMessage(message, isError = false) {
  elements["plan-credentials-message"].textContent = message;
  elements["plan-credentials-message"].classList.toggle("hidden", !message);
  elements["plan-credentials-message"].classList.toggle("is-error", isError);
}

function renderPlanCredentials() {
  const plans = state.planCredentials;
  if (!plans.length) {
    elements["plan-credentials-list"].innerHTML = "";
    elements["plan-credentials-list"].classList.add("hidden");
    showPlanCredentialsMessage("Nenhum arquivo LoginSenha.txt foi encontrado nos convênios.");
    return;
  }

  showPlanCredentialsMessage("");
  elements["plan-credentials-list"].innerHTML = plans.map((plan) => `
    <article class="credential-card" data-credential-id="${escapeHtml(plan.id)}">
      <header class="tuss-table-card-header">
        <span class="tuss-table-plan"><span class="config-row-dot" aria-hidden="true"></span><span><strong>${escapeHtml(plan.planName)}</strong><small>${escapeHtml(plan.fileName)}</small></span></span>
        <span class="tuss-table-save-status" data-credential-status="${escapeHtml(plan.id)}">Salvo</span>
      </header>
      <div class="credential-fields">
        ${plan.fields.map((field) => `
          <label class="credential-field">
            <span>${escapeHtml(field.label)}</span>
            <span class="credential-input-wrap">
              <input type="${field.sensitive ? "password" : "text"}" value="${escapeHtml(field.value)}" data-credential-field="${escapeHtml(field.id)}" autocomplete="off" spellcheck="false" />
              ${field.sensitive ? `<button type="button" data-credential-reveal="${escapeHtml(field.id)}" title="Mostrar senha" aria-label="Mostrar ${escapeHtml(field.label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/></svg></button>` : ""}
            </span>
          </label>
        `).join("")}
      </div>
    </article>
  `).join("");
  elements["plan-credentials-list"].classList.remove("hidden");
}

async function loadPlanCredentials({ force = false } = {}) {
  if (state.planCredentialsLoaded && !force) {
    renderPlanCredentials();
    return;
  }
  elements["plan-credentials-loading"].classList.remove("hidden");
  elements["plan-credentials-list"].classList.add("hidden");
  showPlanCredentialsMessage("");
  try {
    const response = await fetch("/api/plan-credentials", { cache: "no-store" });
    const data = await readApiResponse(response);
    state.planCredentials = data.plans || [];
    state.planCredentialsLoaded = true;
    state.planCredentialRevisions.clear();
    renderPlanCredentials();
    if (data.errors?.length) showToast(`${data.errors.length} arquivo(s) de acesso precisam de atenção`);
  } catch (error) {
    state.planCredentialsLoaded = false;
    showPlanCredentialsMessage(error.message, true);
  } finally {
    elements["plan-credentials-loading"].classList.add("hidden");
  }
}

function planCredentialById(planId) {
  return state.planCredentials.find((plan) => plan.id === planId);
}

function setPlanCredentialStatus(planId, text, stateName = "") {
  const status = elements["plan-credentials-list"].querySelector(`[data-credential-status="${planId}"]`);
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("is-saving", stateName === "saving");
  status.classList.toggle("is-error", stateName === "error");
}

function schedulePlanCredentialSave(planId, immediate = false) {
  clearTimeout(state.planCredentialSaveTimers.get(planId));
  setPlanCredentialStatus(planId, "Salvando...", "saving");
  const timer = setTimeout(() => savePlanCredentials(planId), immediate ? 0 : 650);
  state.planCredentialSaveTimers.set(planId, timer);
}

async function savePlanCredentials(planId) {
  const plan = planCredentialById(planId);
  if (!plan) return;
  if (state.planCredentialSaving.has(planId)) {
    state.planCredentialPending.add(planId);
    return;
  }
  state.planCredentialSaving.add(planId);
  state.planCredentialSaveTimers.delete(planId);
  const revision = state.planCredentialRevisions.get(planId) || 0;
  const fields = plan.fields.map((field) => ({ id: field.id, value: field.value }));
  try {
    const response = await fetch("/api/plan-credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, version: plan.version, fields }),
    });
    const data = await readApiResponse(response);
    const currentRevision = state.planCredentialRevisions.get(planId) || 0;
    if (currentRevision === revision) {
      const index = state.planCredentials.findIndex((item) => item.id === planId);
      if (index >= 0) state.planCredentials[index] = data.plan;
      setPlanCredentialStatus(planId, "Salvo");
    } else {
      plan.version = data.plan.version;
      state.planCredentialPending.add(planId);
    }
  } catch (error) {
    setPlanCredentialStatus(planId, "Erro ao salvar", "error");
    showToast(error.message);
  } finally {
    state.planCredentialSaving.delete(planId);
    if (state.planCredentialPending.delete(planId)) schedulePlanCredentialSave(planId, true);
  }
}

function updateReportSelectionVisibility() {
  const visible = state.activeTab === "overview" || (
    state.activeTab === "plans" && state.planView === "tuss" && state.tussWorkspaceView === "analysis"
  );
  elements["report-internal-menu"].classList.toggle("hidden", !visible);
  elements["header-period-filter"].classList.toggle("hidden", !visible);
  elements["header-plan-filter"].classList.toggle("hidden", !visible);
  elements["report-inner-tabs"].classList.toggle("hidden", state.activeTab !== "overview");
}

function setTussWorkspaceView(view) {
  state.tussWorkspaceView = view === "analysis" ? "analysis" : "tables";
  elements["tuss-table-editor-view"].classList.toggle("hidden", state.tussWorkspaceView !== "tables");
  elements["tuss-analysis-view"].classList.toggle("hidden", state.tussWorkspaceView !== "analysis");
  elements["tuss-workspace-tabs"].querySelectorAll("[data-tuss-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tussView === state.tussWorkspaceView);
  });
  updateReportSelectionVisibility();
  if (state.activeTab !== "plans" || state.planView !== "tuss") return;
  if (state.tussWorkspaceView === "tables") loadTussTables();
  else loadTussAnalysis();
}

function setPlanView(view) {
  state.planView = view === "credentials" ? "credentials" : "tuss";
  elements["plan-tuss-view"].classList.toggle("hidden", state.planView !== "tuss");
  elements["plan-credentials-view"].classList.toggle("hidden", state.planView !== "credentials");
  elements["plan-inner-tabs"].querySelectorAll("[data-plan-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.planView === state.planView);
  });
  updateReportSelectionVisibility();
  if (state.activeTab !== "plans") return;
  elements.agreement.textContent = "Convênios";
  elements["report-subtitle"].textContent = state.planView === "tuss" ? "Ajuste TUSS" : "Login e senha";
  elements["report-subtitle"].classList.remove("hidden");
  history.replaceState(null, "", state.planView === "credentials" ? "#login-senha" : "#ajuste-tuss");
  if (state.planView === "tuss") setTussWorkspaceView(state.tussWorkspaceView);
  else loadPlanCredentials();
}

function renderActiveReport() {
  const report = activeReport();
  if (!report) return;

  if (state.activeTab === "overview") elements.agreement.textContent = report.agreement;

  renderPaymentDescription(report);
  renderGuideInformation(report);
  renderFullReport(report);
  if (state.activeTab === "plans" && state.planView === "tuss" && state.tussWorkspaceView === "analysis") loadTussAnalysis();
}

function setReportInnerView(view) {
  state.reportInnerView = view;
  elements["demonstrative-summary"].classList.toggle("hidden", view !== "summary");
  elements["embedded-full-report"].classList.toggle("hidden", view !== "full");
  elements["guide-information"].classList.toggle("hidden", view !== "guides");
  elements["report-inner-tabs"].querySelectorAll("[data-report-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.reportView === view);
  });
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelector(".report-title-group").classList.toggle("compact-title", ["config", "plans", "payments"].includes(tab));
  document.querySelectorAll(".sidebar-nav-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.sidebarTab === tab);
  });
  document.querySelectorAll(".primary-panel").forEach((panel) => panel.classList.add("hidden"));
  document.getElementById(`${tab}-panel`).classList.remove("hidden");
  elements["plan-inner-tabs"].classList.toggle("hidden", tab !== "plans");
  updateReportSelectionVisibility();
  if (tab === "config") {
    elements.agreement.textContent = "Configuração de importação";
    elements["report-subtitle"].textContent = "";
    elements["report-subtitle"].classList.add("hidden");
  } else if (tab === "payments") {
    elements.agreement.textContent = "Pagamentos e importações";
    elements["report-subtitle"].textContent = "";
    elements["report-subtitle"].classList.add("hidden");
  } else if (tab === "plans") {
    elements.agreement.textContent = "Convênios";
    elements["report-subtitle"].classList.remove("hidden");
  } else {
    elements.agreement.textContent = activeReport()?.agreement || "Intermedica";
    elements["report-subtitle"].textContent = "Demonstrativo de pagamento";
    elements["report-subtitle"].classList.remove("hidden");
  }
  if (tab !== "plans") {
    const hash = tab === "config" ? "#configuracao" : tab === "payments" ? "#pagamentos" : window.location.pathname;
    history.replaceState(null, "", hash);
  }
  if (tab === "overview") setReportInnerView("summary");
  if (tab === "config") loadImportConfig();
  if (tab === "payments") loadControlPayments();
  if (tab === "plans") setPlanView(state.planView);
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

function renderImportConfig() {
  const rows = state.importConfig;
  elements["config-rows"].innerHTML = rows.length
    ? rows.map((row, index) => `
      <tr data-index="${index}">
        <td>
          <div class="config-name-cell">
            <span class="config-row-dot" aria-hidden="true"></span>
            <input type="text" maxlength="16" data-field="agreement" value="${escapeHtml(row.agreement)}" aria-label="Convênio da linha ${index + 1}" />
          </div>
        </td>
        <td>
          <select data-field="execute" aria-label="Executar importação da linha ${index + 1}">
            <option value="Sim" ${row.execute === "Sim" ? "selected" : ""}>Sim</option>
            <option value="Nao" ${row.execute === "Nao" ? "selected" : ""}>Não</option>
          </select>
        </td>
        <td><input class="config-schedule" type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-field="schedule" value="${escapeHtml(row.schedule)}" aria-label="Agendamento da linha ${index + 1}" /></td>
        <td>
          <button class="config-remove-button" type="button" data-remove="${index}" title="Remover convênio" aria-label="Remover convênio da linha ${index + 1}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
          </button>
        </td>
      </tr>
    `).join("")
    : '<tr class="config-empty-row"><td colspan="4">Nenhum convênio configurado. Clique em Adicionar para criar uma linha.</td></tr>';
}

function showConfigError(message) {
  elements["config-message"].textContent = message;
  elements["config-message"].classList.toggle("hidden", !message);
}

async function loadImportConfig({ force = false } = {}) {
  if (state.importConfigLoaded && !force) return;
  elements["config-loading"].classList.remove("hidden");
  elements["config-content"].classList.add("hidden");
  showConfigError("");
  try {
    const response = await fetch("/api/import-config", { cache: "no-store" });
    const data = await readApiResponse(response);
    state.importConfig = data.rows || [];
    state.importConfigLoaded = true;
    state.importConfigDirty = false;
    renderImportConfig();
    elements["config-content"].classList.remove("hidden");
  } catch (error) {
    state.importConfigLoaded = false;
    showConfigError(error.message);
  } finally {
    elements["config-loading"].classList.add("hidden");
  }
}

function importConfigIsComplete() {
  const names = new Set();
  return state.importConfig.every((row) => {
    const agreement = String(row.agreement || "").trim();
    const schedule = String(row.schedule || "").trim();
    const key = agreement.toLocaleLowerCase("pt-BR");
    if (!agreement || agreement.length > 16 || names.has(key) || !/^\d{2}\/\d{2}\/\d{4}$/.test(schedule)) return false;
    names.add(key);
    const [day, month, year] = schedule.split("/").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  });
}

function scheduleImportConfigSave() {
  clearTimeout(state.importConfigSaveTimer);
  state.importConfigDirty = true;
  if (!importConfigIsComplete()) {
    return;
  }
  state.importConfigSaveTimer = setTimeout(saveImportConfig, 600);
}

async function saveImportConfig() {
  const rowsToSave = state.importConfig.map((row) => ({ ...row }));
  const serializedRows = JSON.stringify(rowsToSave);
  showConfigError("");
  try {
    const response = await fetch("/api/import-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rowsToSave }),
    });
    const data = await readApiResponse(response);
    state.importConfigLoaded = true;
    if (JSON.stringify(state.importConfig) === serializedRows) {
      state.importConfig = data.rows || [];
      state.importConfigDirty = false;
    } else {
      scheduleImportConfigSave();
    }
  } catch (error) {
    state.importConfigDirty = true;
    showConfigError(error.message);
  }
}

function controlValue(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("pt-BR");
  const className = normalized === "sim" ? "is-yes" : normalized === "nao" || normalized === "não" ? "is-no" : normalized ? "" : "is-empty";
  return `<span class="control-read-value ${className}">${escapeHtml(value || "—")}</span>`;
}

function renderControlPayments() {
  const rows = state.controlPayments;
  elements["control-payments-rows"].innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td><span class="control-payments-name"><span class="config-row-dot" aria-hidden="true"></span><strong>${escapeHtml(row.agreement)}</strong></span></td>
        <td>${controlValue(row.hadPayment)}</td>
        <td>${controlValue(row.paymentDate)}</td>
        <td>${controlValue(row.imported)}</td>
        <td>${controlValue(row.notImported)}</td>
      </tr>
    `).join("")
    : '<tr class="config-empty-row"><td colspan="5">Nenhum pagamento registrado.</td></tr>';
}

async function loadControlPayments({ force = false } = {}) {
  if (state.controlPaymentsLoaded && !force) return;
  elements["control-payments-loading"].classList.remove("hidden");
  elements["control-payments-content"].classList.add("hidden");
  elements["control-payments-message"].classList.add("hidden");
  try {
    const response = await fetch("/api/control-payments", { cache: "no-store" });
    const data = await readApiResponse(response);
    state.controlPayments = data.rows || [];
    state.controlPaymentsLoaded = true;
    renderControlPayments();
    elements["control-payments-content"].classList.remove("hidden");
  } catch (error) {
    state.controlPaymentsLoaded = false;
    elements["control-payments-message"].textContent = error.message;
    elements["control-payments-message"].classList.remove("hidden");
  } finally {
    elements["control-payments-loading"].classList.add("hidden");
  }
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
    if (data.reports.length && !data.reports.some((report) => report.id === state.activeId)) state.activeId = newestReport(data.reports).id;
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

elements["refresh-button"].addEventListener("click", () => {
  state.importConfigLoaded = false;
  state.controlPaymentsLoaded = false;
  state.tussTablesLoaded = false;
  state.planCredentialsLoaded = false;
  loadReports({ quiet: true });
  if (state.activeTab === "config") loadImportConfig({ force: true });
  if (state.activeTab === "payments") loadControlPayments({ force: true });
  if (state.activeTab === "plans" && state.planView === "tuss" && state.tussWorkspaceView === "tables") loadTussTables({ force: true });
  if (state.activeTab === "plans" && state.planView === "credentials") loadPlanCredentials({ force: true });
});
elements["error-retry"].addEventListener("click", () => loadReports());
document.querySelector(".sidebar-navigation").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sidebar-tab]");
  if (button) setActiveTab(button.dataset.sidebarTab);
});
elements["report-inner-tabs"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-report-view]");
  if (button) setReportInnerView(button.dataset.reportView);
});
elements["plan-inner-tabs"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-plan-view]");
  if (button) setPlanView(button.dataset.planView);
});
elements["tuss-workspace-tabs"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-tuss-view]");
  if (button) setTussWorkspaceView(button.dataset.tussView);
});
elements["tuss-table-refresh"].addEventListener("click", async () => {
  const pending = [...state.tussTableSaveTimers.keys()];
  pending.forEach((tableId) => clearTimeout(state.tussTableSaveTimers.get(tableId)));
  await Promise.all(pending.map((tableId) => saveTussTable(tableId)));
  await loadTussTables({ force: true });
});
elements["tuss-table-list"].addEventListener("input", (event) => {
  const input = event.target.closest("[data-tuss-row][data-tuss-column]");
  const card = event.target.closest("[data-table-id]");
  if (!input || !card) return;
  const table = tussTableById(card.dataset.tableId);
  const row = Number(input.dataset.tussRow);
  const column = Number(input.dataset.tussColumn);
  if (!table?.rows[row]) return;
  table.rows[row].values[column] = input.value;
  state.tussTableRevisions.set(table.id, (state.tussTableRevisions.get(table.id) || 0) + 1);
  scheduleTussTableSave(table.id);
});
elements["tuss-table-list"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-tuss-remove]");
  const card = event.target.closest("[data-table-id]");
  if (!button || !card) return;
  const table = tussTableById(card.dataset.tableId);
  const row = Number(button.dataset.tussRemove);
  if (!table?.rows[row]) return;
  if (!window.confirm(`Excluir esta linha da tabela TUSS de ${table.planName}?`)) return;
  table.rows.splice(row, 1);
  state.tussTableRevisions.set(table.id, (state.tussTableRevisions.get(table.id) || 0) + 1);
  renderTussTables();
  scheduleTussTableSave(table.id, true);
});
elements["plan-credentials-refresh"].addEventListener("click", async () => {
  const pending = [...state.planCredentialSaveTimers.keys()];
  pending.forEach((planId) => clearTimeout(state.planCredentialSaveTimers.get(planId)));
  await Promise.all(pending.map((planId) => savePlanCredentials(planId)));
  await loadPlanCredentials({ force: true });
});
elements["plan-credentials-list"].addEventListener("input", (event) => {
  const input = event.target.closest("[data-credential-field]");
  const card = event.target.closest("[data-credential-id]");
  if (!input || !card) return;
  const plan = planCredentialById(card.dataset.credentialId);
  const field = plan?.fields.find((item) => item.id === input.dataset.credentialField);
  if (!field) return;
  field.value = input.value;
  state.planCredentialRevisions.set(plan.id, (state.planCredentialRevisions.get(plan.id) || 0) + 1);
  schedulePlanCredentialSave(plan.id);
});
elements["plan-credentials-list"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-credential-reveal]");
  const card = event.target.closest("[data-credential-id]");
  if (!button || !card) return;
  const input = card.querySelector(`[data-credential-field="${button.dataset.credentialReveal}"]`);
  if (!input) return;
  const revealing = input.type === "password";
  input.type = revealing ? "text" : "password";
  button.classList.toggle("active", revealing);
  button.title = revealing ? "Ocultar senha" : "Mostrar senha";
  button.setAttribute("aria-label", button.title);
});
elements["config-add"].addEventListener("click", () => {
  state.importConfig.push({ agreement: "", execute: "Nao", schedule: "" });
  state.importConfigDirty = true;
  renderImportConfig();
  const lastInput = elements["config-rows"].querySelector("tr:last-child input");
  lastInput?.focus();
});
elements["config-rows"].addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  const row = event.target.closest("tr[data-index]");
  if (!field || !row) return;
  state.importConfig[Number(row.dataset.index)][field] = event.target.value;
  scheduleImportConfigSave();
});
elements["config-rows"].addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  const row = event.target.closest("tr[data-index]");
  if (!field || !row) return;
  state.importConfig[Number(row.dataset.index)][field] = event.target.value;
  scheduleImportConfigSave();
});
elements["config-rows"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  state.importConfig.splice(Number(button.dataset.remove), 1);
  renderImportConfig();
  scheduleImportConfigSave();
});
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
