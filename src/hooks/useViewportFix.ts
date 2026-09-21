// iOS standalone keyboard fix — port of legacy kbFix.
// When the keyboard opens and closes, window.innerHeight sometimes stays stuck
// short, leaving a black strip. Re-assert the layout viewport on keyboard close.

import { useEffect } from "react";

export function useViewportFix(): void {
  useEffect(() => {
    const app = () => document.getElementById("app");
    const kbFix = () => {
      const a = app();
      if (!a) return;
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) {
        const o = meta.getAttribute("content") || "";
        meta.setAttribute("content", o + ", kbFix");
        setTimeout(() => meta.setAttribute("content", o), 40);
      }
      window.scrollTo(0, 0);
      (a as HTMLElement).style.top = "0";
      (a as HTMLElement).style.bottom = "0";
    };
    const onResize = () => kbFix();
    const onFocusOut = () => setTimeout(() => kbFix(), 140);
    let cleanupVV: (() => void) | undefined;
    const vv = window.visualViewport;
    if (vv) {
      let kbWas = false;
      const onVV = () => {
        const kbNow =
          Math.round(window.visualViewport!.height) < Math.round(window.innerHeight * 0.9);
        if (kbWas && !kbNow) setTimeout(kbFix, 90);
        kbWas = kbNow;
      };
      vv.addEventListener("resize", onVV);
      cleanupVV = () => vv.removeEventListener("resize", onVV);
    }
    window.addEventListener("resize", onResize);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("focusout", onFocusOut);
      if (cleanupVV) cleanupVV();
    };
  }, []);
}
