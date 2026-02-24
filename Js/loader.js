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