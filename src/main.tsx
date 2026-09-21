import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

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
