function hideLoader() {
    const loader = document.getElementById("loader");
    if (loader) {
        loader.classList.add("fade-out");
        setTimeout(() => loader.remove(), 600);
    }
}

// Fecha actual Copyright

document.addEventListener("DOMContentLoaded", function () {
    const currentYear = new Date().getFullYear();
    const footerText = document.querySelector(".footer-left p");
  
    if (footerText) {
      footerText.textContent = footerText.textContent.replace("2025", currentYear);
    }
  });

// Reloj en vivo del nav
function updateLiveClock() {
    const clockEl = document.getElementById("live-clock");
    if (!clockEl) return;
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const date = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    clockEl.textContent = `${date} ${time}`;
}

document.addEventListener("DOMContentLoaded", () => {
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
});