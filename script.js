import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"

const firebaseConfig = {
  apiKey: "AIzaSyAU8I3PbYOrd-qCSGNX3nyF6WWg0oIhAS8",
  authDomain: "spacexboosters.firebaseapp.com",
  projectId: "spacexboosters",
  storageBucket: "spacexboosters.firebasestorage.app",
  messagingSenderId: "347004633729",
  appId: "1:347004633729:web:2953672e258f6a67814380",
  measurementId: "G-P27248GMWL",
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

let boostersData = []
let currentFilter = "all"
let filteredBoosters = []

// Elementos del DOM
const boostersGrid = document.getElementById("boosters-grid")
const filterButtons = document.querySelectorAll(".filter-btn")
const modal = document.getElementById("booster-modal")
const modalBody = document.getElementById("modal-body")
const modalClose = document.querySelector(".modal-close")

// Estadísticas
const totalBoostersEl = document.getElementById("total-boosters")
const activeBoostersEl = document.getElementById("active-boosters")
const noActiveBoostersEl = document.getElementById("no-active")
const lastUpdateEl = document.getElementById("last-update")
const totalFlightsEl = document.getElementById("total-flights")

function isFlexibleDate(dateString) {
  return dateString.includes("NET") || dateString.length < 10
}

function formatDate(dateString) {
  // Si es una fecha flexible (NET, solo año, etc.), mostrarla tal como está
  if (isFlexibleDate(dateString)) {
    return dateString
  }

  // Crear fecha sin conversión de zona horaria para fechas normales
  const [year, month, day] = dateString.split("-")
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function sortMissionsByDate(missions) {
  return missions.sort((a, b) => {
    // Si ambas son fechas flexibles, ordenar alfabéticamente
    if (isFlexibleDate(a.date) && isFlexibleDate(b.date)) {
      return a.date.localeCompare(b.date)
    }

    // Si solo una es flexible, ponerla al final
    if (isFlexibleDate(a.date)) return 1
    if (isFlexibleDate(b.date)) return -1

    // Si ambas son fechas normales, ordenar por fecha
    return new Date(a.date) - new Date(b.date)
  })
}

async function loadConfig() {
  const configDoc = await getDoc(doc(db, "data", "config"));
  if(configDoc.exists()) {
    const data = configDoc.data();
    document.getElementById("last-update").textContent = `${data.updateDate} • ${data.updateTime} UTC`;
  } else {
    document.getElementById("last-update").textContent = "Desconocido";
  }
}

async function loadBoostersData() {
  try {
    const boostersCollection = collection(db, "boosters")
    const boostersSnapshot = await getDocs(boostersCollection)

    boostersData = []

    boostersSnapshot.forEach((doc) => {
      if (doc.id === "metadata") return

      const data = doc.data()
      boostersData.push({
        id: doc.id,
        name: data.name,
        status: data.status,
        type: data.type,
        image: data.image,
        missions: data.missions || [],
      })
    })

    // Ordenar por número de booster
    boostersData.sort((a, b) => {
      const numA = Number.parseInt(a.name.replace("B", ""))
      const numB = Number.parseInt(b.name.replace("B", ""))
      return numB - numA
    })

    // Procesar misiones y calcular vuelos
    boostersData = boostersData.map((booster) => {
      if (booster.missions && booster.missions.length > 0) {
        const sortedMissions = sortMissionsByDate(booster.missions)
        const completedFlights = booster.missions.filter((mission) => !mission.programado).length

        const completedMissions = sortedMissions.filter((mission) => !mission.programado)

        return {
          ...booster,
          flights: completedFlights,
          firstFlight: completedMissions.length > 0 ? completedMissions[0].date : null,
          lastFlight: completedMissions.length > 0 ? completedMissions[completedMissions.length - 1].date : null,
        }
      }
      return {
        ...booster,
        flights: 0,
      }
    })

    filteredBoosters = [...boostersData]
    console.log("[v0] Datos cargados desde Firebase:", boostersData.length, "propulsores")
  } catch (error) {
    console.error("[v0] Error cargando datos desde Firebase:", error)
    boostersGrid.innerHTML =
      '<div class="loading" style="color: #ef4444;">Error cargando datos de Firebase. Verifica la configuración.</div>'
  }
}

function hideLoader() {
  const loader = document.getElementById("loader")
  if (loader) {
    loader.classList.add("fade-out")
    setTimeout(() => loader.remove(), 600)
  }
}

function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get(param)
}

document.addEventListener("DOMContentLoaded", async () => {
  // Mostrar loading mientras se cargan los datos
  boostersGrid.innerHTML = '<div class="loading">Cargando propulsores desde Firebase...</div>'

  await loadBoostersData()

  if (boostersData.length > 0) {
    updateStats()
    renderBoosters()
    setupEventListeners()
    hideLoader()

    const boosterParam = getQueryParam("booster")
    if (boosterParam) {
      const booster = boostersData.find((b) => b.name === boosterParam)
      if (booster) openModal(booster)
    }
  }
})

// Configurar event listeners
function setupEventListeners() {
  // Filtros
  filterButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const filter = this.dataset.filter
      setActiveFilter(filter)
      filterBoosters(filter)
    })
  })

  const searchInput = document.getElementById("search-input")
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase()
    const boosters = document.querySelectorAll(".booster-card")

    boosters.forEach((booster) => {
      const name = booster.querySelector(".booster-name").textContent.toLowerCase()
      booster.style.display = name.includes(query) ? "block" : "none"
    })
  })

  // Modal
  modalClose.addEventListener("click", closeModal)
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal()
    }
  })

  // Escape key para cerrar modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal()
    }
  })
}

// Actualizar estadísticas
function updateStats() {
  const totalBoosters = boostersData.length
  const activeBoosters = boostersData.filter((b) => b.status === "active").length
  const noActiveBoosters = totalBoosters - activeBoosters
  const retired = boostersData.filter((b) => b.status === "retired").length
  const destroyed = boostersData.filter((b) => b.status === "destroyed").length
  const discarded = boostersData.filter((b) => b.status === "discarded"|| b.status === "Desechado").length
  const testing = boostersData.filter((b) => b.status === "testing" || b.status === "En desarrollo").length
  let totalFlights = 0

  boostersData.forEach((booster) => {
    totalFlights += booster.flights
  })

  totalBoostersEl.textContent = totalBoosters
  activeBoostersEl.textContent = activeBoosters
  noActiveBoostersEl.textContent = noActiveBoosters

  document.getElementById("retired-boosters").textContent = retired
  document.getElementById("destroyed-boosters").textContent = destroyed
  document.getElementById("discarded-boosters").textContent = discarded
  document.getElementById("testing-boosters").textContent = testing
  totalFlightsEl.textContent = totalFlights
}

// Establecer filtro activo
function setActiveFilter(filter) {
  filterButtons.forEach((btn) => btn.classList.remove("active"))
  document.querySelector(`[data-filter="${filter}"]`).classList.add("active")
  currentFilter = filter
}

// Filtrar propulsores
function filterBoosters(filter) {
  if (filter === "all") {
    filteredBoosters = [...boostersData]
  } else {
    filteredBoosters = boostersData.filter((booster) => booster.status === filter)
  }
  renderBoosters()
}

// Renderizar propulsores
function renderBoosters() {
  boostersGrid.innerHTML = ""

  if (filteredBoosters.length === 0) {
    boostersGrid.innerHTML = '<div class="loading">No se encontraron propulsores para este filtro.</div>'
    return
  }

  filteredBoosters.forEach((booster) => {
    const boosterCard = createBoosterCard(booster)
    boostersGrid.appendChild(boosterCard)
  })
}

function hasScheduledFlight(booster) {
  return booster.missions.some((mission) => mission.programado === true)
}

// Crear tarjeta de propulsor
function createBoosterCard(booster) {
  const card = document.createElement("div")
  card.className = "booster-card"
  card.addEventListener("click", () => openModal(booster))

  const statusClass = `status-${booster.status.toLowerCase().replace(" ", "-")}`
  const statusText = traducirEstado(booster.status)

  const typeClass = `type-${booster.type}`
  const typeText = booster.type === "F9" ? "Falcon 9" : booster.type?.includes("FH") ? "Falcon Heavy" : "N/A"

  const lastFlightText = booster.lastFlight
    ? `Último vuelo: ${formatDate(booster.lastFlight)}`
    : "Sin vuelos realizados"

  const scheduledIndicator = hasScheduledFlight(booster)
    ? '<div class="scheduled-indicator">📅 Próximo vuelo programado</div>'
    : ""

  card.innerHTML = `
        <div class="booster-image">
            <img src="${booster.image}" alt="${booster.name}" 
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background: linear-gradient(45deg, #f0f0f0, #e0e0e0); color: #6b7280;">
                ${booster.name}
            </div>
        </div>
        <div class="booster-content">
            <h3 class="booster-name">${booster.name}</h3>
            <span class="booster-status ${statusClass}">${statusText}</span>
            <span class="booster-type ${typeClass}">${typeText}</span>
            ${scheduledIndicator}
            <p class="booster-flights">Vuelos realizados: ${booster.flights}</p>
            <p class="booster-first-flight">${lastFlightText}</p>
        </div>
    `

  return card
}

function getLandingClass(landing) {
  if (!landing || landing === null) return "landing-expendable"
  if (landing === "Desechado") return "landing-expendable"
  if (landing.includes("ASOG")) return "landing-asog"
  if (landing.includes("JRTI")) return "landing-jrti"
  if (landing.includes("OCISLY")) return "landing-ocisly"
  if (landing.includes("LZ-")) return "landing-lz"
  return ""
}

function getLaunchPadClass(launchPad) {
  if (!launchPad || launchPad === null) return ""
  if (launchPad.includes("SLC-40")) return "launchpad-cape"
  if (launchPad.includes("LC-39A")) return "launchpad-ksc"
  if (launchPad.includes("SLC-4E")) return "launchpad-vnb"
  return ""
}

function getMissionRowId(mission) {
  if (mission.success === true) return "mission-success"
  if (mission.success === false) return "mission-failure"
  return "mission-unknown"
}

function traducirEstado(estado) {
  const estados = {
    "active": "Activo",
    "retired": "Retirado",
    "destroyed": "Destruido",
    "testing": "En Pruebas",
    "unknown": "Desconocido"
  }

  // Convertimos a minúsculas para evitar problemas con mayúsculas
  return estados[estado.toLowerCase()] || estado;
}


// Abrir modal
function openModal(booster) {
  const statusClass = `status-${booster.status.toLowerCase().replace(" ", "-")}`
  const statusText = traducirEstado(booster.status)

  const typeClass = `type-${booster.type}`
  let typeText
  if (booster.type === "F9") typeText = "Falcon 9"
  else if (booster.type?.includes("FH")) typeText = "Falcon Heavy"
  else if (booster.type === "FHc") typeText = "Falcon Heavy Center Core"
  else if (booster.type === "FHs") typeText = "Falcon Heavy Side Core"
  else typeText = "N/A"

  let flightHistoryHTML = ""
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
                            <th>Aterrizaje</th>
                            <th>Plataforma</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${booster.missions
                          .map(
                            (mission, index) => `
                            <tr ${mission.programado ? 'class="scheduled-flight"' : ""} id="${getMissionRowId(mission)}">
                                <td><strong>${index + 1}</strong></td>
                                <td>
                                    ${mission.name}
                                    ${mission.programado ? '<span class="scheduled-badge">PROGRAMADO</span>' : ""}
                                </td>
                                <td>${formatDate(mission.date)}</td>
                                <td>
                                    <span class="landing-platform ${getLandingClass(mission.landing)}">
                                        ${mission.landing || "Desechado"}
                                    </span>
                                </td>
                                <td>
                                    <span class="launch-platform ${getLaunchPadClass(mission.launchPad)}">
                                        ${mission.launchPad}
                                    </span>
                                </td>
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        `
  } else {
    flightHistoryHTML = `
            <div class="flight-history">
                <h3>Historial de Vuelos</h3>
                <p style="color: var(--muted-foreground); text-align: center; padding: 2rem;">
                    Este propulsor aún no ha realizado vuelos.
                </p>
            </div>
        `
  }

  modalBody.innerHTML = `
        <div class="modal-header">
            <img src="${booster.image}" alt="${booster.name}" class="modal-image"
                 onerror="this.style.display='none';">
            <h2 class="modal-title">${booster.name}</h2>
            <span class="booster-status ${statusClass}">${statusText}</span>
            <span class="booster-type ${typeClass}">${typeText}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <div style="text-align: center; padding: 1rem; background: var(--muted); border-radius: var(--radius);">
                <div style="font-size: 2rem; font-weight: bold; color: var(--accent);">${booster.flights}</div>
                <div style="color: var(--muted-foreground);">Vuelos Totales</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: var(--muted); border-radius: var(--radius);">
                <div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">
                    ${booster.firstFlight ? formatDate(booster.firstFlight) : "N/A"}
                </div>
                <div style="color: var(--muted-foreground);">Primer Vuelo</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: var(--muted); border-radius: var(--radius);">
                <div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">
                    ${booster.lastFlight ? formatDate(booster.lastFlight) : "N/A"}
                </div>
                <div style="color: var(--muted-foreground);">Último Vuelo</div>
            </div>
        </div>

        ${flightHistoryHTML}
    `

  modal.style.display = "block"
  document.body.classList.add("modal-open")

  const url = new URL(window.location)
  url.searchParams.set("booster", booster.name)
  window.history.pushState({}, "", url)
}

// Cerrar modal
function closeModal() {
  modal.style.display = "none"
  document.body.classList.remove("modal-open")

  const url = new URL(window.location)
  url.searchParams.delete("booster")
  window.history.pushState({}, "", url)
}

loadConfig()