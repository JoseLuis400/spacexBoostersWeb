import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
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

const app = initializeApp(firebaseConfig);
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

function traducirEstado(estado) {
    const estados = {
        active: "Activo",
        retired: "Retirado",
        destroyed: "Destruido",
        testing: "En Pruebas",
        unknown: "Desconocido",
        discarded: "Desechado",
    };
    return estados[estado.toLowerCase()] || estado;
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

function filterBoosters(filter) {
    if (filter === "all") filteredBoosters = [...boostersData];
    else if (filter === "discarded") filteredBoosters = boostersData.filter(b => b.status === "discarded" || b.status === "Desechado");
    else if (filter === "scheduled") filteredBoosters = boostersData.filter(hasScheduledFlight);
    else filteredBoosters = boostersData.filter(b => b.status === filter);
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
            <img src="${booster.image}" alt="${booster.name}" loading="lazy" 
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="altImage">${booster.name}</div>
        </div>
        <div class="booster-content">
            <h3 class="booster-name">${booster.name}</h3>
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
    if (booster.missions.length > 0) {
        flightHistoryHTML = `
        <div class="flight-history">
            <h3>Historial de Vuelos</h3>
            <table class="flight-details-table">
                <thead>
                    <tr>
                        <th>Vuelo #</th>
                        <th>Misión</th>
                        <th>Fecha</th>
                        <th>Plataforma</th>
                        <th>Aterrizaje</th>
                    </tr>
                </thead>
                <tbody>
                    ${booster.missions.map((m,i) => `
                        <tr ${m.programado?'class="scheduled-flight"':""} id="${getMissionRowId(m)}">
                            <td><strong>${i+1}</strong></td>
                            <td>${m.name}</td>
                            <td>${formatDate(m.date)}</td>
                            <td><span class="launch-platform ${getLaunchPadClass(m.launchPad)}">${m.launchPad || ""}</span></td>
                            <td><span class="landing-platform ${getLandingClass(m.landing)}">${m.landing || "Desechado"}</span></td>
                        </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
    } else {
        flightHistoryHTML = `<div class="flight-history"><h3>Historial de Vuelos</h3><p style="color: var(--muted-foreground); text-align: center; padding: 2rem;">Este propulsor aún no ha realizado vuelos.</p></div>`;
    }
    let descripcion;
    if(booster.desc) {
        descripcion = `<div class="booster-description"><span>Descripción:</span> ${booster.desc}</div>`
    } else {
        descripcion = ``
    }

    modalBody.innerHTML = `
        <div class="modal-header">
            <img src="${booster.image}" alt="${booster.name}" class="modal-image" loading="lazy" 
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <h2 class="modal-title">${booster.name}</h2>
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
        const query = searchInput.value.toLowerCase();
        document.querySelectorAll(".booster-card").forEach(card => {
            const name = card.querySelector(".booster-name").textContent.toLowerCase();
            card.style.display = name.includes(query) ? "block" : "none";
        });
    });

    modalClose.addEventListener("click", closeModal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

// --------------------- ESTADÍSTICAS ---------------------
function updateStats() {
    const totalBoosters = boostersData.length;
    const activeBoosters = boostersData.filter(b => b.status === "active").length;
    const noActiveBoosters = totalBoosters - activeBoosters;
    let totalFlights = 0;
    boostersData.forEach(b => totalFlights += b.flights);

    totalBoostersEl.textContent = totalBoosters;
    activeBoostersEl.textContent = activeBoosters;
    noActiveBoostersEl.textContent = noActiveBoosters;
    totalFlightsEl.textContent = totalFlights;
    const retired = boostersData.filter((b) => b.status === "retired" || b.status === "Retirado").length
	const destroyed = boostersData.filter((b) => b.status === "destroyed" || b.status === "Destruido").length
	const discarded = boostersData.filter((b) => b.status === "discarded" || b.status === "Desechado").length
	const testing = boostersData.filter((b) => b.status === "testing" || b.status === "En pruebas" || b.status === "Desarrollo").length

	totalBoostersEl.textContent = totalBoosters
	activeBoostersEl.textContent = activeBoosters
	noActiveBoostersEl.textContent = noActiveBoosters

	document.getElementById("retired-boosters").textContent = retired
	document.getElementById("destroyed-boosters").textContent = destroyed
	document.getElementById("discarded-boosters").textContent = discarded
	document.getElementById("testing-boosters").textContent = testing
	totalFlightsEl.textContent = totalFlights
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
