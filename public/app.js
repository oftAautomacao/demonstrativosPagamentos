window.__painelCarregado = true;

const sidebarTabByHash = {
  "#configuracao": "config",
  "#pagamentos": "payments",
  "#convenios": "plans",
  "#ajuste-tuss": "plans",
  "#login-senha": "plans",
  "#guias": "guides",
  "#conta-medica": "medical",
  "#importacao": "import",
};

const state = {
  data: null,
  activeId: null,
  activeTab: sidebarTabByHash[window.location.hash] || "config",
  planView: window.location.hash === "#login-senha" ? "credentials" : "tuss",
  selectedPlanName: "",
  reportInnerView: "summary",
  importInnerView: "summary",
  tussCache: new Map(),
  tussApplied: new Set(),
  tussLoadingFor: null,
  tussRequestToken: 0,
  tussTables: [],
  tussTablesLoaded: false,
  tussTablesLoading: false,
  tussTableDirty: new Set(),
  tussTableRevisions: new Map(),
  tussTableSaving: new Set(),
  planCredentials: [],
  planCredentialsLoaded: false,
  planCredentialsLoading: false,
  planCredentialDirty: new Set(),
  planCredentialRevisions: new Map(),
  planCredentialSaving: new Set(),
  desiredDateSaveTimer: null,
  selectedMonth: 0,
  selectedYear: 0,
  importConfig: [],
  importConfigLoaded: false,
  importConfigDirty: false,
  importConfigSaveTimer: null,
  controlPayments: [],
  controlPaymentsLoaded: false,
  readonlyDocuments: { medical: [], import: [] },
  readonlyLoaded: { medical: false, import: false },
  readonlySelection: {
    medical: { planName: "", documentId: "" },
    import: { planName: "", documentId: "" },
  },
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
  "tuss-table-editor-view", "tuss-analysis-view",
  "tuss-table-loading", "tuss-table-message", "tuss-table-list",
  "desired-date-panel", "desired-date-select", "config-tab", "plans-tab", "plan-inner-tabs", "plan-settings-select", "report-internal-menu", "report-inner-tabs",
  "header-period-filter", "header-plan-filter", "report-subtitle", "demonstrative-summary", "embedded-full-report",
  "guide-groups", "guides-tab", "medical-tab", "import-tab",
  "config-panel", "config-add", "config-loading", "config-message", "config-content",
  "config-rows",
  "control-payments-tab", "demonstrative-tab", "control-payments-loading", "control-payments-message",
  "control-payments-content", "control-payments-rows",
  "plan-tuss-view", "plan-credentials-view", "plan-credentials-loading",
  "plan-credentials-message", "plan-credentials-list",
  "medical-plan-select", "medical-file-select", "medical-loading", "medical-message", "medical-content",
  "medical-file-name", "medical-file-meta", "medical-row-count", "medical-table",
  "import-plan-select", "import-file-select", "import-loading", "import-message", "import-content",
  "import-file-name", "import-file-meta", "import-inner-tabs", "import-summary-view", "import-full-view",
  "import-not-imported-table", "import-invalid-patients-table", "import-raw-report",
  "app-dialog", "app-dialog-title", "app-dialog-message", "app-dialog-cancel", "app-dialog-confirm",
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
  const normalized = normalizedText(column);
  if (normalized.includes("glosa")) return "number glosa";
  return /valor|falta|pcc|irrf|iss|inss/.test(normalized) ? "number" : "";
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

function availablePlanSettingsNames() {
  const names = new Set();
  for (const report of state.data?.reports || []) names.add(report.agreement);
  for (const table of state.tussTables) names.add(table.planName);
  for (const plan of state.planCredentials) names.add(plan.planName);
  return [...names].filter(Boolean).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function updatePlanHeading() {
  if (state.activeTab !== "plans") return;
  const sectionTitle = state.planView === "tuss" ? "Ajuste TUSS" : "Login e senha";
  const planName = state.selectedPlanName || "Convênios";
  elements.agreement.innerHTML = `${escapeHtml(sectionTitle)} <span class="plan-heading-name">- ${escapeHtml(planName)}</span>`;
  elements["report-subtitle"].textContent = "";
  elements["report-subtitle"].classList.add("hidden");
}

function renderPlanSettingsSelect() {
  const plans = availablePlanSettingsNames();
  if (!plans.includes(state.selectedPlanName)) {
    state.selectedPlanName = activeReport()?.agreement && plans.includes(activeReport().agreement)
      ? activeReport().agreement
      : plans[0] || "";
  }
  elements["plan-settings-select"].innerHTML = plans.length
    ? plans.map((planName) => `<option value="${escapeHtml(planName)}">${escapeHtml(planName)}</option>`).join("")
    : '<option value="">Nenhum convênio disponível</option>';
  elements["plan-settings-select"].value = state.selectedPlanName;
  elements["plan-settings-select"].disabled = plans.length === 0;
  updatePlanHeading();
}

function renderTussTables() {
  renderPlanSettingsSelect();
  const tables = state.tussTables.filter((table) => table.planName === state.selectedPlanName);
  if (!state.tussTables.length) {
    elements["tuss-table-list"].innerHTML = "";
    elements["tuss-table-list"].classList.add("hidden");
    showTussTableMessage("Nenhuma tabela Ajuste Codigo TUSS.xlsx foi encontrada nos convênios.");
    return;
  }
  if (!tables.length) {
    elements["tuss-table-list"].innerHTML = "";
    elements["tuss-table-list"].classList.add("hidden");
    showTussTableMessage(`Nenhuma tabela Ajuste Codigo TUSS.xlsx foi encontrada para ${state.selectedPlanName}.`);
    return;
  }

  showTussTableMessage("");
  elements["tuss-table-list"].innerHTML = tables.map((table) => `
    <article class="tuss-table-card" data-table-id="${escapeHtml(table.id)}">
      <header class="tuss-table-card-header">
        <span class="tuss-table-plan"><span class="config-row-dot" aria-hidden="true"></span><span><strong>${escapeHtml(table.planName)}</strong><small>${escapeHtml(table.fileName)} · ${escapeHtml(table.sheetName)}</small></span></span>
        <span class="tuss-table-card-actions">
          <button class="tuss-table-add-row" type="button" data-tuss-add title="Adicionar linha à tabela">
            <span aria-hidden="true">+</span> Adicionar linha
          </button>
          <button class="tuss-table-save-button" type="button" data-tuss-save ${state.tussTableDirty.has(table.id) ? "" : "disabled"}>Salvar</button>
        </span>
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

async function loadTussTables({ force = false, quiet = false } = {}) {
  if (state.tussTablesLoaded && !force) {
    renderTussTables();
    return;
  }
  if (state.tussTablesLoading) return;
  state.tussTablesLoading = true;
  if (!quiet) {
    elements["tuss-table-loading"].classList.remove("hidden");
    elements["tuss-table-list"].classList.add("hidden");
    showTussTableMessage("");
  }
  try {
    const response = await fetch("/api/tuss-tables", { cache: "no-store" });
    const data = await readApiResponse(response);
    state.tussTables = data.tables || [];
    state.tussTablesLoaded = true;
    state.tussTableDirty.clear();
    state.tussTableRevisions.clear();
    renderTussTables();
    if (data.errors?.length) {
      showToast(`${data.errors.length} tabela(s) TUSS precisam de atenção`);
    }
  } catch (error) {
    state.tussTablesLoaded = false;
    if (quiet) showToast(error.message);
    else showTussTableMessage(error.message, true);
  } finally {
    state.tussTablesLoading = false;
    if (!quiet) elements["tuss-table-loading"].classList.add("hidden");
  }
}

function canAutoRefreshPlanSettings() {
  const activeElement = document.activeElement;
  if (state.activeTab !== "plans" || document.visibilityState !== "visible") return false;
  if (state.planView === "credentials") {
    return state.planCredentialDirty.size === 0
      && state.planCredentialSaving.size === 0
      && !activeElement?.closest?.("#plan-credentials-list");
  }
  return state.planView === "tuss"
    && document.visibilityState === "visible"
    && state.tussTableDirty.size === 0
    && state.tussTableSaving.size === 0
    && !activeElement?.closest?.("#tuss-table-list");
}

function autoRefreshPlanSettings() {
  if (!canAutoRefreshPlanSettings()) return;
  if (state.planView === "credentials") loadPlanCredentials({ force: true, quiet: true });
  else loadTussTables({ force: true, quiet: true });
}

function tussTableById(tableId) {
  return state.tussTables.find((table) => table.id === tableId);
}

function updateTussSaveButton(tableId, saving = false) {
  const button = elements["tuss-table-list"].querySelector(`[data-table-id="${tableId}"] [data-tuss-save]`);
  if (!button) return;
  button.disabled = saving || !state.tussTableDirty.has(tableId);
  button.textContent = saving ? "Salvando..." : "Salvar";
}

function markTussTableDirty(tableId) {
  state.tussTableDirty.add(tableId);
  updateTussSaveButton(tableId);
}

async function saveTussTable(tableId) {
  const table = tussTableById(tableId);
  if (!table || !state.tussTableDirty.has(tableId) || state.tussTableSaving.has(tableId)) return;

  state.tussTableSaving.add(tableId);
  updateTussSaveButton(tableId, true);
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
      state.tussTableDirty.delete(tableId);
      showToast("Tabela TUSS salva no arquivo Excel");
    } else {
      table.version = data.table.version;
      state.tussTableDirty.add(tableId);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    state.tussTableSaving.delete(tableId);
    updateTussSaveButton(tableId);
  }
}

function showPlanCredentialsMessage(message, isError = false) {
  elements["plan-credentials-message"].textContent = message;
  elements["plan-credentials-message"].classList.toggle("hidden", !message);
  elements["plan-credentials-message"].classList.toggle("is-error", isError);
}

function renderPlanCredentials() {
  renderPlanSettingsSelect();
  const plans = state.planCredentials.filter((plan) => plan.planName === state.selectedPlanName);
  if (!state.planCredentials.length) {
    elements["plan-credentials-list"].innerHTML = "";
    elements["plan-credentials-list"].classList.add("hidden");
    showPlanCredentialsMessage("Nenhum arquivo LoginSenha.txt foi encontrado nos convênios.");
    return;
  }
  if (!plans.length) {
    elements["plan-credentials-list"].innerHTML = "";
    elements["plan-credentials-list"].classList.add("hidden");
    showPlanCredentialsMessage(`Nenhum arquivo LoginSenha.txt foi encontrado para ${state.selectedPlanName}.`);
    return;
  }

  showPlanCredentialsMessage("");
  elements["plan-credentials-list"].innerHTML = plans.map((plan) => `
    <article class="credential-card" data-credential-id="${escapeHtml(plan.id)}">
      <header class="tuss-table-card-header">
        <span class="tuss-table-plan"><span class="config-row-dot" aria-hidden="true"></span><span><strong>${escapeHtml(plan.planName)}</strong><small>${escapeHtml(plan.fileName)}</small></span></span>
        <button class="tuss-table-save-button credential-save-button ${state.planCredentialDirty.has(plan.id) ? "" : "hidden"}" type="button" data-credential-save>Salvar</button>
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

async function loadPlanCredentials({ force = false, quiet = false } = {}) {
  if (state.planCredentialsLoaded && !force) {
    renderPlanCredentials();
    return;
  }
  if (state.planCredentialsLoading) return;
  state.planCredentialsLoading = true;
  if (!quiet) {
    elements["plan-credentials-loading"].classList.remove("hidden");
    elements["plan-credentials-list"].classList.add("hidden");
    showPlanCredentialsMessage("");
  }
  try {
    const response = await fetch("/api/plan-credentials", { cache: "no-store" });
    const data = await readApiResponse(response);
    state.planCredentials = data.plans || [];
    state.planCredentialsLoaded = true;
    state.planCredentialDirty.clear();
    state.planCredentialRevisions.clear();
    renderPlanCredentials();
    if (data.errors?.length) showToast(`${data.errors.length} arquivo(s) de acesso precisam de atenção`);
  } catch (error) {
    state.planCredentialsLoaded = false;
    if (quiet) showToast(error.message);
    else showPlanCredentialsMessage(error.message, true);
  } finally {
    state.planCredentialsLoading = false;
    if (!quiet) elements["plan-credentials-loading"].classList.add("hidden");
  }
}

function planCredentialById(planId) {
  return state.planCredentials.find((plan) => plan.id === planId);
}

function updatePlanCredentialSaveButton(planId, saving = false) {
  const button = elements["plan-credentials-list"].querySelector(`[data-credential-id="${planId}"] [data-credential-save]`);
  if (!button) return;
  button.classList.toggle("hidden", !saving && !state.planCredentialDirty.has(planId));
  button.disabled = saving;
  button.textContent = saving ? "Salvando..." : "Salvar";
}

function markPlanCredentialDirty(planId) {
  state.planCredentialDirty.add(planId);
  updatePlanCredentialSaveButton(planId);
}

async function savePlanCredentials(planId) {
  const plan = planCredentialById(planId);
  if (!plan || !state.planCredentialDirty.has(planId) || state.planCredentialSaving.has(planId)) return;
  state.planCredentialSaving.add(planId);
  updatePlanCredentialSaveButton(planId, true);
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
      state.planCredentialDirty.delete(planId);
      showToast("Login e senha salvos no arquivo");
    } else {
      plan.version = data.plan.version;
      state.planCredentialDirty.add(planId);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    state.planCredentialSaving.delete(planId);
    updatePlanCredentialSaveButton(planId);
  }
}

const readonlyReportLabels = {
  medical: {
    title: "Conta médica",
    empty: "Nenhum relatório de conta médica foi encontrado.",
  },
  import: {
    title: "Importação",
    empty: "Nenhum relatório de importação foi encontrado.",
  },
};

function readonlyElement(type, suffix) {
  return elements[`${type}-${suffix}`];
}

function showReadonlyMessage(type, message, isError = false) {
  const messageElement = readonlyElement(type, "message");
  messageElement.textContent = message;
  messageElement.classList.toggle("hidden", !message);
  messageElement.classList.toggle("is-error", isError);
}

function renderMedicalTable(document) {
  const table = document.medicalTable || { columns: [], rows: [], total: [] };
  elements["medical-row-count"].textContent = `${table.rows.length.toLocaleString("pt-BR")} linha(s)`;
  elements["medical-table"].innerHTML = table.columns.length
    ? `<div class="table-scroll">
        <table class="guide-table medical-guide-table${table.columns.length > 8 ? " is-wide" : ""}">
          <thead><tr>${table.columns.map((column) => `<th class="${descriptionCellClass(column)}">${escapeHtml(column)}</th>`).join("")}</tr></thead>
          <tbody>${table.rows.map((row) => `<tr>${table.columns.map((column, index) => `<td class="${descriptionCellClass(column)}">${escapeHtml(row[index] || "—")}</td>`).join("")}</tr>`).join("")}</tbody>
          ${table.total?.length ? `<tfoot><tr>${table.columns.map((column, index) => `<td class="${descriptionCellClass(column)}">${escapeHtml(table.total[index] || "")}</td>`).join("")}</tr></tfoot>` : ""}
        </table>
      </div>`
    : '<div class="medical-table-empty">Não foi possível identificar a tabela neste relatório.</div>';
}

function importTableMarkup(title, table, emptyMessage) {
  const safeTable = table || { columns: [], rows: [], total: [] };
  return `<article class="guide-group import-table-group">
    <header class="guide-group-heading">
      <span><small>Resultado da importação</small><strong>${escapeHtml(title)}</strong></span>
      <span class="guide-count">${safeTable.rows.length.toLocaleString("pt-BR")} linha(s)</span>
    </header>
    ${safeTable.columns.length
      ? `<div class="table-scroll">
          <table class="guide-table import-result-table${safeTable.columns.length > 7 ? " is-wide" : ""}">
            <thead><tr>${safeTable.columns.map((column) => `<th class="${descriptionCellClass(column)}">${escapeHtml(column)}</th>`).join("")}</tr></thead>
            <tbody>${safeTable.rows.map((row) => `<tr>${safeTable.columns.map((column, index) => `<td class="${descriptionCellClass(column)}">${escapeHtml(row[index] || "—")}</td>`).join("")}</tr>`).join("")}</tbody>
            ${safeTable.total?.length ? `<tfoot><tr>${safeTable.columns.map((column, index) => `<td class="${descriptionCellClass(column)}">${escapeHtml(safeTable.total[index] || "")}</td>`).join("")}</tr></tfoot>` : ""}
          </table>
        </div>`
      : `<div class="import-table-empty">${escapeHtml(emptyMessage)}</div>`}
  </article>`;
}

function setImportView(view) {
  state.importInnerView = view === "full" ? "full" : "summary";
  elements["import-summary-view"].classList.toggle("hidden", state.importInnerView !== "summary");
  elements["import-full-view"].classList.toggle("hidden", state.importInnerView !== "full");
  elements["import-inner-tabs"].querySelectorAll("[data-import-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.importView === state.importInnerView);
  });
}

function renderImportReport(document) {
  const tables = document.importTables || {};
  elements["import-not-imported-table"].innerHTML = importTableMarkup(
    "LINHAS NÃO IMPORTADAS",
    tables.notImported,
    "Nenhuma linha não importada foi registrada neste relatório.",
  );
  elements["import-invalid-patients-table"].innerHTML = importTableMarkup(
    "PACIENTES INEXISTENTE OU VALOR INCORRETO",
    tables.invalidPatients,
    "Nenhum paciente inexistente ou com valor incorreto foi registrado neste relatório.",
  );
  elements["import-raw-report"].textContent = document.rawText || "";
  setImportView(state.importInnerView);
}

function renderReadonlyReports(type) {
  const documents = state.readonlyDocuments[type] || [];
  const selection = state.readonlySelection[type];
  const planSelect = readonlyElement(type, "plan-select");
  const fileSelect = readonlyElement(type, "file-select");
  const content = readonlyElement(type, "content");
  const plans = [...new Set(documents.map((document) => document.planName))]
    .sort((left, right) => left.localeCompare(right, "pt-BR"));

  if (!plans.length) {
    selection.planName = "";
    selection.documentId = "";
    planSelect.innerHTML = '<option value="">Nenhum convênio disponível</option>';
    fileSelect.innerHTML = '<option value="">Nenhum relatório disponível</option>';
    planSelect.disabled = true;
    fileSelect.disabled = true;
    content.classList.add("hidden");
    showReadonlyMessage(type, readonlyReportLabels[type].empty);
    return;
  }

  if (!plans.includes(selection.planName)) selection.planName = plans[0];
  planSelect.innerHTML = plans
    .map((planName) => `<option value="${escapeHtml(planName)}">${escapeHtml(planName)}</option>`)
    .join("");
  planSelect.value = selection.planName;
  planSelect.disabled = false;

  const available = documents.filter((document) => document.planName === selection.planName);
  if (!available.some((document) => document.id === selection.documentId)) {
    selection.documentId = available[0]?.id || "";
  }
  fileSelect.innerHTML = available
    .map((document) => `<option value="${escapeHtml(document.id)}">${escapeHtml(`${document.reportDate} · ${document.periodLabel}`)}</option>`)
    .join("");
  fileSelect.value = selection.documentId;
  fileSelect.disabled = available.length === 0;

  const document = available.find((item) => item.id === selection.documentId);
  if (!document) {
    content.classList.add("hidden");
    showReadonlyMessage(type, readonlyReportLabels[type].empty);
    return;
  }

  readonlyElement(type, "file-name").textContent = document.fileName;
  readonlyElement(type, "file-meta").textContent = `${document.planName} · ${document.periodLabel} · ${document.relativePath}`;
  if (type === "medical") renderMedicalTable(document);
  else renderImportReport(document);
  content.classList.remove("hidden");
  showReadonlyMessage(type, "");

  if (state.activeTab === type) {
    elements.agreement.textContent = document.planName;
    elements["report-subtitle"].textContent = readonlyReportLabels[type].title;
    elements["report-subtitle"].classList.remove("hidden");
  }
}

async function loadReadonlyReports(type, { force = false } = {}) {
  if (state.readonlyLoaded[type] && !force) {
    renderReadonlyReports(type);
    return;
  }

  const loading = readonlyElement(type, "loading");
  loading.classList.remove("hidden");
  readonlyElement(type, "content").classList.add("hidden");
  showReadonlyMessage(type, "");
  try {
    const response = await fetch(`/api/readonly-reports?type=${encodeURIComponent(type)}`, { cache: "no-store" });
    const data = await readApiResponse(response);
    state.readonlyDocuments[type] = data.documents || [];
    state.readonlyLoaded[type] = true;
    renderReadonlyReports(type);
  } catch (error) {
    state.readonlyLoaded[type] = false;
    showReadonlyMessage(type, error.message, true);
  } finally {
    loading.classList.add("hidden");
  }
}

function updateReportSelectionVisibility() {
  const visible = ["overview", "guides"].includes(state.activeTab);
  elements["report-internal-menu"].classList.toggle("hidden", !visible);
  elements["header-period-filter"].classList.toggle("hidden", !visible);
  elements["header-plan-filter"].classList.toggle("hidden", !visible);
  elements["report-inner-tabs"].classList.toggle("hidden", state.activeTab !== "overview");
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
  renderPlanSettingsSelect();
  updatePlanHeading();
  history.replaceState(null, "", state.planView === "credentials" ? "#login-senha" : "#ajuste-tuss");
  if (state.planView === "tuss") loadTussTables();
  else loadPlanCredentials();
}

function renderActiveReport() {
  const report = activeReport();
  if (!report) return;

  if (["overview", "guides"].includes(state.activeTab)) elements.agreement.textContent = report.agreement;

  renderPaymentDescription(report);
  renderGuideInformation(report);
  renderFullReport(report);
}

function setReportInnerView(view) {
  state.reportInnerView = view === "full" ? "full" : "summary";
  elements["demonstrative-summary"].classList.toggle("hidden", state.reportInnerView !== "summary");
  elements["embedded-full-report"].classList.toggle("hidden", state.reportInnerView !== "full");
  elements["report-inner-tabs"].querySelectorAll("[data-report-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.reportView === state.reportInnerView);
  });
}

function setActiveTab(tab) {
  state.activeTab = tab;
  const titleGroup = document.querySelector(".report-title-group");
  titleGroup.classList.toggle("compact-title", ["config", "plans", "payments", "medical", "import"].includes(tab));
  titleGroup.classList.toggle("plan-heading", tab === "plans");
  elements.agreement.classList.toggle("plan-page-title", tab === "plans");
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
    renderPlanSettingsSelect();
    updatePlanHeading();
  } else if (tab === "guides") {
    elements.agreement.textContent = activeReport()?.agreement || "Guias";
    elements["report-subtitle"].textContent = "Guias";
    elements["report-subtitle"].classList.remove("hidden");
  } else if (tab === "medical" || tab === "import") {
    const selection = state.readonlySelection[tab];
    elements.agreement.textContent = selection.planName || readonlyReportLabels[tab].title;
    elements["report-subtitle"].textContent = readonlyReportLabels[tab].title;
    elements["report-subtitle"].classList.remove("hidden");
  } else {
    elements.agreement.textContent = activeReport()?.agreement || "Intermedica";
    elements["report-subtitle"].textContent = "Demonstrativo de pagamento";
    elements["report-subtitle"].classList.remove("hidden");
  }
  if (tab !== "plans") {
    const hashes = {
      config: "#configuracao",
      payments: "#pagamentos",
      guides: "#guias",
      medical: "#conta-medica",
      import: "#importacao",
    };
    const hash = hashes[tab] || window.location.pathname;
    history.replaceState(null, "", hash);
  }
  if (tab === "overview") setReportInnerView("summary");
  if (tab === "config") loadImportConfig();
  if (tab === "payments") loadControlPayments();
  if (tab === "plans") setPlanView(state.planView);
  if (tab === "medical" || tab === "import") loadReadonlyReports(tab);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("visible"), 2200);
}

let appDialogResolve = null;

function closeAppDialog(confirmed = false) {
  elements["app-dialog"].classList.add("hidden");
  elements["app-dialog"].setAttribute("aria-hidden", "true");
  document.body.classList.remove("dialog-open");
  const resolve = appDialogResolve;
  appDialogResolve = null;
  resolve?.(confirmed);
}

function confirmInApp({ title, message, confirmLabel = "Confirmar" }) {
  if (appDialogResolve) closeAppDialog(false);
  elements["app-dialog-title"].textContent = title;
  elements["app-dialog-message"].textContent = message;
  elements["app-dialog-confirm"].textContent = confirmLabel;
  elements["app-dialog"].classList.remove("hidden");
  elements["app-dialog"].setAttribute("aria-hidden", "false");
  document.body.classList.add("dialog-open");
  window.setTimeout(() => elements["app-dialog-cancel"].focus(), 0);
  return new Promise((resolve) => {
    appDialogResolve = resolve;
  });
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
  if (state.tussTableDirty.size || state.planCredentialDirty.size) {
    showToast("Salve as alterações de Convênios antes de atualizar");
    return;
  }
  state.importConfigLoaded = false;
  state.controlPaymentsLoaded = false;
  state.tussTablesLoaded = false;
  state.planCredentialsLoaded = false;
  state.readonlyLoaded.medical = false;
  state.readonlyLoaded.import = false;
  loadReports({ quiet: true });
  if (state.activeTab === "config") loadImportConfig({ force: true });
  if (state.activeTab === "payments") loadControlPayments({ force: true });
  if (state.activeTab === "plans" && state.planView === "tuss") loadTussTables({ force: true });
  if (state.activeTab === "plans" && state.planView === "credentials") loadPlanCredentials({ force: true });
  if (state.activeTab === "medical" || state.activeTab === "import") loadReadonlyReports(state.activeTab, { force: true });
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
elements["import-inner-tabs"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-import-view]");
  if (button) setImportView(button.dataset.importView);
});
elements["plan-inner-tabs"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-plan-view]");
  if (button) setPlanView(button.dataset.planView);
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
  markTussTableDirty(table.id);
});
elements["tuss-table-list"].addEventListener("click", async (event) => {
  const card = event.target.closest("[data-table-id]");
  if (!card) return;
  const table = tussTableById(card.dataset.tableId);
  if (!table) return;

  const saveButton = event.target.closest("[data-tuss-save]");
  if (saveButton) {
    saveTussTable(table.id);
    return;
  }

  const addButton = event.target.closest("[data-tuss-add]");
  if (addButton) {
    const rowIndex = table.rows.length;
    table.rows.push({ values: table.columns.map(() => "") });
    state.tussTableRevisions.set(table.id, (state.tussTableRevisions.get(table.id) || 0) + 1);
    state.tussTableDirty.add(table.id);
    renderTussTables();
    const addedInput = elements["tuss-table-list"].querySelector(
      `[data-table-id="${table.id}"] [data-tuss-row="${rowIndex}"][data-tuss-column="0"]`,
    );
    addedInput?.focus();
    return;
  }

  const removeButton = event.target.closest("[data-tuss-remove]");
  if (!removeButton) return;
  const row = Number(removeButton.dataset.tussRemove);
  if (!table.rows[row]) return;
  const confirmed = await confirmInApp({
    title: "Excluir linha da tabela TUSS?",
    message: `A linha será removida de ${table.planName}. Clique em Salvar para gravar a exclusão no arquivo Excel.`,
    confirmLabel: "Excluir",
  });
  if (!confirmed || !table.rows[row]) return;
  table.rows.splice(row, 1);
  state.tussTableRevisions.set(table.id, (state.tussTableRevisions.get(table.id) || 0) + 1);
  state.tussTableDirty.add(table.id);
  renderTussTables();
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
  markPlanCredentialDirty(plan.id);
});
elements["plan-credentials-list"].addEventListener("click", (event) => {
  const card = event.target.closest("[data-credential-id]");
  if (!card) return;
  const plan = planCredentialById(card.dataset.credentialId);
  if (!plan) return;
  const saveButton = event.target.closest("[data-credential-save]");
  if (saveButton) {
    savePlanCredentials(plan.id);
    return;
  }
  const button = event.target.closest("[data-credential-reveal]");
  if (!button) return;
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
elements["plan-settings-select"].addEventListener("change", (event) => {
  state.selectedPlanName = event.target.value;
  updatePlanHeading();
  if (state.planView === "tuss") renderTussTables();
  else renderPlanCredentials();
});
for (const type of ["medical", "import"]) {
  readonlyElement(type, "plan-select").addEventListener("change", (event) => {
    state.readonlySelection[type].planName = event.target.value;
    state.readonlySelection[type].documentId = "";
    renderReadonlyReports(type);
  });
  readonlyElement(type, "file-select").addEventListener("change", (event) => {
    state.readonlySelection[type].documentId = event.target.value;
    renderReadonlyReports(type);
  });
}
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
window.addEventListener("focus", autoRefreshPlanSettings);
document.addEventListener("visibilitychange", autoRefreshPlanSettings);
setInterval(autoRefreshPlanSettings, 30_000);
elements["app-dialog-cancel"].addEventListener("click", () => closeAppDialog(false));
elements["app-dialog-confirm"].addEventListener("click", () => closeAppDialog(true));
elements["app-dialog"].addEventListener("click", (event) => {
  if (event.target === elements["app-dialog"]) closeAppDialog(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements["app-dialog"].classList.contains("hidden")) closeAppDialog(false);
});
loadReports();
loadDesiredDate();
