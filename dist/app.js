const STORAGE_KEY = "bitacora-reporte-draft-v1";
const form = document.querySelector("#reportForm");
const mattersList = document.querySelector("#mattersList");
const template = document.querySelector("#matterTemplate");
const saveButton = document.querySelector("#saveButton");
const saveStatus = document.querySelector("#saveStatus");
const toast = document.querySelector("#toast");
let toastTimer;
let draftTimer;

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
  return {
    organization: form.organization.value.trim(),
    leader: form.leader.value.trim(),
    reportDate: form.reportDate.value,
    matters: [...mattersList.children].map((card) => Object.fromEntries(
      fields.map((field) => [field, card.querySelector(`[data-field="${field}"]`).value.trim()])
    ))
  };
}

function saveDraftSoon() {
  saveStatus.textContent = "Guardando borrador…";
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectReport()));
    saveStatus.textContent = "Borrador guardado";
  }, 350);
}

function loadDraft() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { draft = null; }
  form.organization.value = draft?.organization || "";
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
  try {
    await fetch(apiUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveReport", ...collectReport() })
    });
    localStorage.removeItem(STORAGE_KEY);
    saveStatus.textContent = "Reporte enviado";
    showToast("Reporte enviado. Puedes confirmar el registro en Google Sheets.");
    form.reset();
    mattersList.replaceChildren();
    form.reportDate.value = todayLocal();
    createMatter();
  } catch (error) {
    showToast(error.message || "No se pudo conectar. Tu borrador sigue guardado.", true);
  } finally {
    saveButton.disabled = false;
    saveButton.firstElementChild.textContent = "Guardar reporte";
  }
}

document.querySelector("#addMatterTop").addEventListener("click", addMatterAndFocus);
document.querySelector("#addMatterBottom").addEventListener("click", addMatterAndFocus);
form.addEventListener("input", saveDraftSoon);
form.addEventListener("submit", submitReport);
loadDraft();
