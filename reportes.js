const SESSION_KEY = "bitacora-dashboard-access";
const accessGate = document.querySelector("#accessGate");
const accessForm = document.querySelector("#accessForm");
const accessInput = document.querySelector("#accessKey");
const accessError = document.querySelector("#accessError");
const reportsView = document.querySelector("#reportsView");
const reportsContent = document.querySelector("#reportsContent");
const reportsSummary = document.querySelector("#reportsSummary");
const weekLabel = document.querySelector("#weekLabel");
const logoutButton = document.querySelector("#logoutButton");
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

function matterDetail(matter, index) {
  const details = element("details", "archive-matter");
  const summary = element("summary");
  summary.append(element("span", "archive-matter-number", String(index + 1).padStart(2, "0")));
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
  report.matters.forEach((matter, index) => matters.append(matterDetail(matter, index)));
  article.append(matters);
  return article;
}

function renderReports(data) {
  reportsContent.replaceChildren();
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
    accessError.textContent = "";
    renderReports(result);
  } catch (error) {
    reportsSummary.textContent = "";
    if (error.message.toLowerCase().includes("clave")) {
      sessionStorage.removeItem(SESSION_KEY);
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
  reportsView.hidden = true;
  accessGate.hidden = false;
  logoutButton.hidden = true;
  accessInput.value = "";
  accessInput.focus();
});

if (sessionStorage.getItem(SESSION_KEY)) loadReports();
