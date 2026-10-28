/* global document, localStorage */
// Runs before the first paint so a stored choice never flashes the other
// theme. React owns this attribute from the moment the toggle mounts. A
// same-origin file rather than an inline script, so the production
// Content-Security-Policy needs no 'unsafe-inline' (W08).
try {
  var stored = localStorage.getItem("zg-theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
} catch {
  // Storage blocked: the system setting decides, which is the default.
}
