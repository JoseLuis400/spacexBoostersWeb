import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc,
  setDoc, updateDoc, deleteDoc, getDoc, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAU8I3PbYOrd-qCSGNX3nyF6WWg0oIhAS8",
  authDomain: "spacexboosters.firebaseapp.com",
  projectId: "spacexboosters",
  storageBucket: "spacexboosters.firebasestorage.app",
  messagingSenderId: "347004633729",
  appId: "1:347004633729:web:2953672e258f6a67814380",
  measurementId: "G-P27248GMWL",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

let capsulesData = [];
let editingCapsuleId = null;
let editingMissionIndex = null;
let currentCapsuleId = null;
let crewMembers = [];
let activeEvents = new Set(); // "launch" | "docking" | "undocking" | "splashdown"

const EVENT_CONFIG = {
  launch: {
    label: "Lanzamiento", icon: "🚀",
    fields: `
      <div class="form-group">
        <label>Fecha/hora (UTC):</label>
        <input type="datetime-local" id="missionLaunchDate">
        <small>La fecha de ordenación se deriva automáticamente.</small>
      </div>
      <div class="form-group">
        <label>Plataforma:</label>
        <select id="missionLaunchPad">
          <option value="LC-39A">LC-39A</option>
          <option value="SLC-40">SLC-40</option>
          <option value="SLC-4E">SLC-4E</option>
        </select>
      </div>`,
  },
  docking: {
    label: "Acoplamiento", icon: "🔗",
    fields: `
      <div class="form-group">
        <label>Fecha/hora (UTC):</label>
        <input type="datetime-local" id="missionDockingDate">
      </div>
      <div class="form-group">
        <label>Puerto:</label>
        <select id="missionDockingPort">
          <option value="">— Sin especificar —</option>
          <option value="PMA-2 (forward)">PMA-2 (forward)</option>
          <option value="PMA-3 (zenith)">PMA-3 (zenith)</option>
          <option value="IDA-2 (forward)">IDA-2 (forward)</option>
          <option value="IDA-3 (zenith)">IDA-3 (zenith)</option>
        </select>
      </div>`,
  },
  undocking: {
    label: "Desacoplamiento", icon: "🔓",
    fields: `
      <div class="form-group">
        <label>Fecha/hora (UTC):</label>
        <input type="datetime-local" id="missionUndocking">
      </div>`,
  },
  splashdown: {
    label: "Amerizaje", icon: "💧",
    fields: `
      <div class="form-group">
        <label>Fecha/hora (UTC):</label>
        <input type="datetime-local" id="missionSplashdown">
      </div>`,
  },
};

// --------------------- UTILIDADES ---------------------
function toTimestamp(datetimeLocalValue) {
  if (!datetimeLocalValue) return null;
  return Timestamp.fromDate(new Date(datetimeLocalValue));
}

function fromTimestamp(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = n => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function formatTimestampDisplay(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString("es-ES", {
    timeZone: "UTC", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }) + " UTC";
}

function dateStringFromTimestamp(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = n => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function getCurrentUTC() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  return {
    updateDate: `${pad(now.getUTCDate())}/${pad(now.getUTCMonth() + 1)}/${now.getUTCFullYear()}`,
    updateTime: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`,
  };
}

async function uploadFile(file, storagePath, progressEl) {
  const uploadTask = uploadBytesResumable(ref(storage, storagePath), file);
  if (progressEl) progressEl.style.display = "block";
  uploadTask.on("state_changed", snap => {
    if (progressEl) progressEl.value = (snap.bytesTransferred / snap.totalBytes) * 100;
  });
  await uploadTask;
  if (progressEl) progressEl.style.display = "none";
  return storagePath;
}

const TYPE_LABELS = { crew: "Crew Dragon", cargo_v2: "Cargo Dragon 2", cargo_v1: "Cargo Dragon 1" };
const STATUS_LABELS = { active: "Activo", orbit: "En órbita", retired: "Retirado", destroyed: "Destruido", discarded: "Desechado" };

// --------------------- CONFIG ---------------------
async function loadConfig() {
  try {
    const configDoc = await getDoc(doc(db, "data", "config"));
    if (configDoc.exists()) {
      const data = configDoc.data();
      document.getElementById("last-update").textContent =
        `${data.updateDate} • ${data.updateTime} UTC (por ${data.updatedBy ?? "?"})`;
    }
  } catch (e) {
    document.getElementById("last-update").textContent = "Error al cargar";
  }
}

async function updateConfigUTC() {
  try {
    const utc = getCurrentUTC();
    const user = auth.currentUser;
    let updatedBy = "Desconocido";
    if (user) {
      const usersDoc = await getDoc(doc(db, "data", "users"));
      if (usersDoc.exists()) {
        const ud = usersDoc.data()[user.uid];
        if (ud?.name) updatedBy = ud.name;
      }
    }
    await updateDoc(doc(db, "data", "config"), {
      updateDate: utc.updateDate, updateTime: utc.updateTime, updatedBy,
    });
    document.getElementById("last-update").textContent =
      `${utc.updateDate} • ${utc.updateTime} UTC (por ${updatedBy})`;
  } catch (e) {
    document.getElementById("last-update").textContent = "Error al actualizar";
  }
}

document.getElementById("btn-actualizar").addEventListener("click", updateConfigUTC);

// --------------------- EVENTOS DE VUELO ---------------------
const ORDER = ["launch", "docking", "undocking", "splashdown"];

function renderDateEvents() {
  const container = document.getElementById("dateEventsContainer");
  container.innerHTML = "";

  ORDER.filter(k => activeEvents.has(k)).forEach(key => {
    const cfg = EVENT_CONFIG[key];
    const card = document.createElement("div");
    card.className = "date-event-card";
    card.innerHTML = `
      <div class="date-event-header">
        <span>${cfg.icon} ${cfg.label}</span>
        <button type="button" class="btn btn-danger date-event-remove" data-event="${key}">✕ Eliminar</button>
      </div>
      <div class="date-event-fields">${cfg.fields}</div>
    `;
    container.appendChild(card);
  });

  // Restaurar valores guardados en el formulario
  restoreEventValues();
  updateEventButtons();
}

function updateEventButtons() {
  document.querySelectorAll("#dateEventBtns .btn-event").forEach(btn => {
    const key = btn.dataset.event;
    if (activeEvents.has(key)) {
      btn.classList.add("active");
      btn.disabled = true;
    } else {
      btn.classList.remove("active");
      btn.disabled = false;
    }
  });
}

// Guarda los valores actuales antes de re-renderizar
const savedEventValues = {};
function saveEventValues() {
  if (activeEvents.has("launch")) {
    savedEventValues.launchDate = document.getElementById("missionLaunchDate")?.value ?? "";
    savedEventValues.launchPad = document.getElementById("missionLaunchPad")?.value ?? "LC-39A";
  }
  if (activeEvents.has("docking")) {
    savedEventValues.dockingDate = document.getElementById("missionDockingDate")?.value ?? "";
    savedEventValues.dockingPort = document.getElementById("missionDockingPort")?.value ?? "";
  }
  if (activeEvents.has("undocking")) {
    savedEventValues.undocking = document.getElementById("missionUndocking")?.value ?? "";
  }
  if (activeEvents.has("splashdown")) {
    savedEventValues.splashdown = document.getElementById("missionSplashdown")?.value ?? "";
  }
}

function restoreEventValues() {
  if (savedEventValues.launchDate !== undefined)
    document.getElementById("missionLaunchDate")?.setAttribute("value", savedEventValues.launchDate);
  if (savedEventValues.launchDate !== undefined && document.getElementById("missionLaunchDate"))
    document.getElementById("missionLaunchDate").value = savedEventValues.launchDate;
  if (savedEventValues.launchPad && document.getElementById("missionLaunchPad"))
    document.getElementById("missionLaunchPad").value = savedEventValues.launchPad;
  if (savedEventValues.dockingDate !== undefined && document.getElementById("missionDockingDate"))
    document.getElementById("missionDockingDate").value = savedEventValues.dockingDate;
  if (savedEventValues.dockingPort !== undefined && document.getElementById("missionDockingPort"))
    document.getElementById("missionDockingPort").value = savedEventValues.dockingPort;
  if (savedEventValues.undocking !== undefined && document.getElementById("missionUndocking"))
    document.getElementById("missionUndocking").value = savedEventValues.undocking;
  if (savedEventValues.splashdown !== undefined && document.getElementById("missionSplashdown"))
    document.getElementById("missionSplashdown").value = savedEventValues.splashdown;
}

function clearEventValues(key) {
  delete savedEventValues[{
    launch: "launchDate", docking: "dockingDate",
    undocking: "undocking", splashdown: "splashdown",
  }[key]];
  if (key === "launch") delete savedEventValues.launchPad;
  if (key === "docking") delete savedEventValues.dockingPort;
}

// Botones "Agregar"
document.getElementById("dateEventBtns").addEventListener("click", e => {
  const btn = e.target.closest(".btn-event");
  if (!btn) return;
  saveEventValues();
  activeEvents.add(btn.dataset.event);
  renderDateEvents();
});

// Botones "Eliminar" (delegados en el container)
document.getElementById("dateEventsContainer").addEventListener("click", e => {
  const btn = e.target.closest(".date-event-remove");
  if (!btn) return;
  const key = btn.dataset.event;
  saveEventValues();
  clearEventValues(key);
  activeEvents.delete(key);
  renderDateEvents();
});

function resetMissionEvents() {
  activeEvents.clear();
  Object.keys(savedEventValues).forEach(k => delete savedEventValues[k]);
  renderDateEvents();
}

function loadMissionEvents(m) {
  activeEvents.clear();
  Object.keys(savedEventValues).forEach(k => delete savedEventValues[k]);

  if (m.launchDate) { activeEvents.add("launch"); savedEventValues.launchDate = fromTimestamp(m.launchDate); savedEventValues.launchPad = m.launchPad ?? "LC-39A"; }
  if (m.docking?.date) { activeEvents.add("docking"); savedEventValues.dockingDate = fromTimestamp(m.docking.date); savedEventValues.dockingPort = m.docking.port ?? ""; }
  if (m.undocking) { activeEvents.add("undocking"); savedEventValues.undocking = fromTimestamp(m.undocking); }
  if (m.splashdown) { activeEvents.add("splashdown"); savedEventValues.splashdown = fromTimestamp(m.splashdown); }

  renderDateEvents();
}

// --------------------- CARGA ---------------------
async function loadData() {
  try {
    const snapshot = await getDocs(collection(db, "capsulas"));
    capsulesData = snapshot.docs
      .filter(d => d.id !== "metadata")
      .map(d => ({ id: d.id, ...d.data(), missions: d.data().missions || [] }));
    capsulesData.sort((a, b) => parseInt(b.id.replace("C", "")) - parseInt(a.id.replace("C", "")));
    renderCapsules();
  } catch (e) {
    console.error("Error cargando cápsulas:", e);
    alert("Error al cargar los datos desde Firebase");
  }
}

// --------------------- RENDER ---------------------
function renderCapsules() {
  const container = document.getElementById("capsulesAdmin");
  container.innerHTML = "";
  if (capsulesData.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#888;">No hay cápsulas. Agrega una nueva.</div>';
    return;
  }
  capsulesData.forEach(c => container.appendChild(createCapsuleCard(c)));
}

function createCapsuleCard(capsule) {
  const card = document.createElement("div");
  card.className = "admin-booster-card";
  if (capsule.image) {
    card.classList.add("with-bg");
    card.style.setProperty("--bg-image", `url('${capsule.image}')`);
  } else {
    card.classList.add("no-bg");
  }

  const completedMissions = capsule.missions.filter(m => !m.programado).length;
  const statusLabel = STATUS_LABELS[capsule.status] ?? capsule.status;
  const typeLabel = TYPE_LABELS[capsule.type] ?? capsule.type;

  card.innerHTML = `
    <div class="card-content">
      <div class="admin-booster-header">
        <h3>${capsule.id}${capsule.name ? ` — ${capsule.name}` : ""}</h3>
        <div class="admin-booster-actions">
          <button class="btn btn-edit" onclick="editCapsule('${capsule.id}')">✏️ Editar</button>
          <button class="btn btn-danger" onclick="deleteCapsule('${capsule.id}')">🗑️ Eliminar</button>
        </div>
      </div>
      <div class="admin-booster-info">
        ${capsule.desc ? `<p><strong>Descripción:</strong> ${capsule.desc}</p>` : ""}
        <p><strong>Tipo:</strong> ${typeLabel}</p>
        <p><strong>Estado:</strong> <span class="status-badge status-${capsule.status}">${statusLabel}</span></p>
        <p><strong>Misiones completadas:</strong> ${completedMissions}</p>
      </div>
      <div class="missions-list">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
          <h4 style="margin:0;">Misiones (${capsule.missions.length})</h4>
        </div>
        <div style="max-height:400px;overflow-y:auto;padding-right:0.5rem;">
          ${capsule.missions.map((m, i) => createMissionItem(m, i, capsule.id)).join("")}
        </div>
        <button class="btn add-mission-btn" onclick="addMission('${capsule.id}')">+ Agregar Misión</button>
      </div>
    </div>
  `;
  return card;
}

function createMissionItem(mission, index, capsuleId) {
  const programadoBadge = mission.programado ? '<span style="color:#ffa500;">🔔 PROGRAMADO</span>' : "";
  const inFlightBadge = mission.inFlight ? '<span style="color:#00d9ff;">🚀 En vuelo</span>' : "";
  const dockingDate = formatTimestampDisplay(mission.docking?.date);
  const crewCount = mission.crew?.length ? `👨‍🚀 ${mission.crew.length} tripulantes` : "Sin tripulación";
  const destination = mission.destination ? `🌍 ${mission.destination}` : "";

  return `
    <div class="mission-item">
      <div class="mission-info">
        <p><strong>${mission.name}</strong> ${programadoBadge} ${inFlightBadge} ${destination}</p>
        <p>📅 ${mission.date ?? "—"} | 🔗 ${mission.docking?.port ?? "Sin puerto"} | ${crewCount}</p>
        <p>🛸 Acoplamiento: ${dockingDate}</p>
      </div>
      <div class="mission-actions">
        <button class="btn btn-edit" onclick="editMission('${capsuleId}', ${index})">✏️</button>
        <button class="btn btn-danger" onclick="deleteMission('${capsuleId}', ${index})">🗑️</button>
      </div>
    </div>
  `;
}

// --------------------- CÁPSULA CRUD ---------------------
document.getElementById("addCapsuleBtn").addEventListener("click", () => {
  editingCapsuleId = null;
  document.getElementById("capsuleModalTitle").textContent = "Agregar Cápsula";
  document.getElementById("capsuleForm").reset();
  document.getElementById("capsuleModal").style.display = "block";
  document.body.classList.add("modal-open");
});

window.editCapsule = (id) => {
  editingCapsuleId = id;
  const c = capsulesData.find(x => x.id === id);
  document.getElementById("capsuleModalTitle").textContent = "Editar Cápsula";
  document.getElementById("capsuleId").value = c.id;
  document.getElementById("capsuleName").value = c.name ?? "";
  document.getElementById("capsuleDesc").value = c.desc ?? "";
  document.getElementById("capsuleType").value = c.type ?? "crew";
  document.getElementById("capsuleStatus").value = c.status ?? "active";
  document.getElementById("capsuleImage").value = c.image ?? "";
  document.getElementById("capsuleModal").style.display = "block";
  document.body.classList.add("modal-open");
};

window.deleteCapsule = async (id) => {
  if (!confirm(`¿Eliminar la cápsula ${id}? Esta acción no se puede deshacer.`)) return;
  try {
    await deleteDoc(doc(db, "capsulas", id));
    capsulesData = capsulesData.filter(c => c.id !== id);
    renderCapsules();
  } catch (e) {
    console.error(e);
    alert("Error al eliminar la cápsula");
  }
};

document.getElementById("capsuleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("capsuleId").value.trim();
  const fileInput = document.getElementById("capsuleImageFile");
  let imagePath = document.getElementById("capsuleImage").value.trim();

  try {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const ext = file.name.split(".").pop();
      imagePath = await uploadFile(file, `img/capsulas/${id}.${ext}`, document.getElementById("uploadProgress"));
    }

    const data = {
      name: document.getElementById("capsuleName").value.trim() || null,
      desc: document.getElementById("capsuleDesc").value.trim() || null,
      type: document.getElementById("capsuleType").value,
      status: document.getElementById("capsuleStatus").value,
      image: imagePath || null,
    };

    if (editingCapsuleId) {
      const existing = capsulesData.find(c => c.id === editingCapsuleId);
      data.missions = existing.missions;
      await setDoc(doc(db, "capsulas", editingCapsuleId), data);
    } else {
      data.missions = [];
      await setDoc(doc(db, "capsulas", id), data);
    }

    document.getElementById("capsuleModal").style.display = "none";
    document.body.classList.remove("modal-open");
    await loadData();
  } catch (e) {
    console.error(e);
    alert("Error al guardar la cápsula");
  }
});

// --------------------- MISIÓN CRUD ---------------------
window.addMission = (capsuleId) => {
  currentCapsuleId = capsuleId;
  editingMissionIndex = null;
  crewMembers = [];
  document.getElementById("missionModalTitle").textContent = "Agregar Misión";
  document.getElementById("missionForm").reset();
  resetMissionEvents();
  renderCrewList();
  document.getElementById("missionModal").style.display = "block";
  document.body.classList.add("modal-open");
};

window.editMission = (capsuleId, index) => {
  currentCapsuleId = capsuleId;
  editingMissionIndex = index;
  const m = capsulesData.find(c => c.id === capsuleId).missions[index];

  document.getElementById("missionModalTitle").textContent = "Editar Misión";
  document.getElementById("missionName").value = m.name ?? "";
  document.getElementById("missionReturnDate").value = m.returnDate ? fromTimestamp(m.returnDate) : "";
  document.getElementById("missionDestination").value = m.destination ?? "";
  document.getElementById("missionSuccess").value = m.success === null || m.success === undefined ? "null" : String(m.success);
  document.getElementById("missionProgramado").checked = m.programado ?? false;
  document.getElementById("missionInFlight").checked = m.inFlight ?? false;
  document.getElementById("missionPatch").value = m.patch ?? "";

  crewMembers = m.crew ? m.crew.map(c => ({ ...c })) : [];
  renderCrewList();
  loadMissionEvents(m);

  document.getElementById("missionModal").style.display = "block";
  document.body.classList.add("modal-open");
};

window.deleteMission = async (capsuleId, index) => {
  if (!confirm("¿Eliminar esta misión?")) return;
  try {
    const capsule = capsulesData.find(c => c.id === capsuleId);
    capsule.missions.splice(index, 1);
    await updateDoc(doc(db, "capsulas", capsuleId), { missions: capsule.missions });
    renderCapsules();
  } catch (e) {
    console.error(e);
    alert("Error al eliminar la misión");
  }
};

document.getElementById("missionForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const capsule = capsulesData.find(c => c.id === currentCapsuleId);
  const capsuleId = currentCapsuleId;

  // Parche: primero subir si hay archivo
  let patchPath = document.getElementById("missionPatch").value.trim();
  const patchFile = document.getElementById("missionPatchFile").files[0];
  if (patchFile) {
    const ext = patchFile.name.split(".").pop();
    const missionSlug = document.getElementById("missionName").value.trim().toLowerCase().replace(/\s+/g, "-");
    patchPath = await uploadFile(
      patchFile,
      `img/patches/${missionSlug}.${ext}`,
      document.getElementById("patchUploadProgress")
    );
  }

  const launchDateTs = activeEvents.has("launch")
    ? toTimestamp(document.getElementById("missionLaunchDate")?.value)
    : null;

  const missionData = {
    name: document.getElementById("missionName").value.trim(),
    date: launchDateTs ? dateStringFromTimestamp(launchDateTs) : "",
    launchDate: launchDateTs,
    launchPad: activeEvents.has("launch") ? (document.getElementById("missionLaunchPad")?.value ?? null) : null,
    docking: activeEvents.has("docking") ? {
      date: toTimestamp(document.getElementById("missionDockingDate")?.value),
      port: document.getElementById("missionDockingPort")?.value || null,
    } : { date: null, port: null },
    undocking: activeEvents.has("undocking") ? toTimestamp(document.getElementById("missionUndocking")?.value) : null,
    splashdown: activeEvents.has("splashdown") ? toTimestamp(document.getElementById("missionSplashdown")?.value) : null,
    returnDate: toTimestamp(document.getElementById("missionReturnDate").value),
    destination: document.getElementById("missionDestination").value || null,
    success: (() => { const v = document.getElementById("missionSuccess").value; return v === "null" ? null : v === "true"; })(),
    patch: patchPath || null,
    crew: crewMembers.filter(c => c.name.trim()),
  };

  if (document.getElementById("missionProgramado").checked) missionData.programado = true;
  if (document.getElementById("missionInFlight").checked) missionData.inFlight = true;

  try {
    if (editingMissionIndex !== null) {
      capsule.missions[editingMissionIndex] = missionData;
    } else {
      capsule.missions.push(missionData);
    }
    await updateDoc(doc(db, "capsulas", capsuleId), { missions: capsule.missions });
    document.getElementById("missionModal").style.display = "none";
    document.body.classList.remove("modal-open");
    renderCapsules();
  } catch (e) {
    console.error(e);
    alert("Error al guardar la misión");
  }
});

// --------------------- TRIPULACIÓN ---------------------
document.getElementById("addCrewBtn").addEventListener("click", () => {
  crewMembers.push({ name: "", role: "", image: "", imageFile: null });
  renderCrewList();
});

function renderCrewList() {
  const container = document.getElementById("crewList");
  if (crewMembers.length === 0) {
    container.innerHTML = '<p style="color:#888;font-size:0.85rem;">Sin tripulantes añadidos.</p>';
    return;
  }
  container.innerHTML = crewMembers.map((member, i) => `
    <div class="crew-member-row" id="crew-row-${i}">
      <div class="crew-member-fields">
        <input type="text" placeholder="Nombre" value="${escapeHtml(member.name)}"
               oninput="updateCrewField(${i}, 'name', this.value)">
        <input type="text" placeholder="Rol (Commander, Pilot…)" value="${escapeHtml(member.role)}"
               oninput="updateCrewField(${i}, 'role', this.value)">
        <input type="text" placeholder="URL imagen" value="${escapeHtml(member.image)}"
               oninput="updateCrewField(${i}, 'image', this.value)">
        <div class="crew-image-upload">
          <label class="btn btn-secondary" style="padding:0.4rem 0.8rem;font-size:0.8rem;cursor:pointer;">
            📁 Subir foto
            <input type="file" accept="image/*" style="display:none;"
                   onchange="handleCrewImageFile(${i}, this)">
          </label>
          ${member.image ? `<img src="${escapeHtml(member.image)}" class="crew-thumb" alt="preview">` : ""}
        </div>
      </div>
      <button type="button" class="btn btn-danger crew-remove-btn" onclick="removeCrewMember(${i})">✕</button>
    </div>
  `).join("");
}

function escapeHtml(str) {
  return (str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

window.updateCrewField = (index, field, value) => {
  crewMembers[index][field] = value;
};

window.handleCrewImageFile = async (index, input) => {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split(".").pop();
  const name = crewMembers[index].name.trim().toLowerCase().replace(/\s+/g, "-") || `crew-${index}`;
  const path = `img/crew/${name}.${ext}`;
  try {
    const storedPath = await uploadFile(file, path, null);
    crewMembers[index].image = storedPath;
    renderCrewList();
  } catch (e) {
    console.error("Error subiendo imagen de tripulante:", e);
    alert("Error al subir la imagen");
  }
};

window.removeCrewMember = (index) => {
  crewMembers.splice(index, 1);
  renderCrewList();
};

// --------------------- MODALES (cerrar) ---------------------
document.querySelectorAll(".close").forEach(btn => {
  btn.addEventListener("click", function () {
    this.closest(".modal").style.display = "none";
    document.body.classList.remove("modal-open");
  });
});

document.getElementById("cancelCapsuleBtn").addEventListener("click", () => {
  document.getElementById("capsuleModal").style.display = "none";
  document.body.classList.remove("modal-open");
});

document.getElementById("cancelMissionBtn").addEventListener("click", () => {
  document.getElementById("missionModal").style.display = "none";
  document.body.classList.remove("modal-open");
});

window.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) {
    e.target.style.display = "none";
    document.body.classList.remove("modal-open");
  }
});

// --------------------- INIT ---------------------
loadData();
loadConfig();
