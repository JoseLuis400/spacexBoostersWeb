//edit.js

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"

import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";


const firebaseConfig = {
  apiKey: "AIzaSyAU8I3PbYOrd-qCSGNX3nyF6WWg0oIhAS8",
  authDomain: "spacexboosters.firebaseapp.com",
  projectId: "spacexboosters",
  storageBucket: "spacexboosters.firebasestorage.app",
  messagingSenderId: "347004633729",
  appId: "1:347004633729:web:2953672e258f6a67814380",
  measurementId: "G-P27248GMWL",
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
const db = getFirestore(app)

const storage = getStorage(app);

let boostersData = []
let editingBoosterId = null
let editingMissionIndex = null
let currentBoosterId = null

function formatUpdatedAt(date) {
  const pad = n => String(n).padStart(2, "0");
  const d = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  const t = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const offset = -date.getTimezoneOffset() / 60;
  const tz = `UTC${offset >= 0 ? "+" : ""}${offset}`;
  return `${d}, ${t} ${tz}`;
}

async function getImageURL(path) {
  try {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return await getDownloadURL(ref(storage, path));
  } catch {
    return null;
  }
}

async function loadData() {
  try {
    const boostersCollection = collection(db, "boosters")
    const boostersSnapshot = await getDocs(boostersCollection)

    const promises = boostersSnapshot.docs.map(async (doc) => {
      const data = doc.data()
      const imageURL = await getImageURL(data.image)
      return {
        id: doc.id,
        name: data.name,
        desc: data.desc || "",
        block: data.block,
        status: data.status,
        type: data.type,
        image: imageURL,            // URL resuelta (para mostrar la miniatura)
        imagePath: data.image || "", // ruta original tal cual está en Firestore (img/B1085.jpg)
        missions: data.missions || [],
        updatedAt: data.updatedAt ?? null,
      }
    })

    boostersData = await Promise.all(promises)

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

const auth = getAuth(app);
async function updateConfigUTC() {
  try {
    const configRef = doc(db, "data", "config");
    const currentUTC = getCurrentUTC();

    const user = auth.currentUser;
    let updatedBy = "Desconocido";

    if (user) {
      const usersDoc = await getDoc(doc(db, "data", "users"));
      if (usersDoc.exists()) {
        const usersData = usersDoc.data();
        const userData = usersData[user.uid];
        if (userData && userData.name) {
          updatedBy = userData.name;
        }
      }
    }

    await updateDoc(configRef, {
      updateDate: currentUTC.updateDate,
      updateTime: currentUTC.updateTime,
      updatedBy: updatedBy
    });

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

// ==================== EXPORTAR CSV ====================
function exportToCSV(boosterId) {
  const booster = boostersData.find((b) => b.id === boosterId);
  if (!booster || booster.missions.length === 0) {
    alert("Este propulsor no tiene misiones para exportar");
    return;
  }

  // Filtrar solo misiones realizadas (no programadas)
  let missionsCompleted = booster.missions.filter(m => !m.programado);
  
  if (missionsCompleted.length === 0) {
    alert("Este propulsor no tiene misiones completadas para exportar");
    return;
  }

  // Ordenar misiones por fecha (más antigua primero)
  missionsCompleted.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA - dateB;
  });

  // Función para convertir fecha de YYYY-MM-DD a DD/MM/YYYY
  function formatDate(dateString) {
    if (!dateString || dateString === "Sin fecha") return "Sin fecha";
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
  }

  // Crear contenido CSV con delimitador de punto y coma
  // UTF-8 BOM para que Excel lo lea correctamente
  let csvContent = "\uFEFF"; // BOM para UTF-8

  missionsCompleted.forEach((mission, index) => {
    const flightNumber = index + 1;
    const missionName = mission.name || "Sin nombre";
    const launchDate = formatDate(mission.date) || "Sin fecha";
    const launchPad = mission.launchPad || "Sin datos";
    const landingSite = mission.landing || "Desechado";

    // Usar punto y coma como delimitador (estándar para Excel en español)
    csvContent += `${flightNumber};${missionName};${launchDate};${launchPad};${landingSite}\n`;
  });

  // Crear archivo y descargar con UTF-8
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", `${booster.name}_misiones.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Hacer la función global
window.exportToCSV = exportToCSV;
// ======================================================

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

function createBoosterCard(booster) {
  const card = document.createElement("div")
  card.className = "admin-booster-card"

  const statusClass = booster.status.toLowerCase().replace(" ", "-")
  const vuelosRealizados = booster.missions.filter((m) => !m.programado).length
  const hasScheduled = booster.missions.some((m) => m.programado)
  const isInFlight = booster.missions.some((m) => m.inFlight)
  const updatedAt = booster.updatedAt?.toDate
    ? formatUpdatedAt(booster.updatedAt.toDate())
    : null

  card.innerHTML = `
    <div class="card-content">
      <div class="admin-booster-header">
        <h3>${booster.name} ${isInFlight ? '<span class="admin-badge badge-inflight">🚀 En vuelo</span>' : hasScheduled ? '<span class="admin-badge badge-scheduled">🔔 Programado</span>' : ""}</h3>
        <div class="admin-booster-actions">
          <button class="btn btn-edit" onclick="editBooster('${booster.id}')">✏️ Editar</button>
          <button class="btn btn-danger" onclick="deleteBooster('${booster.id}')">🗑️ Eliminar</button>
        </div>
      </div>
      <div class="admin-booster-info">
        <p><strong>Descripción:</strong> ${booster.desc || "Sin datos"}</p>
        <p><strong>Tipo:</strong> ${booster.type}</p>
        <p><strong>Block:</strong> ${booster.block || "N/A"}</p>
        <p><strong>Estado:</strong> <span class="status-badge status-${statusClass}">${booster.status}</span></p>
        <p><strong>Vuelos:</strong> ${vuelosRealizados}</p>
        ${updatedAt ? `<p class="admin-updated-at">🕐 Actualizado: ${updatedAt}</p>` : ""}
      </div>
      <div class="missions-list">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h4 style="margin: 0;">Misiones (${booster.missions.length})</h4>
          ${booster.missions.length > 0 ? `
            <button class="btn btn-success" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="exportToCSV('${booster.id}')">
              📥 Exportar CSV
            </button>
          ` : ''}
        </div>
        <div id="missions-${booster.id}" style="max-height: 400px; overflow-y: auto; padding-right: 0.5rem;">
          ${booster.missions.map((mission, index) => createMissionItem(mission, index, booster.id)).join("")}
        </div>
        <button class="btn add-mission-btn" onclick="addMission('${booster.id}')">+ Agregar Misión</button>
      </div>
    </div>
  `

  card.classList.add(booster.image ? "with-bg" : "no-bg")

  if (booster.image) {
    card.style.setProperty("--bg-image", `url('${booster.image}')`)
  }

  return card
}

function createMissionItem(mission, index, boosterId) {
  const programadoBadge = mission.programado ? '<span style="color: #ffa500;">🔔 PROGRAMADO</span>' : ""
  const inFlightBadge = mission.inFlight ? '<span style="color: #ffa500;">🚀 En vuelo</span>' : ""

  return `
        <div class="mission-item">
            <div class="mission-info">
                <p><strong>${mission.name}</strong> ${programadoBadge} ${inFlightBadge}</p>
                <p>📅 ${mission.date} | 🚀 ${mission.launchPad} | 🛬 ${mission.landing || "Desechado"}</p>
            </div>
            <div class="mission-actions">
                <button class="btn btn-edit" onclick="editMission('${boosterId}', ${index})">✏️</button>
                <button class="btn btn-danger" onclick="deleteMission('${boosterId}', ${index})">🗑️</button>
            </div>
        </div>
    `
}

document.getElementById("addBoosterBtn").addEventListener("click", () => {
  editingBoosterId = null
  document.getElementById("modalTitle").textContent = "Agregar Propulsor"
  document.getElementById("boosterForm").reset()
  document.getElementById("boosterModal").style.display = "block"
  document.body.classList.add("modal-open")
})

window.editBooster = (boosterId) => {
  editingBoosterId = boosterId
  const booster = boostersData.find((b) => b.id === boosterId)

  document.getElementById("modalTitle").textContent = "Editar Propulsor"
  document.getElementById("boosterId").value = booster.id
  document.getElementById("boosterName").value = booster.id
  document.getElementById("boosterDesc").value = booster.desc
  document.getElementById("boosterType").value = booster.type || ""
  document.getElementById("boosterBlock").value = `${booster.block}` || ""
  document.getElementById("boosterStatus").value = booster.status
  document.getElementById("boosterImage").value = booster.imagePath

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
  e.preventDefault();

  const boosterId = document.getElementById("boosterId").value.trim();
  const boosterImageInput = document.getElementById("boosterImageFile");
  let imagePath = document.getElementById("boosterImage").value.trim();

  try {
    if (boosterImageInput.files.length > 0) {
      const file = boosterImageInput.files[0];
      const extension = file.name.split('.').pop();
      const storagePath = `img/${boosterId}.${extension}`;
      const storageRef = ref(storage, storagePath);
    
      const uploadTask = uploadBytesResumable(storageRef, file);
    
      const progressBar = document.getElementById("uploadProgress");
      progressBar.style.display = "block";
      progressBar.value = 0;
    
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          progressBar.value = progress;
        },
        (error) => {
          console.error("Error subiendo imagen:", error);
          alert("Error al subir la imagen");
          progressBar.style.display = "none";
        },
        async () => {
          imagePath = `img/${boosterId}.${extension}`;
          console.log(`✅ Imagen subida correctamente a ${storagePath}`);
          progressBar.style.display = "none";
        }
      );
    
      await uploadTask;
    }    

    const boosterData = {
      name: document.getElementById("boosterName").value,
      type: document.getElementById("boosterType").value,
      desc: document.getElementById("boosterDesc").value,
      block: document.getElementById("boosterBlock").value.replace(/\D/g, '') || "",
      status: document.getElementById("boosterStatus").value,
      image: imagePath,
      missions: [],
      updatedAt: Timestamp.now(),
    };

    if (editingBoosterId) {
      const existingBooster = boostersData.find((b) => b.id === editingBoosterId);
      boosterData.missions = existingBooster.missions;
      await setDoc(doc(db, "boosters", editingBoosterId), boosterData);
      alert("Propulsor actualizado exitosamente");
    } else {
      await setDoc(doc(db, "boosters", boosterId), boosterData);
      alert("Propulsor creado exitosamente");
    }

    document.getElementById("boosterModal").style.display = "none";
    document.body.classList.remove("modal-open");
    await loadData();
  } catch (error) {
    console.error("Error al guardar propulsor o subir imagen:", error);
    alert("Error al guardar el propulsor o subir la imagen");
  }
});

window.addMission = (boosterId) => {
  currentBoosterId = boosterId
  editingMissionIndex = null
  document.getElementById("missionModalTitle").textContent = "Agregar Misión"
  document.getElementById("missionForm").reset()
  document.getElementById("missionModal").style.display = "block"
  document.body.classList.add("modal-open")
}

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
  document.getElementById("missionInFlight").checked = mission.inFlight || false

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
        updatedAt: Timestamp.now(),
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

  if (document.getElementById("missionInFlight").checked) {
    missionData.inFlight = true
  }

  try {
    if (editingMissionIndex !== null) {
      booster.missions[editingMissionIndex] = missionData
    } else {
      booster.missions.push(missionData)
    }

    await updateDoc(doc(db, "boosters", currentBoosterId), {
      missions: booster.missions,
      updatedAt: Timestamp.now(),
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