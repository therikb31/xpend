import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Standalone detection for CSS (navigator.standalone is iOS-PWA-only and more
// reliable than the display-mode media query). Mirrors the inline bootstrap
// in index.html so the class survives client-side navigation.
if ((window.navigator as Navigator & { standalone?: boolean }).standalone) {
  document.documentElement.classList.add("is-standalone");
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* Service worker: network-first, so a home-screen install always shows the
   latest deploy. Document-relative URL keeps the scope correct whether the
   app is served from /, /xpend/, or /docs. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => undefined);
  });
}
