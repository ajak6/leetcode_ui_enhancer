/* LeetCode List Enhancer — content script
 *
 * Hide difficulty labels (Easy/Medium/Hard) in question lists.
 *
 * The list is a virtualized React SPA, so we watch for DOM mutations and SPA
 * URL changes and re-apply our modifications.
 */

(() => {
  "use strict";

  const DIFFICULTY = ["Easy", "Medium", "Hard"];

  const DEFAULTS = {
    hideDifficulty: false,
  };

  let settings = { ...DEFAULTS };
  const log = (...a) => console.debug("[LCE]", ...a);

  // ------------------------------------------------------------------- difficulty
  function applyDifficultyHiding() {
    const on = settings.hideDifficulty;
    // Class hook (precise) + text fallback (resilient to class renames).
    document
      .querySelectorAll(
        'p[class*="text-sd-easy"], p[class*="text-sd-medium"], p[class*="text-sd-hard"]'
      )
      .forEach((el) => el.classList.toggle("lce-hidden-difficulty", on));
    document.querySelectorAll("p, span, div").forEach((el) => {
      if (el.childElementCount !== 0) return;
      if (DIFFICULTY.includes((el.textContent || "").trim()))
        el.classList.toggle("lce-hidden-difficulty", on);
    });
  }

  // ------------------------------------------------------------------- main loop
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      applyDifficultyHiding();
    }, 250);
  }

  function start() {
    applyDifficultyHiding();
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
    });
    // Detect SPA navigations (pushState/replaceState/popstate).
    const fire = () => setTimeout(schedule, 50);
    ["pushState", "replaceState"].forEach((fn) => {
      const orig = history[fn];
      history[fn] = function () {
        const r = orig.apply(this, arguments);
        fire();
        return r;
      };
    });
    window.addEventListener("popstate", fire);
  }

  // ------------------------------------------------------------------- bootstrap
  chrome.storage.sync.get(DEFAULTS, (s) => {
    settings = { ...DEFAULTS, ...s };
    log("active", settings);
    if (document.body) start();
    else window.addEventListener("DOMContentLoaded", start);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if ("hideDifficulty" in changes) {
      settings.hideDifficulty = changes.hideDifficulty.newValue;
      applyDifficultyHiding();
    }
  });
})();
