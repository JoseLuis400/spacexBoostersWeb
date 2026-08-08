// migrate.js
// Recorre boosters y capsulas en Firestore y reemplaza cualquier imagen guardada
// como ruta local/Storage ("img/B1067.jpg") por la URL completa de descarga de Firebase.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const userEmailEl = document.getElementById("userEmail");
const logEl = document.getElementById("log");
const statusEl = document.getElementById("runStatus");

let hasRun = false;

function log(msg) {
  console.log(msg);
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

function isFullUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

async function resolveUrl(path) {
  if (!path || isFullUrl(path)) return path;
  try {
    return await getDownloadURL(ref(storage, path));
  } catch (err) {
    log(`  ⚠️ No se encontró en Storage: "${path}" (${err.code || err.message})`);
    return path;
  }
}

async function migrateBoosters() {
  log("— Revisando propulsores —");
  const snap = await getDocs(collection(db, "boosters"));
  let updated = 0, skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!data.image || isFullUrl(data.image)) { skipped++; continue; }

    const newUrl = await resolveUrl(data.image);
    if (newUrl && newUrl !== data.image) {
      await updateDoc(doc(db, "boosters", docSnap.id), { image: newUrl });
      log(`  ✅ ${docSnap.id}: "${data.image}" → URL de Firebase`);
      updated++;
    } else {
      skipped++;
    }
  }
  log(`Propulsores actualizados: ${updated}, sin cambios: ${skipped}`);
}

async function migrateCapsulas() {
  log("— Revisando cápsulas —");
  const snap = await getDocs(collection(db, "capsulas"));
  let updated = 0, skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const updates = {};
    let changed = false;

    if (data.image && !isFullUrl(data.image)) {
      const newUrl = await resolveUrl(data.image);
      if (newUrl !== data.image) { updates.image = newUrl; changed = true; }
    }

    const missions = data.missions || [];
    let missionsChanged = false;

    for (const mission of missions) {
      if (mission.patch && !isFullUrl(mission.patch)) {
        const newUrl = await resolveUrl(mission.patch);
        if (newUrl !== mission.patch) { mission.patch = newUrl; missionsChanged = true; }
      }
      if (Array.isArray(mission.crew)) {
        for (const member of mission.crew) {
          if (member.image && !isFullUrl(member.image)) {
            const newUrl = await resolveUrl(member.image);
            if (newUrl !== member.image) { member.image = newUrl; missionsChanged = true; }
          }
        }
      }
    }
    if (missionsChanged) { updates.missions = missions; changed = true; }

    if (changed) {
      await updateDoc(doc(db, "capsulas", docSnap.id), updates);
      log(`  ✅ ${docSnap.id}: imágenes actualizadas`);
      updated++;
    } else {
      skipped++;
    }
  }
  log(`Cápsulas actualizadas: ${updated}, sin cambios: ${skipped}`);
}

async function runMigration() {
  if (hasRun) return;
  hasRun = true;

  document.getElementById("rerunBtn").disabled = true;
  statusEl.textContent = "Ejecutando migración...";
  logEl.textContent = "";

  try {
    await migrateBoosters();
    await migrateCapsulas();
    log("✔ Migración completa.");
    statusEl.textContent = "Migración completa.";
  } catch (err) {
    console.error(err);
    log("❌ Error durante la migración: " + err.message);
    statusEl.textContent = "Error — revisa el log.";
  } finally {
    document.getElementById("rerunBtn").disabled = false;
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.style.display = "none";
    adminSection.style.display = "block";
    userEmailEl.textContent = user.email;
    runMigration();
  } else {
    hasRun = false;
    loginSection.style.display = "block";
    adminSection.style.display = "none";
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    alert("Error al iniciar sesión: " + err.message);
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));
document.getElementById("rerunBtn").addEventListener("click", () => {
  hasRun = false;
  runMigration();
});
