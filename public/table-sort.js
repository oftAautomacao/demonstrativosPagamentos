(function initializeTableSorting(globalScope) {
  "use strict";

  const collator = new Intl.Collator("pt-BR", {
    sensitivity: "base",
    numeric: true,
  });
  const sortingTables = new WeakSet();

  function normalizedValue(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").trim();
  }

  function comparableValue(value) {
    const text = normalizedValue(value);
    if (!text || text === "—" || text === "-") return { kind: "empty", value: "" };

    const dateMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch.map(Number);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return { kind: "date", value: date.getTime() };
      }
    }

    const numberText = text.replace(/^R\$\s*/, "").replace(/\s/g, "");
    if (/^[+-]?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?%?$/.test(numberText)) {
      const number = Number(numberText.replace(/%$/, "").replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(number)) return { kind: "number", value: number };
    }

    return { kind: "text", value: text };
  }

  function compareCellValues(leftValue, rightValue, direction = 1) {
    const left = comparableValue(leftValue);
    const right = comparableValue(rightValue);
    if (left.kind === "empty" || right.kind === "empty") {
      if (left.kind === right.kind) return 0;
      return left.kind === "empty" ? 1 : -1;
    }

    let comparison;
    if (left.kind === right.kind && (left.kind === "number" || left.kind === "date")) {
      comparison = left.value - right.value;
    } else {
      comparison = collator.compare(String(left.value), String(right.value));
    }
    return comparison * direction;
  }

  function cellValue(cell) {
    const control = cell?.querySelector("input, select, textarea");
    if (control instanceof globalScope.HTMLSelectElement) {
      return control.selectedOptions[0]?.textContent || control.value;
    }
    return control ? control.value : cell?.textContent || "";
  }

  function resetTableSort(table) {
    table.querySelectorAll("thead th[aria-sort]").forEach((header) => {
      header.setAttribute("aria-sort", "none");
      header.title = "Clique para ordenar esta coluna";
    });
  }

  function sortByHeader(header) {
    const table = header.closest("table");
    const body = table?.tBodies[0];
    if (!table || !body) return;

    const columnIndex = Number(header.dataset.sortableColumn);
    const rows = Array.from(body.rows).filter((row) => (
      row.cells.length > columnIndex && row.cells[columnIndex].colSpan === 1
    ));
    if (rows.length < 2) return;

    const direction = header.getAttribute("aria-sort") === "ascending" ? -1 : 1;
    resetTableSort(table);
    header.setAttribute("aria-sort", direction === 1 ? "ascending" : "descending");
    header.title = direction === 1
      ? "Ordenação crescente. Clique para ordenar de forma decrescente"
      : "Ordenação decrescente. Clique para ordenar de forma crescente";

    const sortedRows = rows
      .map((row, originalIndex) => ({ row, originalIndex, value: cellValue(row.cells[columnIndex]) }))
      .sort((left, right) => (
        compareCellValues(left.value, right.value, direction) || left.originalIndex - right.originalIndex
      ));

    sortingTables.add(table);
    body.append(...sortedRows.map(({ row }) => row));
    globalScope.setTimeout(() => sortingTables.delete(table), 0);
  }

  function isActionHeader(header) {
    const label = normalizedValue(header.textContent)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
    return header.classList.contains("tuss-row-action-heading") || label === "acoes" || !label;
  }

  function enhanceTable(table) {
    const body = table.tBodies[0];
    if (!body) return;

    table.querySelectorAll("thead th").forEach((header) => {
      if (header.hasAttribute("data-sortable-column") || isActionHeader(header)) return;
      header.dataset.sortableColumn = String(header.cellIndex);
      header.setAttribute("aria-sort", "none");
      header.setAttribute("tabindex", "0");
      if (!header.hasAttribute("scope")) header.setAttribute("scope", "col");
      header.title = "Clique para ordenar esta coluna";
    });
  }

  function enhanceTables(root) {
    if (root instanceof globalScope.HTMLTableElement) enhanceTable(root);
    root.querySelectorAll?.("table").forEach(enhanceTable);
  }

  function install(documentRoot) {
    enhanceTables(documentRoot);

    documentRoot.addEventListener("click", (event) => {
      const header = event.target.closest?.("th[data-sortable-column]");
      if (header) sortByHeader(header);
    });

    documentRoot.addEventListener("keydown", (event) => {
      const header = event.target.closest?.("th[data-sortable-column]");
      if (!header || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      sortByHeader(header);
    });

    const observer = new MutationObserver((mutations) => {
      const changedTables = new Set();
      mutations.forEach((mutation) => {
        const table = mutation.target.closest?.("table");
        if (table && mutation.target.closest?.("tbody")) changedTables.add(table);
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) enhanceTables(node);
        });
      });
      changedTables.forEach((table) => {
        if (!sortingTables.has(table)) resetTableSort(table);
      });
    });
    observer.observe(documentRoot.body, { childList: true, subtree: true });
  }

  const api = { comparableValue, compareCellValues, install };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope.document) install(globalScope.document);
}(typeof window === "undefined" ? globalThis : window));
