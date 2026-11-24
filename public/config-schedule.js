(function exposeConfigSchedule(root) {
  function normalizedPlanKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, "");
  }

  function isoDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function automaticDownloadDate(agreement, desiredMonth, desiredYear) {
    const month = Number(desiredMonth);
    const year = Number(desiredYear);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return "";

    const plan = normalizedPlanKey(agreement);
    const downloadDay = {
      sulamerica: 20,
      intermedica: 20,
      fiosaude: 25,
      itau: 25,
      portoseguro: 25,
    }[plan];
    if (downloadDay) return isoDate(year, month, downloadDay);

    if (["caberj", "caberjintegral", "varreduraanterior", "tesouraria"].includes(plan)) {
      const nextMonth = new Date(Date.UTC(year, month, 1));
      const day = plan === "tesouraria" ? 2 : 1;
      return isoDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, day);
    }
    return "";
  }

  function automaticDownloadTime(agreement) {
    const plan = normalizedPlanKey(agreement);
    return {
      varreduraanterior: "02:00",
      tesouraria: "07:00",
      fiosaude: "01:00",
      portoseguro: "02:30",
      itau: "02:00",
      caberj: "01:00",
      caberjintegral: "01:30",
      sulamerica: "01:00",
      intermedica: "02:00",
    }[plan] || "";
  }

  function nextImportSchedule(downloadDate) {
    const match = String(downloadDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) return "";

    while (![2, 4].includes(date.getUTCDay())) {
      date.setUTCDate(date.getUTCDate() + 1);
    }

    const scheduledDay = String(date.getUTCDate()).padStart(2, "0");
    const scheduledMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${scheduledDay}/${scheduledMonth}/${date.getUTCFullYear()}`;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { automaticDownloadDate, automaticDownloadTime, nextImportSchedule };
  } else {
    root.automaticDownloadDate = automaticDownloadDate;
    root.automaticDownloadTime = automaticDownloadTime;
    root.nextImportSchedule = nextImportSchedule;
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
