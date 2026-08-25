const STORAGE_KEY = "bitacora-reporte-draft-v1";
const form = document.querySelector("#reportForm");
const mattersList = document.querySelector("#mattersList");
const template = document.querySelector("#matterTemplate");
const saveButton = document.querySelector("#saveButton");
const saveStatus = document.querySelector("#saveStatus");
const toast = document.querySelector("#toast");
let toastTimer;
let draftTimer;
const STATUS_POLL_INTERVAL = 1000;
const STATUS_POLL_ATTEMPTS = 30;
const ORGANIZATIONS = ["Cuórum de Élderes", "Escuela Dominical", "Sociedad de Socorro", "Mujeres Jóvenes", "Primaría"];

const fields = ["subject", "challenges", "actions", "results", "resources", "helpers", "notes"];

function todayLocal() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function createMatter(data = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  fields.forEach((field) => {
    node.querySelector(`[data-field="${field}"]`).value = data[field] || "";
  });
  node.querySelector('[data-field="subject"]').addEventListener("input", (event) => {
    node.querySelector(".matter-title").textContent = event.target.value.trim() || "Nuevo asunto";
  });
  node.querySelector(".matter-title").textContent = data.subject || "Nuevo asunto";
  node.querySelector(".remove-button").addEventListener("click", () => {
    if (mattersList.children.length === 1) {
      showToast("El reporte necesita al menos un asunto.", true);
      return;
    }
    node.remove();
    renumberMatters();
    saveDraftSoon();
  });
  mattersList.append(node);
  renumberMatters();
  return node;
}

function renumberMatters() {
  [...mattersList.children].forEach((card, index) => {
    const number = String(index + 1).padStart(2, "0");
    card.querySelector(".matter-number").textContent = number;
    card.querySelector(".remove-button").setAttribute("aria-label", `Eliminar asunto ${index + 1}`);
  });
  const count = mattersList.children.length;
  document.querySelector("#matterCount").textContent = `${count} ${count === 1 ? "asunto" : "asuntos"}`;
}

function collectReport() {
  const selectedOrganization = form.organizationSelection.value;
  return {
    organization: selectedOrganization === "Otro" ? form.organization.value.trim() : selectedOrganization,
    leader: form.leader.value.trim(),
    reportDate: form.reportDate.value,
    matters: [...mattersList.children].map((card) => Object.fromEntries(
      fields.map((field) => [field, card.querySelector(`[data-field="${field}"]`).value.trim()])
    ))
  };
}

function syncOrganizationField() {
  const isOther = form.organizationSelection.value === "Otro";
  document.querySelector("#organizationOtherField").hidden = !isOther;
  form.organization.required = isOther;
  if (!isOther) form.organization.value = "";
}

function setSaveStatus(message) {
  if (saveStatus) saveStatus.textContent = message;
}

function saveDraftSoon() {
  setSaveStatus("Guardando borrador…");
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectReport()));
    setSaveStatus("Borrador guardado");
  }, 350);
}

function loadDraft() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { draft = null; }
  const draftOrganization = draft?.organization || "";
  if (ORGANIZATIONS.includes(draftOrganization)) {
    form.organizationSelection.value = draftOrganization;
  } else if (draftOrganization) {
    form.organizationSelection.value = "Otro";
    form.organization.value = draftOrganization;
  }
  syncOrganizationField();
  form.leader.value = draft?.leader || "";
  form.reportDate.value = draft?.reportDate || todayLocal();
  (draft?.matters?.length ? draft.matters : [{}]).forEach(createMatter);
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 4500);
}

function addMatterAndFocus() {
  const card = createMatter();
  card.querySelector("input").focus();
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  saveDraftSoon();
}

function createRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getReportStatus(apiUrl, requestId) {
  return new Promise((resolve, reject) => {
    const callbackName = `__reportStatus_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => cleanup(new Error("La consulta de estado tardó demasiado.")), 8000);

    function cleanup(error, result) {
      clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
      if (error) reject(error);
      else resolve(result);
    }

    window[callbackName] = (result) => cleanup(null, result);
    const url = new URL(apiUrl);
    url.searchParams.set("action", "status");
    url.searchParams.set("requestId", requestId);
    url.searchParams.set("callback", callbackName);
    script.src = url.toString();
    script.onerror = () => cleanup(new Error("No se pudo consultar el estado del reporte."));
    document.head.append(script);
  });
}

async function waitForReportStatus(apiUrl, requestId) {
  for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
    try {
      const result = await getReportStatus(apiUrl, requestId);
      if (result.status === "success" || result.status === "error") return result;
    } catch (error) {
      if (attempt === STATUS_POLL_ATTEMPTS - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL));
  }
  throw new Error("No pudimos confirmar el guardado. Tu borrador sigue disponible.");
}

function resetReportForm() {
  form.reset();
  syncOrganizationField();
  mattersList.replaceChildren();
  form.reportDate.value = todayLocal();
  createMatter();
}

async function submitReport(event) {
  event.preventDefault();
  if (!form.reportValidity()) {
    form.querySelector(":invalid")?.focus();
    showToast("Completa los campos obligatorios para guardar.", true);
    return;
  }
  const apiUrl = window.REPORT_APP_CONFIG?.apiUrl;
  if (!apiUrl) {
    showToast("Falta configurar la dirección de Google Apps Script.", true);
    return;
  }
  saveButton.disabled = true;
  saveButton.firstElementChild.textContent = "Guardando…";
  const requestId = createRequestId();
  const report = collectReport();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  setSaveStatus("Guardando reporte…");
  try {
    await fetch(apiUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveReport", requestId, ...report })
    });
    const result = await waitForReportStatus(apiUrl, requestId);
    if (result.status === "error") throw new Error(result.error || "Google Sheets rechazó el reporte.");
    localStorage.removeItem(STORAGE_KEY);
    setSaveStatus(`Guardado · ${result.reportId}`);
    showToast(`Reporte guardado correctamente · ${result.reportId}`);
    resetReportForm();
  } catch (error) {
    setSaveStatus("No se pudo guardar");
    showToast(error.message || "No se pudo conectar. Tu borrador sigue guardado.", true);
  } finally {
    saveButton.disabled = false;
    saveButton.firstElementChild.textContent = "Guardar reporte";
  }
}

document.querySelector("#addMatterTop").addEventListener("click", addMatterAndFocus);
document.querySelector("#addMatterBottom").addEventListener("click", addMatterAndFocus);
form.organizationSelection.addEventListener("change", () => {
  syncOrganizationField();
  if (form.organizationSelection.value === "Otro") form.organization.focus();
  saveDraftSoon();
});
form.addEventListener("input", saveDraftSoon);
form.addEventListener("submit", submitReport);
loadDraft();
