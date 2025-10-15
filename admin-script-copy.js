import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"

import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"; // <- Importar Auth

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
let editingBoosterId = null
let editingMissionIndex = null
let currentBoosterId = null

async function loadData() {
  try {
    const boostersCollection = collection(db, "boosters")
    const boostersSnapshot = await getDocs(boostersCollection)

    boostersData = []

    boostersSnapshot.forEach((doc) => {
      const data = doc.data()
      boostersData.push({
        id: doc.id,
        name: data.name,
        block: data.block,
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

    renderBoosters()
  } catch (error) {
    console.error("Error cargando datos desde Firebase:", error)
    alert("Error al cargar los datos desde Firebase")
  }
}

function getCurrentUTC() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");

  return {
    updateDate: `${day}/${month}/${year}`,
    updateTime: `${hours}:${minutes}`
  };
}

// Función para actualizar Firebase con la fecha/hora actual

const auth = getAuth(app); // <- Crear instancia de Auth
async function updateConfigUTC() {
  try {
    const configRef = doc(db, "data", "config");
    const currentUTC = getCurrentUTC();

    // Obtener el usuario actual
    const user = auth.currentUser;
    let updatedBy = "Desconocido";

    if (user) {
      // Obtener nombre desde Firestore
      const usersDoc = await getDoc(doc(db, "data", "users"));
      if (usersDoc.exists()) {
        const usersData = usersDoc.data();
        const userData = usersData[user.uid];
        if (userData && userData.name) {
          updatedBy = userData.name;
        }
      }
    }

    // Actualizar fecha, hora y nombre del usuario
    await updateDoc(configRef, {
      updateDate: currentUTC.updateDate,
      updateTime: currentUTC.updateTime,
      updatedBy: updatedBy
    });

    // Mostrar info actualizada en la página
    document.getElementById("last-update").textContent = `${currentUTC.updateDate} • ${currentUTC.updateTime} UTC (por ${updatedBy})`;
    console.log("Fecha, hora y usuario actualizados en Firebase");
  } catch (error) {
    console.error("Error al actualizar la config:", error);
    document.getElementById("last-update").textContent = "Error al actualizar";
  }
}

document.getElementById("btn-actualizar").addEventListener("click", updateConfigUTC);


async function loadConfig() {
  try {
    const configDoc = await getDoc(doc(db, "data", "config"));
    if (configDoc.exists()) {
      const data = configDoc.data();
      document.getElementById("last-update").textContent = `${data.updateDate} • ${data.updateTime} UTC (por ${data.updatedBy})`;
    } else {
      document.getElementById("last-update").textContent = "Desconocido";
    }
  } catch (error) {
    console.error("Error al cargar la config:", error);
    document.getElementById("last-update").textContent = "Error al cargar";
  }
}


// Renderizar todos los propulsores
function renderBoosters() {
  const container = document.getElementById("boostersAdmin")
  container.innerHTML = ""

  if (boostersData.length === 0) {
    container.innerHTML =
      '<div style="text-align: center; padding: 2rem; color: #888;">No hay propulsores. Agrega uno nuevo.</div>'
    return
  }

  boostersData.forEach((booster) => {
    const card = createBoosterCard(booster)
    container.appendChild(card)
  })
}

// Crear tarjeta de propulsor
function createBoosterCard(booster) {
  const card = document.createElement("div")
  card.className = "admin-booster-card"

  const statusClass = booster.status.toLowerCase().replace(" ", "-")
  const vuelosRealizados = booster.missions.filter((m) => !m.programado).length

  card.innerHTML = `
    <div class="card-content">
      <div class="admin-booster-header">
        <h3>${booster.name}</h3>
        <div class="admin-booster-actions">
          <button class="btn btn-edit" onclick="editBooster('${booster.id}')">✏️ Editar</button>
          <button class="btn btn-danger" onclick="deleteBooster('${booster.id}')">🗑️ Eliminar</button>
        </div>
      </div>
      <div class="admin-booster-info">
        <p><strong>ID:</strong> ${booster.id}</p>
        <p><strong>Nombre:</strong> ${booster.name}</p>
        <p><strong>Tipo:</strong> ${booster.type}</p>
        <p><strong>Block:</strong> ${booster.block || "N/A"}</p> <!-- ← Block agregado -->
        <p><strong>Estado:</strong> <span class="status-badge status-${statusClass}">${booster.status}</span></p>
        <p><strong>Vuelos:</strong> ${vuelosRealizados}</p>
      </div>
      <div class="missions-list">
        <h4>Misiones (${booster.missions.length})</h4>
        <div id="missions-${booster.id}" style="max-height: 400px; overflow-y: auto; padding-right: 0.5rem;">
          ${booster.missions.map((mission, index) => createMissionItem(mission, index, booster.id)).join("")}
        </div>
        <button class="btn add-mission-btn" onclick="addMission('${booster.id}')">+ Agregar Misión</button>
      </div>
    </div>
  `

  // Agregar clase para manejar background y blur
  card.classList.add(booster.image ? "with-bg" : "no-bg")

  if (booster.image) {
    card.style.setProperty("--bg-image", `url('${booster.image}')`)
  }

  return card
}

// Crear item de misión
function createMissionItem(mission, index, boosterId) {
  const programadoBadge = mission.programado ? '<span style="color: #ffa500;">🔔 PROGRAMADO</span>' : ""

  return `
        <div class="mission-item">
            <div class="mission-info">
                <p><strong>${mission.name}</strong> ${programadoBadge}</p>
                <p>📅 ${mission.date} | 🚀 ${mission.launchPad} | 🛬 ${mission.landing || "Desechado"}</p>
            </div>
            <div class="mission-actions">
                <button class="btn btn-edit" onclick="editMission('${boosterId}', ${index})">✏️</button>
                <button class="btn btn-danger" onclick="deleteMission('${boosterId}', ${index})">🗑️</button>
            </div>
        </div>
    `
}

// Abrir modal para agregar propulsor
document.getElementById("addBoosterBtn").addEventListener("click", () => {
  editingBoosterId = null
  document.getElementById("modalTitle").textContent = "Agregar Propulsor"
  document.getElementById("boosterForm").reset()
  document.getElementById("boosterModal").style.display = "block"
  document.body.classList.add("modal-open")
})

// Editar propulsor
window.editBooster = (boosterId) => {
  editingBoosterId = boosterId
  const booster = boostersData.find((b) => b.id === boosterId)

  document.getElementById("modalTitle").textContent = "Editar Propulsor"
  document.getElementById("boosterId").value = booster.id
  document.getElementById("boosterName").value = booster.name
  document.getElementById("boosterType").value = booster.type
  document.getElementById("boosterBlock").value = booster.block || ""   // ← Block agregado
  document.getElementById("boosterStatus").value = booster.status
  document.getElementById("boosterImage").value = booster.image

  document.getElementById("boosterModal").style.display = "block"
  document.body.classList.add("modal-open")
}

window.deleteBooster = async (boosterId) => {
  if (confirm("¿Estás seguro de eliminar este propulsor?")) {
    try {
      await deleteDoc(doc(db, "boosters", boosterId))
      boostersData = boostersData.filter((b) => b.id !== boosterId)
      renderBoosters()
      alert("Propulsor eliminado exitosamente")
    } catch (error) {
      console.error("Error eliminando propulsor:", error)
      alert("Error al eliminar el propulsor")
    }
  }
}

document.getElementById("boosterForm").addEventListener("submit", async (e) => {
  e.preventDefault()

  const boosterId = document.getElementById("boosterId").value
  const boosterData = {
    name: document.getElementById("boosterName").value,
    type: document.getElementById("boosterType").value,
    block: document.getElementById("boosterBlock").value.replace(/\D/g, ""), // <- Solo números
    status: document.getElementById("boosterStatus").value,
    image: document.getElementById("boosterImage").value,
    missions: [],
  }  

  try {
    if (editingBoosterId) {
      // Actualizar propulsor existente
      const existingBooster = boostersData.find((b) => b.id === editingBoosterId)
      boosterData.missions = existingBooster.missions

      await setDoc(doc(db, "boosters", editingBoosterId), boosterData)
      alert("Propulsor actualizado exitosamente")
    } else {
      // Crear nuevo propulsor
      await setDoc(doc(db, "boosters", boosterId), boosterData)
      alert("Propulsor creado exitosamente")
    }

    document.getElementById("boosterModal").style.display = "none"
    document.body.classList.remove("modal-open")
    await loadData()
  } catch (error) {
    console.error("Error guardando propulsor:", error)
    alert("Error al guardar el propulsor")
  }
})

// Agregar misión
window.addMission = (boosterId) => {
  currentBoosterId = boosterId
  editingMissionIndex = null
  document.getElementById("missionModalTitle").textContent = "Agregar Misión"
  document.getElementById("missionForm").reset()
  document.getElementById("missionModal").style.display = "block"
  document.body.classList.add("modal-open")
}

// Editar misión
window.editMission = (boosterId, missionIndex) => {
  currentBoosterId = boosterId
  editingMissionIndex = missionIndex

  const booster = boostersData.find((b) => b.id === boosterId)
  const mission = booster.missions[missionIndex]

  document.getElementById("missionModalTitle").textContent = "Editar Misión"
  document.getElementById("missionName").value = mission.name
  document.getElementById("missionDate").value = mission.date
  document.getElementById("missionSuccess").value = mission.success === null ? "null" : mission.success.toString()
  document.getElementById("missionLanding").value = mission.landing || ""
  document.getElementById("missionLaunchPad").value = mission.launchPad
  document.getElementById("missionProgramado").checked = mission.programado || false

  document.getElementById("missionModal").style.display = "block"
  document.body.classList.add("modal-open")
}

window.deleteMission = async (boosterId, missionIndex) => {
  if (confirm("¿Estás seguro de eliminar esta misión?")) {
    try {
      const booster = boostersData.find((b) => b.id === boosterId)
      booster.missions.splice(missionIndex, 1)

      await updateDoc(doc(db, "boosters", boosterId), {
        missions: booster.missions,
      })

      renderBoosters()
      alert("Misión eliminada exitosamente")
    } catch (error) {
      console.error("Error eliminando misión:", error)
      alert("Error al eliminar la misión")
    }
  }
}

document.getElementById("missionForm").addEventListener("submit", async (e) => {
  e.preventDefault()

  const booster = boostersData.find((b) => b.id === currentBoosterId)

  const successValue = document.getElementById("missionSuccess").value
  const landingValue = document.getElementById("missionLanding").value

  const missionData = {
    name: document.getElementById("missionName").value,
    date: document.getElementById("missionDate").value,
    success: successValue === "null" ? null : successValue === "true",
    landing: landingValue === "" ? null : landingValue,
    launchPad: document.getElementById("missionLaunchPad").value,
  }

  if (document.getElementById("missionProgramado").checked) {
    missionData.programado = true
  }

  try {
    if (editingMissionIndex !== null) {
      booster.missions[editingMissionIndex] = missionData
    } else {
      booster.missions.push(missionData)
    }

    await updateDoc(doc(db, "boosters", currentBoosterId), {
      missions: booster.missions,
    })

    document.getElementById("missionModal").style.display = "none"
    document.body.classList.remove("modal-open")
    renderBoosters()
    alert("Misión guardada exitosamente")
  } catch (error) {
    console.error("Error guardando misión:", error)
    alert("Error al guardar la misión")
  }
})

// Cerrar modales
document.querySelectorAll(".close").forEach((closeBtn) => {
  closeBtn.addEventListener("click", function () {
    this.closest(".modal").style.display = "none"
    document.body.classList.remove("modal-open")
  })
})

document.getElementById("cancelBoosterBtn").addEventListener("click", () => {
  document.getElementById("boosterModal").style.display = "none"
  document.body.classList.remove("modal-open")
})

document.getElementById("cancelMissionBtn").addEventListener("click", () => {
  document.getElementById("missionModal").style.display = "none"
  document.body.classList.remove("modal-open")
})

window.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) {
    e.target.style.display = "none"
    document.body.classList.remove("modal-open")
  }
})

loadData()
loadConfig()