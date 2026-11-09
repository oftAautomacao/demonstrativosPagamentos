function displayPlanName(value = "") {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedPlanKey(value = "") {
  return displayPlanName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "");
}

function canonicalPlanName(value = "") {
  const name = displayPlanName(value);
  const key = normalizedPlanKey(name);
  if (key === "caberjintegral") return "Caberj Integral";
  if (key === "fiosaude") return "Fio Saúde";
  if (key === "itau") return "Itaú";
  if (key === "portoseguro") return "Porto Seguro";
  return name;
}

function samePlanName(left, right) {
  return normalizedPlanKey(left) === normalizedPlanKey(right);
}

module.exports = { canonicalPlanName, displayPlanName, normalizedPlanKey, samePlanName };
