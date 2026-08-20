const confirmationKey = "astrosphere-adult-content-confirmed";

const syncContentWarnings = () => {
  const sfwEnabled = document.documentElement.dataset.sfw !== "off";
  const confirmed = sessionStorage.getItem(confirmationKey) === "true";
  document.querySelectorAll<HTMLElement>("[data-explicit-route]").forEach((route) => {
    route.dataset.unlocked = !sfwEnabled || confirmed ? "true" : "false";
  });
};

document.addEventListener("click", (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-confirm-adult-content]");
  if (!button) return;
  sessionStorage.setItem(confirmationKey, "true");
  syncContentWarnings();
});

document.addEventListener("astrosphere:sfw-change", syncContentWarnings);
document.addEventListener("astro:page-load", syncContentWarnings);
