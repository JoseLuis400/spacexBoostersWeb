import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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

let capsulesData = [];
let currentFilter = "all";
let filteredCapsules = [];
const liveCounterIntervals = [];

// --------------------- DOM ---------------------
const boostersGrid = document.getElementById("boosters-grid");
const filterButtons = document.querySelectorAll(".filter-btn");
const modal = document.getElementById("booster-modal");
const modalBody = document.getElementById("modal-body");
const modalClose = document.querySelector(".modal-close");

const totalBoostersEl = document.getElementById("total-boosters");
const activeBoostersEl = document.getElementById("active-boosters");
const noActiveBoostersEl = document.getElementById("no-active");
const lastUpdateEl = document.getElementById("last-update");
const totalFlightsEl = document.getElementById("total-flights");

// --------------------- UTILIDADES ---------------------
function tsToDate(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

function formatoFechaUTC(ts) {
  const d = tsToDate(ts);
  if (!d) return "—";
  return d.toLocaleString("es-ES", {
    timeZone: "UTC", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }) + " UTC";
}

function isFlexibleDate(dateString) {
  if (!dateString) return true;
  return dateString.includes("NET") || dateString.length < 10;
}

function formatDate(dateString) {
  if (!dateString || isFlexibleDate(dateString)) return dateString ?? "—";
  const [year, month, day] = dateString.split("-");
  return new Date(year, month - 1, day).toLocaleDateString("es-ES", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

function msDiff(msA, msB) {
  return Math.abs(msA - msB);
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`);
  return parts.join(" ");
}

function formatCounterDHMS(ms) {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hms = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return d > 0 ? `${d}d / ${hms}` : hms;
}

function sortMissionsByDate(missions) {
  return [...missions].sort((a, b) => {
    const ta = tsToDate(a.launchDate)?.getTime() ?? null;
    const tb = tsToDate(b.launchDate)?.getTime() ?? null;
    if (ta && tb) return tb - ta;          // ambas tienen fecha → más nueva primero
    if (ta) return -1;                     // solo a tiene fecha → a primero
    if (tb) return 1;                      // solo b tiene fecha → b primero
    return (b.date ?? "").localeCompare(a.date ?? ""); // fechas flexibles → más reciente primero
  });
}

function traducirEstado(estado) {
  const map = { active: "Activo", retired: "Retirado", destroyed: "Destruido", orbit: "En órbita", unknown: "Desconocido", discarded: "Desechado" };
  return map[estado?.toLowerCase()] ?? estado;
}

function getDockingPortClass(port) {
  if (!port) return "docking-expendable";
  if (port.toLowerCase().includes("zenith")) return "docking-zenith";
  if (port.toLowerCase().includes("forward")) return "docking-forward";
  return "";
}

function getLaunchPadClass(pad) {
  if (!pad) return "";
  if (pad.includes("SLC-40")) return "launchpad-cape";
  if (pad.includes("LC-39A")) return "launchpad-ksc";
  if (pad.includes("SLC-4E")) return "launchpad-vnb";
  return "";
}

function getQueryParam(param) {
  return new URLSearchParams(window.location.search).get(param);
}

async function getImageURL(path) {
  try {
    if (!path) return "placeholder.png";
    if (/^https?:\/\//i.test(path) || /firebasestorage\.googleapis\.com/i.test(path)) return path;
    return await getDownloadURL(ref(storage, path));
  } catch {
    return "placeholder.png";
  }
}

// Devuelve la misión que debe mostrar contador (en progreso o programada futura)
function getCounterMission(capsule) {
  const now = Date.now();
  // Misión lanzada pero no completada (sin amerizaje)
  const inProgress = capsule.missions.find(m => {
    const launch = tsToDate(m.launchDate)?.getTime();
    const splash = tsToDate(m.splashdown)?.getTime();
    return launch && launch <= now && (!splash || splash > now);
  });
  if (inProgress) return inProgress;
  // Misión programada con fecha futura
  return capsule.missions.find(m => {
    const launch = tsToDate(m.launchDate)?.getTime();
    return m.programado && launch && launch > now;
  }) ?? null;
}

// Devuelve { tPlus: Date|null, tMinus: Date|null } según estado de la misión
function getCounterConfig(m) {
  const now = Date.now();
  const launch   = tsToDate(m.launchDate)?.getTime()    ?? null;
  const docking  = tsToDate(m.docking?.date)?.getTime() ?? null;
  const undocking = tsToDate(m.undocking)?.getTime()    ?? null;
  const splashdown = tsToDate(m.splashdown)?.getTime()  ?? null;

  // Programado y lanzamiento futuro → solo T- al lanzamiento
  if (m.programado && launch && launch > now) {
    return { tPlus: null, tPlusLabel: null, tMinus: new Date(launch), tMinusLabel: "LANZAMIENTO" };
  }

  if (!launch || launch > now) return null;

  const tPlus = new Date(launch);
  const tPlusLabel = "EN MISIÓN";

  if (docking && docking > now)
    return { tPlus, tPlusLabel, tMinus: new Date(docking), tMinusLabel: "ACOPLAMIENTO" };
  if (docking && !undocking && !splashdown) {
    const plannedUndock = tsToDate(m.undockingPlanned)?.getTime() ?? null;
    return { tPlus, tPlusLabel, tMinus: plannedUndock && plannedUndock > now ? new Date(plannedUndock) : null, tMinusLabel: "DESACOPLAMIENTO" };
  }
  if (undocking && undocking <= now && splashdown && splashdown > now)
    return { tPlus, tPlusLabel, tMinus: new Date(splashdown), tMinusLabel: "AMERIZAJE" };
  if (undocking && undocking <= now && !splashdown)
    return { tPlus, tPlusLabel, tMinus: null, tMinusLabel: null };

  return null;
}

// Devuelve info de misión activa (acoplada o en vuelo libre) — usado para badge y animación
function getActiveMission(capsule) {
  return capsule.missions.find(m => m.inFlight || (m.docking?.date && !m.undocking && !m.splashdown));
}

// --------------------- CARGA ---------------------
async function loadConfig() {
  const configDoc = await getDoc(doc(db, "data", "config"));
  if (configDoc.exists()) {
    const d = configDoc.data();
    lastUpdateEl.textContent = `${d.updateDate} • ${d.updateTime} UTC`;
  } else {
    lastUpdateEl.textContent = "Desconocido";
  }
}

async function loadCapsulesData() {
  try {
    const snapshot = await getDocs(collection(db, "capsulas"));
    const promises = snapshot.docs
      .filter(d => d.id !== "metadata")
      .map(async docSnap => {
        const data = docSnap.data();
        const imageURL = await getImageURL(data.image);
        return { id: docSnap.id, ...data, image: imageURL, missions: data.missions || [] };
      });

    capsulesData = await Promise.all(promises);
    capsulesData.sort((a, b) => parseInt(b.id.replace("C", "")) - parseInt(a.id.replace("C", "")));

    capsulesData = capsulesData.map(capsule => {
      const sortedMissions = sortMissionsByDate(capsule.missions);
      const completed = sortedMissions.filter(m => !m.programado);
      const flights = completed.length;
      const firstFlight = completed.at(-1)?.launchDate ?? null;
      const lastFlight = completed[0]?.launchDate ?? null;

      let avgDays = "N/A";
      const dates = completed.map(m => tsToDate(m.launchDate)?.getTime()).filter(Boolean);
      if (dates.length >= 2) {
        let total = 0;
        for (let i = 1; i < dates.length; i++) total += dates[i] - dates[i - 1];
        avgDays = Math.round(total / (dates.length - 1) / 86400000) + " días";
      }

      // Vuelo libre total: (amerizaje - lanzamiento) - tiempo acoplado, por misión completada
      let totalFreeFlightMs = 0;
      completed.forEach(m => {
        const l = tsToDate(m.launchDate)?.getTime();
        const s = tsToDate(m.splashdown)?.getTime();
        if (!l || !s) return;
        const d = tsToDate(m.docking?.date)?.getTime();
        const u = tsToDate(m.undocking)?.getTime();
        const dockedMs = (d && u) ? (u - d) : 0;
        totalFreeFlightMs += (s - l) - dockedMs;
      });
      const totalFreeFlight = totalFreeFlightMs > 0 ? formatDuration(totalFreeFlightMs) : null;

      return { ...capsule, flights, firstFlight, lastFlight, avgDays, totalFreeFlight };
    });

    filteredCapsules = [...capsulesData];
  } catch (e) {
    console.error("Error cargando cápsulas:", e);
    boostersGrid.innerHTML = '<div class="loading" style="color:#ef4444;">Error cargando datos de Firebase.</div>';
  }
}

// --------------------- FILTROS ---------------------
function setActiveFilter(filter) {
  filterButtons.forEach(b => b.classList.remove("active"));
  document.querySelector(`[data-filter="${filter}"]`)?.classList.add("active");
  currentFilter = filter;
}

function isCurrentlyInOrbit(capsule) {
  return capsule.missions.some(m =>
    !m.programado && (m.inFlight || (m.docking?.date && !m.undocking && !m.splashdown))
  );
}

function getFilteredBase(filter) {
  if (filter === "all") return [...capsulesData];
  if (filter === "scheduled") return capsulesData.filter(c => c.missions.some(m => m.programado));
  if (filter === "orbit") return capsulesData.filter(c => c.status === "orbit" || isCurrentlyInOrbit(c));
  return capsulesData.filter(c => c.status === filter);
}

function filterCapsules(filter) {
  filteredCapsules = getFilteredBase(filter);
  renderCapsules();
}

// --------------------- RENDER TARJETAS ---------------------
const TYPE_LABELS = { cargo_v1: "Cargo 1", cargo_v2: "Cargo 2", crew: "Crew Dragon" };

function createCapsuleCard(capsule) {
  const card = document.createElement("div");
  card.className = "booster-card";
  const activeMission = getActiveMission(capsule);
  if (activeMission?.inFlight) card.classList.add("is-in-flight");
  else if (capsule.missions.some(m => m.programado)) card.classList.add("has-scheduled-flight");
  card.addEventListener("click", () => openModal(capsule));

  const statusClass = `status-${capsule.status?.toLowerCase().replace(" ", "-")}`;
  const statusText = traducirEstado(capsule.status);
  const typeLabel = TYPE_LABELS[capsule.type] ?? capsule.type ?? "N/A";
  const lastMission = capsule.missions.filter(m => !m.programado).at(-1);
  const lastFlightText = lastMission ? `Última misión: ${lastMission.name}` : "Sin misiones realizadas";

  const counterMission = getCounterMission(capsule);
  const counterCfg = counterMission ? getCounterConfig(counterMission) : null;
  let missionStatusHTML = "";
  if (counterCfg) {
    const isProgramado = counterMission.programado;
    const plusId  = `cplus-${capsule.id}`;
    const minusId = `cminus-${capsule.id}`;
    const plusBlock  = counterCfg.tPlus  ? `
      <div class="cms-counter-block">
        <span class="cms-counter-label">${counterCfg.tPlusLabel}</span>
        <span class="cms-counter t-plus" id="${plusId}">…</span>
      </div>` : "";
    const minusBlock = counterCfg.tMinus ? `
      <div class="cms-counter-block">
        <span class="cms-counter-label">${counterCfg.tMinusLabel}</span>
        <span class="cms-counter t-minus" id="${minusId}">…</span>
      </div>` : "";
    missionStatusHTML = `
      <div class="card-mission-status ${isProgramado ? "is-scheduled" : "is-active"}">
        <div class="cms-name">${counterMission.name}</div>
        <div class="cms-counters">${plusBlock}${minusBlock}</div>
      </div>`;
  }

  card.innerHTML = `
    <span class="block">${typeLabel}</span>
    <div class="booster-image">
      <img src="${capsule.image}" alt="${capsule.id}" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <div class="altImage">${capsule.id}</div>
    </div>
    <div class="booster-content">
      <h3 class="booster-name">${capsule.id}${capsule.name ? ` — ${capsule.name}` : ""}</h3>
      <span class="booster-status ${statusClass}">${statusText}</span>
      ${capsule.flights > 0 ? `<p class="booster-flights">Misiones: ${capsule.flights}</p>` : ""}
      <p class="booster-first-flight">${lastFlightText}</p>
    </div>
    ${missionStatusHTML}
  `;

  return card;
}

function renderCapsules() {
  liveCounterIntervals.forEach(clearInterval);
  liveCounterIntervals.length = 0;
  boostersGrid.innerHTML = "";

  if (filteredCapsules.length === 0) {
    boostersGrid.innerHTML = '<div class="loading">No se encontraron cápsulas para este filtro.</div>';
    return;
  }

  filteredCapsules.forEach(c => boostersGrid.appendChild(createCapsuleCard(c)));
  startLiveCounters();
}

function startLiveCounters() {
  filteredCapsules.forEach(capsule => {
    const mission = getCounterMission(capsule);
    if (!mission) return;
    const cfg = getCounterConfig(mission);
    if (!cfg) return;

    const plusEl  = document.getElementById(`cplus-${capsule.id}`)  ?? null;
    const minusEl = document.getElementById(`cminus-${capsule.id}`) ?? null;

    const tick = () => {
      const now = Date.now();
      if (plusEl && cfg.tPlus)
        plusEl.textContent = `T+ ${formatCounterDHMS(now - cfg.tPlus.getTime())}`;
      if (minusEl && cfg.tMinus) {
        const diff = cfg.tMinus.getTime() - now;
        minusEl.textContent = diff > 0
          ? `T- ${formatCounterDHMS(diff)}`
          : `T+ ${formatCounterDHMS(-diff)}`;
      }
    };
    tick();
    liveCounterIntervals.push(setInterval(tick, 1000));
  });
}

// --------------------- MODAL ---------------------
function openModal(capsule) {
  const statusClass = `status-${capsule.status?.toLowerCase().replace(" ", "-")}`;
  const statusText = traducirEstado(capsule.status);
  const typeLabel = TYPE_LABELS[capsule.type] ?? capsule.type ?? "N/A";
  const activeMission = getActiveMission(capsule);

  const descripcion = capsule.desc
    ? `<div class="booster-description"><span>Descripción:</span> ${capsule.desc}</div>` : "";

  // Fechas resumen
  const firstFlight = capsule.firstFlight;
  const lastFlight = capsule.lastFlight;

  // Historial
  let flightHistoryHTML = "";
  if (capsule.missions.length > 0) {
    flightHistoryHTML = `
      <div class="flight-history">
        <h3>Historial de Misiones</h3>
        ${capsule.missions.map((m, i) => buildMissionArticle(m, i, capsule)).join("")}
      </div>`;
  } else {
    flightHistoryHTML = `<div class="flight-history"><h3>Historial de Misiones</h3>
      <p style="color:var(--muted-foreground);text-align:center;padding:2rem;">Esta cápsula aún no ha realizado misiones.</p></div>`;
  }

  modalBody.innerHTML = `
    <div class="modal-header">
      <img src="${capsule.image}" alt="${capsule.id}" class="modal-image" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <h2 class="modal-title">${capsule.name ?? capsule.id}</h2>
      ${activeMission ? '<span class="scheduled-badge">EN MISIÓN</span>' : ""}
      ${capsule.missions.some(m => m.programado) ? '<span class="scheduled-badge">VUELO PROGRAMADO</span>' : ""}
      <span class="booster-status ${statusClass}">${statusText}</span>
    </div>
    ${descripcion}
    <div class="booster-dates">
      <div class="booster-date"><div style="color:var(--muted-foreground);">Primera Misión</div><h3>${formatoFechaUTC(firstFlight)}</h3></div>
      <div class="booster-date"><div style="color:var(--muted-foreground);">Misiones Totales</div><h3>${capsule.missions.length}</h3></div>
      ${capsule.missions.length >= 2 ? `<div class="booster-date"><div style="color:var(--muted-foreground);">Entre misiones</div><h3>${capsule.avgDays}</h3></div>` : ""}
      <div class="booster-date"><div style="color:var(--muted-foreground);">Última Misión</div><h3>${formatoFechaUTC(lastFlight)}</h3></div>
      ${capsule.totalFreeFlight ? `<div class="booster-date"><div style="color:var(--muted-foreground);">Vuelo libre total</div><h3>${capsule.totalFreeFlight}</h3></div>` : ""}
    </div>
    ${flightHistoryHTML}
  `;

  modal.style.display = "block";
  document.body.classList.add("modal-open");

  const url = new URL(window.location);
  url.searchParams.set("id", capsule.id);
  window.history.pushState({}, "", url);
}

function buildMissionArticle(m, i, capsule) {
  const dockDate   = tsToDate(m.docking?.date);
  const undockDate = tsToDate(m.undocking);
  const splashDate = tsToDate(m.splashdown);
  const launchDate = tsToDate(m.launchDate);

  // Tiempo acoplado (estático si ya desacopló)
  let dockedTime = "";
  if (dockDate && undockDate)
    dockedTime = formatDuration(msDiff(undockDate.getTime(), dockDate.getTime()));

  // Contadores en vivo usando la misma lógica de getCounterConfig
  const cfg = getCounterConfig(m);
  let liveCountersHTML = "";
  if (cfg) {
    const plusId  = `mplus-${capsule.id}-${i}`;
    const minusId = `mminus-${capsule.id}-${i}`;
    liveCountersHTML = `
      <div class="live-counter-wrap modal-counters">
        ${cfg.tPlus  ? `<div class="live-counter t-plus"><span class="live-counter-value" id="${plusId}">…</span></div>`  : ""}
        ${cfg.tMinus ? `<div class="live-counter t-minus"><span class="live-counter-value" id="${minusId}">…</span></div>` : ""}
      </div>`;
    setTimeout(() => {
      const plusEl  = document.getElementById(plusId);
      const minusEl = document.getElementById(minusId);
      const tick = () => {
        const now = Date.now();
        if (plusEl && cfg.tPlus)
          plusEl.textContent = `T+ ${formatCounterDHMS(now - cfg.tPlus.getTime())}`;
        if (minusEl && cfg.tMinus) {
          const diff = cfg.tMinus.getTime() - now;
          minusEl.textContent = diff > 0
            ? `T- ${formatCounterDHMS(diff)}`
            : `T+ ${formatCounterDHMS(-diff)}`;
        }
      };
      tick();
      const iv = setInterval(tick, 1000);
      modalClose.addEventListener("click", () => clearInterval(iv), { once: true });
      modal.addEventListener("click", e => { if (e.target === modal) clearInterval(iv); }, { once: true });
    }, 0);
  }

  // Destino
  const destIcon = { ISS: "🛸", LEO: "🌍", Polar: "🌐" };
  const destBadge = m.destination
    ? `<span class="dest-badge">${destIcon[m.destination] ?? "🌍"} ${m.destination}</span>` : "";

  const isProgramado = m.programado;

  return `
    <article class="mission" ${isProgramado ? 'style="border-color:#f59e0b;"' : ""}>
      <div class="mission-article-header">
        ${m.patch ? `<img src="${m.patch}" alt="parche ${m.name}" class="mission-patch" loading="lazy">` : ""}
        <div class="mission-article-title">
          <h4>${m.name} ${isProgramado ? '<span class="scheduled-badge" style="font-size:0.7rem;">PROGRAMADO</span>' : ""}</h4>
          ${destBadge}
        </div>
      </div>
      <div class="mission-article-body">
        ${liveCountersHTML}
        ${launchDate ? `<p><strong>Lanzamiento:</strong> ${formatoFechaUTC(m.launchDate)}</p>` : ""}
        ${m.launchPad ? `<p><strong>Plataforma:</strong> <span class="launch-platform ${getLaunchPadClass(m.launchPad)}">${m.launchPad}</span></p>` : ""}
        ${dockDate ? `<p><strong>Acoplamiento:</strong> ${formatoFechaUTC(m.docking.date)}${m.docking?.port ? ` — <span class="landing-platform ${getDockingPortClass(m.docking.port)}">${m.docking.port}</span>` : ""}</p>` : ""}
        ${dockedTime ? `<p><strong>Tiempo acoplado:</strong> ${dockedTime}</p>` : ""}
        ${undockDate ? `<p><strong>Desacoplamiento:</strong> ${formatoFechaUTC(m.undocking)}</p>` : ""}
        ${splashDate ? `<p><strong>Amerizaje:</strong> ${formatoFechaUTC(m.splashdown)}</p>` : ""}
        ${m.crew?.length ? `
          <ul class="crew">
            ${m.crew.map(member => `
              <li>
                <img src="${member.image}" alt="${member.name}" loading="lazy"
                     onerror="this.style.display='none';">
                <h5>${member.name}</h5>
                <span class="role">${member.role}</span>
              </li>`).join("")}
          </ul>` : ""}
      </div>
    </article>`;
}

function closeModal() {
  modal.style.display = "none";
  document.body.classList.remove("modal-open");
  const url = new URL(window.location);
  url.searchParams.delete("id");
  window.history.pushState({}, "", url);
}

// --------------------- LISTENERS ---------------------
function setupEventListeners() {
  filterButtons.forEach(btn => {
    btn.addEventListener("click", function () {
      setActiveFilter(this.dataset.filter);
      filterCapsules(this.dataset.filter);
      document.getElementById("search-input").value = "";
    });
  });

  const searchInput = document.getElementById("search-input");
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase().trim();
    const base = getFilteredBase(currentFilter);
    filteredCapsules = q
      ? base.filter(c => c.id.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q))
      : base;
    renderCapsules();
  });

  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

// --------------------- ESTADÍSTICAS ---------------------
function animateCounter(el, target, duration = 800) {
  if (!el) return;
  const start = performance.now();
  const update = now => {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
    if (p < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function updateStats() {
  const total = capsulesData.length;
  const active = capsulesData.filter(c => c.status === "active").length;
  const retired = capsulesData.filter(c => c.status === "retired").length;
  const destroyed = capsulesData.filter(c => c.status === "destroyed").length;
  const discarded = capsulesData.filter(c => c.status === "discarded").length;
  const orbit = capsulesData.filter(c => c.status === "orbit").length;
  const totalMissions = capsulesData.reduce((s, c) => s + c.flights, 0);

  animateCounter(totalBoostersEl, total);
  animateCounter(activeBoostersEl, active);
  animateCounter(noActiveBoostersEl, total - active);
  animateCounter(totalFlightsEl, totalMissions);
  animateCounter(document.getElementById("retired-boosters"), retired);
  animateCounter(document.getElementById("destroyed-boosters"), destroyed);
  animateCounter(document.getElementById("discarded-boosters"), discarded);
  animateCounter(document.getElementById("orbit-capsules"), orbit);
}

// --------------------- INIT ---------------------
document.addEventListener("DOMContentLoaded", async () => {
  boostersGrid.innerHTML = '<div class="loading">Cargando cápsulas desde Firebase...</div>';
  await loadCapsulesData();
  filteredCapsules = [...capsulesData];
  if (capsulesData.length > 0) {
    updateStats();
    renderCapsules();
    setupEventListeners();
    hideLoader();

    const idParam = getQueryParam("id");
    if (idParam) {
      const capsule = capsulesData.find(c => c.id === idParam);
      if (capsule) openModal(capsule);
    }
  } else {
    hideLoader();
  }
});

loadConfig();
