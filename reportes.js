const SESSION_KEY = "bitacora-dashboard-access";
const accessGate = document.querySelector("#accessGate");
const accessForm = document.querySelector("#accessForm");
const accessInput = document.querySelector("#accessKey");
const accessError = document.querySelector("#accessError");
const reportsView = document.querySelector("#reportsView");
const reportsContent = document.querySelector("#reportsContent");
const reportsSummary = document.querySelector("#reportsSummary");
const dashboardNotice = document.querySelector("#dashboardNotice");
const weekLabel = document.querySelector("#weekLabel");
const logoutButton = document.querySelector("#logoutButton");
const deleteToolbar = document.querySelector("#deleteToolbar");
const selectionCount = document.querySelector("#selectionCount");
const deleteSelectedButton = document.querySelector("#deleteSelected");
let selectedWeek = startOfCurrentWeek();

function startOfCurrentWeek() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const daysSinceWednesday = (date.getDay() - 3 + 7) % 7;
  date.setDate(date.getDate() - daysSinceWednesday);
  return date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isoDate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function weekRangeLabel(start) {
  const end = addDays(start, 6);
  const startMonth = start.toLocaleDateString("es-MX", { month: "long" });
  const endMonth = end.toLocaleDateString("es-MX", { month: "long" });
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} de ${endMonth} de ${end.getFullYear()}`;
  }
  return `${start.getDate()} de ${startMonth} – ${end.getDate()} de ${endMonth} de ${end.getFullYear()}`;
}

function jsonpRequest(apiUrl, parameters) {
  return new Promise((resolve, reject) => {
    const callbackName = `__weeklyReports_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => cleanup(new Error("La consulta tardó demasiado. Intenta nuevamente.")), 12000);
    function cleanup(error, result) {
      clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
      if (error) reject(error);
      else resolve(result);
    }
    window[callbackName] = (result) => cleanup(null, result);
    const url = new URL(apiUrl);
    Object.entries({ ...parameters, callback: callbackName }).forEach(([key, value]) => url.searchParams.set(key, value));
    script.src = url.toString();
    script.onerror = () => cleanup(new Error("No se pudo conectar con el archivo de reportes."));
    document.head.append(script);
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateSelectionToolbar() {
  const count = reportsContent.querySelectorAll(".matter-checkbox:checked").length;
  selectionCount.textContent = `${count} ${count === 1 ? "asunto seleccionado" : "asuntos seleccionados"}`;
  deleteToolbar.hidden = count === 0;
}

function matterDetail(matter, index, reportId) {
  const details = element("details", "archive-matter");
  const summary = element("summary");
  const selectLabel = element("label", "matter-select");
  const checkbox = element("input", "matter-checkbox");
  checkbox.type = "checkbox";
  checkbox.dataset.reportId = reportId;
  checkbox.dataset.number = matter.number;
  checkbox.setAttribute("aria-label", `Seleccionar ${matter.subject || `asunto ${index + 1}`}`);
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", updateSelectionToolbar);
  selectLabel.addEventListener("click", (event) => event.stopPropagation());
  selectLabel.append(checkbox, element("span", "archive-matter-number", String(index + 1).padStart(2, "0")));
  summary.append(selectLabel);
  summary.append(element("strong", "", matter.subject || "Asunto sin nombre"));
  summary.append(element("span", "archive-matter-toggle", "Ver detalle"));
  details.append(summary);
  const fieldGrid = element("div", "archive-fields");
  const fields = [
    ["Problemas o desafíos", matter.challenges], ["Qué se ha hecho", matter.actions],
    ["Resultados observados", matter.results], ["Recursos necesarios", matter.resources],
    ["Quién puede ayudar", matter.helpers], ["Notas adicionales", matter.notes]
  ];
  fields.filter(([, value]) => value).forEach(([label, value]) => {
    const field = element("div", "archive-field");
    field.append(element("span", "", label));
    field.append(element("p", "", value));
    fieldGrid.append(field);
  });
  if (!fieldGrid.children.length) fieldGrid.append(element("p", "empty-detail", "No se agregaron detalles a este asunto."));
  details.append(fieldGrid);
  return details;
}

function reportCard(report) {
  const article = element("article", "archive-report");
  const header = element("header", "archive-report-header");
  const identity = element("div");
  identity.append(element("span", "report-id", `ID ${report.reportId}`));
  identity.append(element("h3", "", report.leader));
  const meta = element("div", "report-meta");
  meta.append(element("span", "", new Date(`${report.reportDate}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })));
  meta.append(element("strong", "", `${report.matters.length} ${report.matters.length === 1 ? "asunto" : "asuntos"}`));
  header.append(identity, meta);
  article.append(header);
  const matters = element("div", "archive-matters");
  report.matters.forEach((matter, index) => matters.append(matterDetail(matter, index, report.reportId)));
  article.append(matters);
  return article;
}

function renderReports(data) {
  reportsContent.replaceChildren();
  deleteToolbar.hidden = true;
  dashboardNotice.textContent = "";
  const reports = data.reports || [];
  const matterCount = reports.reduce((total, report) => total + report.matters.length, 0);
  reportsSummary.textContent = `${reports.length} ${reports.length === 1 ? "reporte" : "reportes"} · ${matterCount} ${matterCount === 1 ? "asunto" : "asuntos"}`;
  if (!reports.length) {
    const empty = element("section", "archive-empty panel");
    empty.append(element("span", "", "Semana sin reportes"));
    empty.append(element("h2", "", "Todavía no hay información en este periodo."));
    empty.append(element("p", "", "Usa las flechas para consultar otra semana o crea un reporte nuevo."));
    reportsContent.append(empty);
    return;
  }
  const groups = reports.reduce((map, report) => {
    if (!map.has(report.organization)) map.set(report.organization, []);
    map.get(report.organization).push(report);
    return map;
  }, new Map());
  groups.forEach((organizationReports, organization) => {
    const section = element("section", "organization-group");
    const heading = element("header", "organization-heading");
    heading.append(element("h2", "", organization));
    heading.append(element("span", "", `${organizationReports.length} ${organizationReports.length === 1 ? "reporte" : "reportes"}`));
    section.append(heading);
    const list = element("div", "organization-reports");
    organizationReports.forEach((report) => list.append(reportCard(report)));
    section.append(list);
    reportsContent.append(section);
  });
}

async function waitForMutation(apiUrl, requestId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await jsonpRequest(apiUrl, { action: "status", requestId });
    if (result.status === "success" || result.status === "error") return result;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("No pudimos confirmar el cambio. Actualiza la página antes de intentarlo otra vez.");
}

async function softDeleteSelected() {
  const selected = [...reportsContent.querySelectorAll(".matter-checkbox:checked")].map((checkbox) => ({
    reportId: checkbox.dataset.reportId,
    number: Number(checkbox.dataset.number)
  }));
  if (!selected.length) return;
  const noun = selected.length === 1 ? "este asunto" : `estos ${selected.length} asuntos`;
  if (!window.confirm(`¿Marcar ${noun} como eliminados? Dejarán de aparecer, pero permanecerán en Google Sheets.`)) return;
  const apiUrl = window.REPORT_APP_CONFIG?.apiUrl;
  const accessKey = sessionStorage.getItem(SESSION_KEY);
  const requestId = createRequestId();
  deleteSelectedButton.disabled = true;
  deleteSelectedButton.textContent = "Actualizando…";
  dashboardNotice.textContent = "Marcando asuntos como eliminados…";
  dashboardNotice.classList.remove("error");
  try {
    await fetch(apiUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "softDeleteMatters", requestId, accessKey, selections: selected })
    });
    const result = await waitForMutation(apiUrl, requestId);
    if (result.status === "error") throw new Error(result.error || "No se pudieron actualizar los asuntos.");
    await loadReports();
    dashboardNotice.textContent = `${selected.length} ${selected.length === 1 ? "asunto marcado" : "asuntos marcados"} como eliminados.`;
  } catch (error) {
    dashboardNotice.textContent = error.message;
    dashboardNotice.classList.add("error");
  } finally {
    deleteSelectedButton.disabled = false;
    deleteSelectedButton.textContent = "Marcar como eliminados";
  }
}

async function loadReports() {
  const apiUrl = window.REPORT_APP_CONFIG?.apiUrl;
  const accessKey = sessionStorage.getItem(SESSION_KEY);
  if (!apiUrl) throw new Error("Falta configurar la dirección de Google Apps Script.");
  if (!accessKey) return;
  weekLabel.textContent = weekRangeLabel(selectedWeek);
  reportsSummary.textContent = "Consultando reportes…";
  reportsContent.replaceChildren();
  try {
    const result = await jsonpRequest(apiUrl, { action: "weeklyReports", weekStart: isoDate(selectedWeek), accessKey });
    if (!result.ok) throw new Error(result.error || "No se pudo consultar la semana.");
    accessGate.hidden = true;
    reportsView.hidden = false;
    logoutButton.hidden = false;
    document.documentElement.classList.add("has-dashboard-access");
    accessError.textContent = "";
    renderReports(result);
  } catch (error) {
    reportsSummary.textContent = "";
    if (error.message.toLowerCase().includes("clave")) {
      sessionStorage.removeItem(SESSION_KEY);
      document.documentElement.classList.remove("has-dashboard-access");
      accessGate.hidden = false;
      reportsView.hidden = true;
      logoutButton.hidden = true;
      accessError.textContent = error.message;
      accessInput.focus();
    } else {
      if (reportsView.hidden) accessError.textContent = error.message;
      else reportsContent.append(element("p", "archive-load-error", error.message));
    }
  }
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  sessionStorage.setItem(SESSION_KEY, accessInput.value);
  accessError.textContent = "Verificando…";
  await loadReports();
});
document.querySelector("#previousWeek").addEventListener("click", () => { selectedWeek = addDays(selectedWeek, -7); loadReports(); });
document.querySelector("#nextWeek").addEventListener("click", () => { selectedWeek = addDays(selectedWeek, 7); loadReports(); });
logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  document.documentElement.classList.remove("has-dashboard-access");
  reportsView.hidden = true;
  accessGate.hidden = false;
  logoutButton.hidden = true;
  accessInput.value = "";
  accessInput.focus();
});
deleteSelectedButton.addEventListener("click", softDeleteSelected);

if (sessionStorage.getItem(SESSION_KEY)) {
  accessGate.hidden = true;
  reportsView.hidden = false;
  logoutButton.hidden = false;
  reportsSummary.textContent = "Verificando acceso…";
  loadReports();
}
