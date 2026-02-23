const menuToggle = document.getElementById("menuToggle");
const mainMenu = document.getElementById("mainMenu");
const dropdownToggles = document.querySelectorAll(".dropdown-toggle");
const cookieBanner = document.getElementById("cookieBanner");
const acceptCookies = document.getElementById("acceptCookies");

if (menuToggle && mainMenu) {
  menuToggle.addEventListener("click", () => {
    const open = mainMenu.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
}

dropdownToggles.forEach((toggle) => {
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const parent = toggle.closest(".dropdown");
    if (!parent) return;

    document.querySelectorAll(".dropdown.open").forEach((item) => {
      if (item !== parent) item.classList.remove("open");
    });

    parent.classList.toggle("open");
  });
});

document.addEventListener("click", () => {
  document.querySelectorAll(".dropdown.open").forEach((item) => item.classList.remove("open"));
});

if (acceptCookies && cookieBanner) {
  const accepted = localStorage.getItem("itrm_cookie_accepted") === "1";
  if (accepted) {
    cookieBanner.style.display = "none";
  }

  acceptCookies.addEventListener("click", () => {
    localStorage.setItem("itrm_cookie_accepted", "1");
    cookieBanner.style.display = "none";
  });
}
