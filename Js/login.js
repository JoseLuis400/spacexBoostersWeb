import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const auth = getAuth(app);
const db = getFirestore(app);
window.currentUser = null;

// ------------------- MONITOREAR ESTADO DE LOGIN -------------------
onAuthStateChanged(auth, async (user) => {
  window.currentUser = user;
  const userNameSpan = document.getElementById("userEmail"); // Cambiar id si quieres

  if (user) {
    try {
      // Obtenemos nombre desde el documento "data/users"
      const usersDoc = await getDoc(doc(db, "data", "users"));
      if (usersDoc.exists()) {
        const usersData = usersDoc.data();
        const userData = usersData[user.uid];
        if (userData && userData.name) {
          userNameSpan.textContent = userData.name;
        } else {
          userNameSpan.textContent = user.email; // fallback
        }
      } else {
        userNameSpan.textContent = user.email;
      }
    } catch (error) {
      console.error("Error obteniendo nombre de usuario:", error);
      userNameSpan.textContent = user.email;
    }

    document.getElementById("loginSection").style.display = "none";
    document.getElementById("adminSection").style.display = "block";
  } else {
    if (userNameSpan) userNameSpan.textContent = "--";
    document.getElementById("loginSection").style.display = "block";
    document.getElementById("adminSection").style.display = "none";
  }
});

// ------------------- FUNCIONES LOGIN / LOGOUT -------------------
window.login = async function (email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    alert("Login exitoso");

    // Redirigir a la página de edición
    window.location.href = 'edit'; // <-- Cambia por tu URL real
  } catch (error) {
    console.error("Error login:", error.code, error.message);
    alert("Error al iniciar sesión: " + error.message);
  }
};


window.logout = async function () {
  try {
    await signOut(auth);
    alert("Sesión cerrada");
  } catch (error) {
    console.error("Error logout:", error);
  }
};

// ------------------- BOTONES -------------------
document.getElementById("loginBtn").addEventListener("click", () => {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  login(email, password);
});

document.getElementById("logoutBtn").addEventListener("click", logout);

// Array con las URLs de las imágenes que quieres mostrar
const backgrounds = [
  'https://spacexboosters.netlify.app/img2/B1094.jpg',
  'https://spacexboosters.netlify.app/img2/B1090.jpg',
  'https://spacexboosters.netlify.app/img2/B1085.jpg',
  'https://spacexboosters.netlify.app/img2/B1081.jpg',
  'https://spacexboosters.netlify.app/img2/B1080.jpg',
  'https://spacexboosters.netlify.app/img2/B1067.jpg'
];

// Función para cambiar la imagen aleatoriamente
function changeBackgroundRandom() {
// Elegimos un índice aleatorio
const randomIndex = Math.floor(Math.random() * backgrounds.length);
// Aplicamos la imagen al CSS variable
document.body.style.setProperty('--bg-image', `url('${backgrounds[randomIndex]}')`);
}

// Cambiamos la imagen cada 10 segundos
setInterval(changeBackgroundRandom, 10000);

// Inicializamos la primera imagen
changeBackgroundRandom();