import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// --------------------- CONFIG ---------------------
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

let boostersData = [];
let currentFilter = "all";
let filteredBoosters = [];

// --------------------- DOM ---------------------
const boostersGrid = document.getElementById("boosters-grid");
const filterButtons = document.querySelectorAll(".filter-btn");
const modal = document.getElementById("booster-modal");
const modalBody = document.getElementById("modal-body");
const modalClose = document.querySelector(".modal-close");

// Estadísticas
const totalBoostersEl = document.getElementById("total-boosters");
const activeBoostersEl = document.getElementById("active-boosters");
const noActiveBoostersEl = document.getElementById("no-active");
const lastUpdateEl = document.getElementById("last-update");
const totalFlightsEl = document.getElementById("total-flights");

// --------------------- UTILIDADES ---------------------
function isFlexibleDate(dateString) {
    return dateString.includes("NET") || dateString.length < 10;
}

function formatDate(dateString) {
    if (isFlexibleDate(dateString)) return dateString;
    const [year, month, day] = dateString.split("-");
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function sortMissionsByDate(missions) {
    return missions.sort((a, b) => {
        if (isFlexibleDate(a.date) && isFlexibleDate(b.date)) return a.date.localeCompare(b.date);
        if (isFlexibleDate(a.date)) return 1;
        if (isFlexibleDate(b.date)) return -1;
        return new Date(a.date) - new Date(b.date);
    });
}

// Normaliza cualquier variante de estado (inglés/español, mayúsculas) a una clave canónica.
function normalizeStatus(estado) {
    const map = {
        active: "active", activo: "active",
        retired: "retired", retirado: "retired",
        destroyed: "destroyed", destruido: "destroyed",
        discarded: "discarded", desechado: "discarded",
        testing: "testing", "en pruebas": "testing",
        development: "development", desarrollo: "development", "en desarrollo": "development",
        unknown: "unknown", desconocido: "unknown",
    };
    const key = String(estado ?? "").toLowerCase().trim();
    return map[key] || key;
}

function traducirEstado(estado) {
    const estados = {
        active: "Activo",
        retired: "Retirado",
        destroyed: "Destruido",
        discarded: "Desechado",
        testing: "En Pruebas",
        development: "En Desarrollo",
        unknown: "Desconocido",
    };
    return estados[normalizeStatus(estado)] || estado;
}

// Escapa texto libre antes de inyectarlo con innerHTML (evita XSS almacenado).
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

function getLandingClass(landing) {
    if (!landing || landing === null) return "landing-expendable";
    if (landing === "Desechado") return "landing-expendable";
    if (landing.includes("ASOG")) return "landing-asog";
    if (landing.includes("JRTI")) return "landing-jrti";
    if (landing.includes("OCISLY")) return "landing-ocisly";
    if (landing.includes("LZ-")) return "landing-lz";
    return "";
}

function getLaunchPadClass(launchPad) {
    if (!launchPad || launchPad === null) return "";
    if (launchPad.includes("SLC-40")) return "launchpad-cape";
    if (launchPad.includes("LC-39A")) return "launchpad-ksc";
    if (launchPad.includes("SLC-4E")) return "launchpad-vnb";
    return "";
}

function getMissionRowId(mission) {
    if (mission.success === true) return "mission-success";
    if (mission.success === false) return "mission-failure";
    return "mission-unknown";
}


function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

async function getBoosterImageURL(path) {
    try {
        // Si no hay path, usar placeholder
        if (!path) return "placeholder.png";

        // Detectar si es una URL completa (http/https)
        // También aceptamos urls ya generadas de Firebase Storage (firebasestorage.googleapis.com)
        const isHttpUrl = /^https?:\/\//i.test(path);
        const isFirebaseFullUrl = /firebasestorage\.googleapis\.com/i.test(path);

        if (isHttpUrl || isFirebaseFullUrl) {
            return path;
        }

        // Si no es URL completa, asumimos que es un path en Firebase Storage
        return await getDownloadURL(ref(storage, path));
    } catch (error) {
        console.warn("No se pudo cargar la imagen:", path, error);
        return "placeholder.png";
    }
}

// --------------------- CARGA DE DATOS ---------------------
async function loadConfig() {
    const configDoc = await getDoc(doc(db, "data", "config"));
    if (configDoc.exists()) {
        const data = configDoc.data();
        lastUpdateEl.textContent = `${data.updateDate} • ${data.updateTime} UTC`;
    } else {
        lastUpdateEl.textContent = "Desconocido";
    }
}

async function loadBoostersData() {
    try {
        const boostersCollection = collection(db, "boosters");
        const boostersSnapshot = await getDocs(boostersCollection);

        // Crear un array de promesas para todas las tarjetas
        const boostersPromises = boostersSnapshot.docs
            .filter(docSnap => docSnap.id !== "metadata")
            .map(async docSnap => {
                const data = docSnap.data();
                const imageURL = await getBoosterImageURL(data.image || "placeholder.png");
                const descr = data.desc;
                return {
                    id: docSnap.id,
                    name: data.name,
                    block: data.block,
                    status: data.status,
                    type: data.type,
                    desc: descr,
                    image: imageURL,
                    missions: data.missions || [],
                };
            });

        boostersData = await Promise.all(boostersPromises);

        // Ordenar por número de booster descendente
        boostersData.sort((a, b) => parseInt(b.name.replace("B", "")) - parseInt(a.name.replace("B", "")));

        // Procesar misiones
        boostersData = boostersData.map(booster => {
            let flights = 0, firstFlight = null, lastFlight = null, averageDaysBetweenFlights = "N/A";
            if (booster.missions.length > 0) {
                const sortedMissions = sortMissionsByDate(booster.missions);
                const completedMissions = sortedMissions.filter(m => !m.programado);
                flights = completedMissions.length;
                if (flights > 0) {
                    firstFlight = completedMissions[0].date;
                    lastFlight = completedMissions[completedMissions.length - 1].date;
                }
                const dates = completedMissions.map(m => new Date(m.date).getTime());
                if (dates.length >= 2) {
                    let totalDays = 0;
                    for (let i = 1; i < dates.length; i++) {
                        totalDays += Math.ceil((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
                    }
                    averageDaysBetweenFlights = Math.round(totalDays / (dates.length - 1)) + " días";
                }
            }
            return { ...booster, flights, firstFlight, lastFlight, averageDaysBetweenFlights };
        });

        filteredBoosters = [...boostersData];
        console.log("[v5] Datos cargados desde Firebase:", boostersData.length, "propulsores");

    } catch (error) {
        console.error("[v5] Error cargando datos desde Firebase:", error);
        boostersGrid.innerHTML = '<div class="loading" style="color: #ef4444;">Error cargando datos de Firebase.</div>';
    }
}

// --------------------- FILTROS Y BÚSQUEDA ---------------------
function setActiveFilter(filter) {
    filterButtons.forEach(btn => btn.classList.remove("active"));
    document.querySelector(`[data-filter="${filter}"]`)?.classList.add("active");
    currentFilter = filter;
}

function boostersForFilter(filter) {
    if (filter === "all") return [...boostersData];
    if (filter === "scheduled") return boostersData.filter(hasScheduledFlight);
    if (filter === "testing") return boostersData.filter(b => ["testing", "development"].includes(normalizeStatus(b.status)));
    return boostersData.filter(b => normalizeStatus(b.status) === filter);
}

function filterBoosters(filter) {
    filteredBoosters = boostersForFilter(filter);
    renderBoosters();
}

function hasScheduledFlight(booster) {
    return booster.missions.some(m => m.programado);
}

function hasInFlight(booster) {
    return booster.missions.some(m => m.inFlight);
}

// --------------------- RENDER ---------------------
function createBoosterCard(booster) {
    const card = document.createElement("div");
    card.className = "booster-card";
    if (hasScheduledFlight(booster)) card.classList.add("has-scheduled-flight");
    card.addEventListener("click", () => openModal(booster));

    const statusClass = `status-${booster.status.toLowerCase().replace(" ", "-")}`;
    const statusText = traducirEstado(booster.status);

    const typeClass = `type-${booster.type}`;
    const typeText = booster.type === "F9" ? "Falcon 9" : booster.type?.includes("FH") ? "Falcon Heavy" : "N/A";

    const lastFlightText = booster.lastFlight ? `Último vuelo: ${formatDate(booster.lastFlight)}` : "Sin vuelos realizados";

    card.innerHTML = `
        ${typeof booster.block === "string" ? `<span class="block">Block ${booster.block || "N/A"}</span>` : ""}
        <div class="booster-image">
            <img src="${booster.image}" alt="${escapeHtml(booster.name)}" loading="lazy"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="altImage">${escapeHtml(booster.name)}</div>
        </div>
        <div class="booster-content">
            <h3 class="booster-name">${escapeHtml(booster.name)}</h3>
            <span class="booster-type ${typeClass}">${typeText}</span>
            <span class="booster-status ${statusClass}">${statusText}</span>
            <p class="booster-flights">Vuelos realizados: ${booster.flights}</p>
            <p class="booster-first-flight">${lastFlightText}</p>
        </div>
    `;
    return card;
}

function renderBoosters() {
    boostersGrid.innerHTML = "";
    if (filteredBoosters.length === 0) {
        boostersGrid.innerHTML = '<div class="loading">No se encontraron propulsores para este filtro.</div>';
        return;
    }
    filteredBoosters.forEach(b => boostersGrid.appendChild(createBoosterCard(b)));
}

function getBoosterType(type) {
    if (!type) return "N/A";
  
    const map = {
      FH: "Falcon Heavy",
      FHC: "Falcon Heavy Center",
      FHS: "Falcon Heavy Side",
      F9: "Falcon 9",
    };
  
    const upper = type.toUpperCase();
  
    // Ordenar las claves de más largas a más cortas
    const key = Object.keys(map)
      .sort((a, b) => b.length - a.length)
      .find(k => upper === k || upper.startsWith(k));
  
    return key ? map[key] : "Desconocido";
  }  
  

// --------------------- MODAL ---------------------
function openModal(booster) {
    const statusClass = `status-${booster.status.toLowerCase().replace(" ", "-")}`;
    const statusText = traducirEstado(booster.status);

    const typeClass = `type-${booster.type}`;
    const typeText = getBoosterType(booster.type);

    let flightHistoryHTML = "";
    let flightsForSort = [];
    if (booster.missions.length > 0) {
        // Numeración cronológica (vuelo #1 = el más antiguo). El orden de la tabla se
        // controla pinchando las cabeceras; por defecto, del más reciente al más antiguo.
        flightsForSort = booster.missions.map((m, i) => ({ ...m, num: i + 1 }));

        flightHistoryHTML = `
        <div class="flight-history">
            <h3>Historial de Vuelos</h3>
            <table class="flight-details-table">
                <thead>
                    <tr>
                        <th class="sortable" data-sort="num" title="Ordenar por nº de vuelo">Vuelo #<span class="sort-ind"></span></th>
                        <th>Misión</th>
                        <th class="sortable" data-sort="date" title="Ordenar por fecha">Fecha<span class="sort-ind"></span></th>
                        <th class="sortable" data-sort="launchPad" title="Ordenar por plataforma">Plataforma<span class="sort-ind"></span></th>
                        <th class="sortable" data-sort="landing" title="Ordenar por aterrizaje">Aterrizaje<span class="sort-ind"></span></th>
                    </tr>
                </thead>
                <tbody id="flight-tbody"></tbody>
            </table>
        </div>`;
    } else {
        flightHistoryHTML = `<div class="flight-history"><h3>Historial de Vuelos</h3><p style="color: var(--muted-foreground); text-align: center; padding: 2rem;">Este propulsor aún no ha realizado vuelos.</p></div>`;
    }
    let descripcion;
    if(booster.desc) {
        descripcion = `<div class="booster-description"><span>Descripción:</span> ${escapeHtml(booster.desc)}</div>`
    } else {
        descripcion = ``
    }

    modalBody.innerHTML = `
        <div class="modal-header">
            <img src="${booster.image}" alt="${escapeHtml(booster.name)}" class="modal-image" loading="lazy"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <h2 class="modal-title">${escapeHtml(booster.name)}</h2>
            ${hasScheduledFlight(booster)?'<span class="scheduled-badge">VUELO PROGRAMADO</span>':""}
            ${hasInFlight(booster)?'<span class="scheduled-badge">EN VUELO</span>':""}
            <span class="booster-type ${typeClass}">${typeText}</span>
            <span class="booster-status ${statusClass}">${statusText}</span>
        </div>
        ${descripcion}
        <div class="booster-dates">
            <div class="booster-date"><div style="color: var(--muted-foreground);">Primer Vuelo</div><h3>${booster.firstFlight?formatDate(booster.firstFlight):"N/A"}</h3></div>
            <div class="booster-date"><div style="color: var(--muted-foreground);">Vuelos Totales</div><h3>${booster.flights}</h3></div>
            ${booster.missions.length>=2?`<div class="booster-date"><div style="color: var(--muted-foreground);">Entre vuelos</div><h3>${booster.averageDaysBetweenFlights}</h3></div>`:""}
            <div class="booster-date"><div style="color: var(--muted-foreground);">Último Vuelo</div><h3>${booster.lastFlight?formatDate(booster.lastFlight):"N/A"}</h3></div>
        </div>
        ${flightHistoryHTML}
    `;

    // Ordenación del historial de vuelos pinchando las cabeceras de columna
    const flightTbody = modalBody.querySelector("#flight-tbody");
    if (flightTbody) {
        let sortKey = "num";
        let sortDir = "desc"; // por defecto: más reciente primero
        const comparators = {
            num: (a, b) => a.num - b.num,
            date: (a, b) => String(a.date).localeCompare(String(b.date)),
            launchPad: (a, b) => String(a.launchPad || "").localeCompare(String(b.launchPad || "")),
            landing: (a, b) => String(a.landing || "Desechado").localeCompare(String(b.landing || "Desechado")),
        };
        const rowHtml = (m) => `
            <tr class="flight-row ${getMissionRowId(m)}${m.programado ? " scheduled-flight" : ""}">
                <td><strong>${m.num}</strong></td>
                <td>${escapeHtml(m.name)}</td>
                <td>${formatDate(m.date)}</td>
                <td><span class="launch-platform ${getLaunchPadClass(m.launchPad)}">${m.launchPad || ""}</span></td>
                <td><span class="landing-platform ${getLandingClass(m.landing)}">${m.landing || "Desechado"}</span></td>
            </tr>`;
        const renderRows = () => {
            const sorted = [...flightsForSort].sort((a, b) => {
                const r = comparators[sortKey](a, b);
                return sortDir === "asc" ? r : -r;
            });
            flightTbody.innerHTML = sorted.map(rowHtml).join("");
            modalBody.querySelectorAll(".flight-details-table th.sortable").forEach(th => {
                const ind = th.querySelector(".sort-ind");
                if (th.dataset.sort === sortKey) {
                    th.classList.add("sorted");
                    ind.textContent = sortDir === "asc" ? " ▲" : " ▼";
                } else {
                    th.classList.remove("sorted");
                    ind.textContent = "";
                }
            });
        };
        modalBody.querySelectorAll(".flight-details-table th.sortable").forEach(th => {
            th.addEventListener("click", () => {
                const key = th.dataset.sort;
                if (sortKey === key) {
                    sortDir = sortDir === "asc" ? "desc" : "asc";
                } else {
                    sortKey = key;
                    sortDir = (key === "num" || key === "date") ? "desc" : "asc";
                }
                renderRows();
            });
        });
        renderRows();
    }

    modal.style.display = "block";
    document.body.classList.add("modal-open");

    const url = new URL(window.location);
    url.searchParams.set("booster", booster.name);
    window.history.pushState({}, "", url);
}

function closeModal() {
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
    const url = new URL(window.location);
    url.searchParams.delete("booster");
    window.history.pushState({}, "", url);
}

// --------------------- EVENT LISTENERS ---------------------
function setupEventListeners() {
    filterButtons.forEach(btn => {
        btn.addEventListener("click", function() {
            const filter = this.dataset.filter;
            setActiveFilter(filter);
            filterBoosters(filter);
        });
    });

    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.toLowerCase().trim();
        const base = boostersForFilter(currentFilter);
        filteredBoosters = query ? base.filter(b => b.name.toLowerCase().includes(query)) : base;
        renderBoosters();
    });

    modalClose.addEventListener("click", closeModal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

// --------------------- ESTADÍSTICAS ---------------------
function animateCounter(el, target, duration = 800) {
    const start = performance.now();
    const update = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

function updateStats() {
    const totalBoosters = boostersData.length;
    const activeBoosters = boostersData.filter(b => normalizeStatus(b.status) === "active").length;
    const noActiveBoosters = totalBoosters - activeBoosters;
    let totalFlights = 0;
    boostersData.forEach(b => totalFlights += b.flights);
    const retired = boostersData.filter(b => normalizeStatus(b.status) === "retired").length;
    const destroyed = boostersData.filter(b => normalizeStatus(b.status) === "destroyed").length;
    const discarded = boostersData.filter(b => normalizeStatus(b.status) === "discarded").length;
    const testing = boostersData.filter(b => ["testing", "development"].includes(normalizeStatus(b.status))).length;

    animateCounter(totalBoostersEl, totalBoosters);
    animateCounter(activeBoostersEl, activeBoosters);
    animateCounter(noActiveBoostersEl, noActiveBoosters);
    animateCounter(totalFlightsEl, totalFlights);
    animateCounter(document.getElementById("retired-boosters"), retired);
    animateCounter(document.getElementById("destroyed-boosters"), destroyed);
    animateCounter(document.getElementById("discarded-boosters"), discarded);
    animateCounter(document.getElementById("testing-boosters"), testing);
}

// --------------------- INICIALIZACIÓN ---------------------
document.addEventListener("DOMContentLoaded", async () => {
    boostersGrid.innerHTML = '<div class="loading">Cargando propulsores desde Firebase...</div>';
    await loadBoostersData();
    if (boostersData.length > 0) {
        updateStats();
        renderBoosters();
        setupEventListeners();
        hideLoader();

        const boosterParam = getQueryParam("booster");
        if (boosterParam) {
            const booster = boostersData.find(b => b.name === boosterParam);
            if (booster) openModal(booster);
        }
    }
});

loadConfig();
