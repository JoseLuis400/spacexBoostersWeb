import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ------------------- CONFIG -------------------
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
const auth = getAuth(app);

const userEmailSpan = document.getElementById("userEmail");
const usersList = document.getElementById("usersList");
const userModal = document.getElementById("userModal");
const modalTitle = document.getElementById("modalTitle");
const userForm = document.getElementById("userForm");
const userNameInput = document.getElementById("userName");
const userEmailInput = document.getElementById("userEmailInput");
const userPasswordInput = document.getElementById("userPasswordInput");
const addUserBtn = document.getElementById("addUserBtn");
let editingUid = null;

// ------------------- LOGIN STATUS -------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const usersDoc = await getDoc(doc(db, "data", "users"));
      const usersData = usersDoc.exists() ? usersDoc.data() : {};
      userEmailSpan.textContent = usersData[user.uid]?.name || user.email;
      loadUsers();
    } catch (error) {
      console.error(error);
    }
  } else {
    alert("Debes iniciar sesión para acceder a esta página.");
    window.location.href = "https://spacexboosters.netlify.app/edit"; // Redirigir
  }
});

// ------------------- LOGOUT -------------------
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

// ------------------- MODAL -------------------
addUserBtn.addEventListener("click", () => {
  editingUid = null;
  modalTitle.textContent = "Agregar Usuario";
  userForm.reset();
  userPasswordInput.required = true;
  userModal.style.display = "flex";
});

document.querySelector(".close").addEventListener("click", () => {
  userModal.style.display = "none";
});

// ------------------- CARGAR USUARIOS -------------------
async function loadUsers() {
  usersList.innerHTML = ""; // Limpiar lista

  const usersDoc = await getDoc(doc(db, "data", "users"));
  if (!usersDoc.exists()) return;
  const usersData = usersDoc.data();

  for (const uid in usersData) {
    const user = usersData[uid];
    const div = document.createElement("div");
    div.className = "user-card";
    div.innerHTML = `
      <span>${user.name} (${user.email})</span>
      <div>
        <button class="edit-btn">Editar</button>
        <button class="delete-btn">Eliminar</button>
      </div>
    `;

    // Editar
    div.querySelector(".edit-btn").addEventListener("click", () => {
      editingUid = uid;
      modalTitle.textContent = "Editar Usuario";
      userNameInput.value = user.name;
      userEmailInput.value = user.email;
      userPasswordInput.value = "";
      userModal.style.display = "flex";
    });

    // Eliminar
    div.querySelector(".delete-btn").addEventListener("click", async () => {
      if (confirm(`Eliminar usuario ${user.name}?`)) {
        try {
          await updateDoc(doc(db, "data", "users"), { [uid]: deleteField() });
          loadUsers();
        } catch (error) {
          console.error("Error eliminando usuario:", error);
        }
      }
    });

    usersList.appendChild(div);
  }
}

// ------------------- GUARDAR USUARIO -------------------
userForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  const password = userPasswordInput.value.trim();
  const usersRef = doc(db, "data", "users");

  try {
    if (editingUid) {
      // Actualizar solo Firestore
      await updateDoc(usersRef, { [editingUid]: { name, email } });
    } else {
      // Crear usuario en Auth (cambia sesión automáticamente)
      if (!password) return alert("Se requiere contraseña para nuevo usuario");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Guardar en Firestore
      await updateDoc(usersRef, { [uid]: { name, email } });
    }
    userModal.style.display = "none";
    loadUsers();
  } catch (error) {
    console.error("Error guardando usuario:", error);
    alert("Error al crear/editar usuario: " + error.message);
  }
});
