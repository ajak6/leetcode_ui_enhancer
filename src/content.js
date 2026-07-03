/* LeetCode List Enhancer — content script
 *
 *   1. Hide difficulty labels in question lists.
 *   2. Show company tags per question (Premium GraphQL), inline in the list.
 *      Works on the main /problemset/ list AND the slide-out question-picker
 *      panel on the solve page (same row markup — verified 2026-06).
 *   3. Color chips by "heat" (how frequently a company asks the question).
 *   4. Filter the list by company / to hot questions (dims non-matches; the
 *      list is virtualized + React-controlled, so we dim rather than reorder).
 *
 * The list is virtualized: only ~visible rows exist and their <a> nodes are
 * RECYCLED on scroll. We track the slug last rendered onto each node and
 * re-render when a node is reused.
 *
 * Verified markup: a row is  a[href*="/problems/<slug>"]  containing a
 * difficulty <p> (text-sd-*); the title is a "<num>. Title" leaf whose
 * grandparent  div.flex.w-0.flex-1.items-center.space-x-2  is the chip cell.
 */

(() => {
  "use strict";

  const CONFIG = {
    graphqlUrl: "https://leetcode.com/graphql/",
    companyTagQuery: `
      query questionCompanyTags($titleSlug: String!) {
        question(titleSlug: $titleSlug) { companyTagStats }
      }`,
    cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
    maxConcurrentFetches: 3,
    fetchDelayMs: 150,
    fetchTimeoutMs: 12000, // abort a stalled request so it can't block the queue
    sweepMs: 4000, // periodic retry of rows that failed / never rendered
    // companyTagStats bucket keys → time window (verified against LeetCode).
    windowBucket: { "6mo": "1", "1yr": "2", "2yr": "3" },
    // Heat thresholds on "times encountered" within the selected window.
    // Calibrated for the 6-month window, where counts are modest: a top company
    // of ~15+ is genuinely frequent, so most lists surface a few "hot" ones.
    heat: { hot: 15, warm: 5 },
  };

  const DIFFICULTY = ["Easy", "Medium", "Hard"];
  const SLUG_ATTR = "data-lce-slug";

  const DEFAULTS = {
    hideDifficulty: false,
    showCompanyTags: false,
    timeWindow: "6mo", // 6mo | 1yr | 2yr | all
    fillEmptyWindow: true, // if the window has no data, fall back to all-time
    heatColors: true,
    maxChips: 4,
    filterCompany: "", // comma-separated substrings; dims non-matching rows
    hotOnly: false, // dim rows whose top company isn't "hot"
  };

  let settings = { ...DEFAULTS };
  const log = (...a) => console.debug("[LCE]", ...a);

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[2]) : "";
  }

  // ------------------------------------------------ concurrency-limited fetch queue
  const queue = [];
  let active = 0;
  function enqueue(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      pump();
    });
  }
  function pump() {
    while (active < CONFIG.maxConcurrentFetches && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active++;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          active--;
          setTimeout(pump, CONFIG.fetchDelayMs);
        });
    }
  }

  // ------------------------------------------------------------------- company tags
  async function graphql(query, variables) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.fetchTimeoutMs);
    try {
      const res = await fetch(CONFIG.graphqlUrl, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrftoken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ query, variables }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("GraphQL HTTP " + res.status);
      const json = await res.json();
      if (json.errors) throw new Error(JSON.stringify(json.errors));
      return json.data;
    } finally {
      clearTimeout(timer);
    }
  }

  // Parse companyTagStats (JSON string keyed by bucket) for the chosen window.
  // "all" merges every bucket and keeps the max count per company.
  function parseCompanyStats(raw, timeWindow) {
    if (!raw) return [];
    let obj;
    try {
      obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return [];
    }
    const byName = new Map();
    const buckets =
      timeWindow === "all"
        ? Object.values(obj || {})
        : [obj?.[CONFIG.windowBucket[timeWindow]] || []];
    for (const bucket of buckets) {
      if (!Array.isArray(bucket)) continue;
      for (const c of bucket) {
        const name = c.name || c.slug;
        if (!name) continue;
        const count = Number(c.timesEncountered || 0);
        if (count > (byName.get(name) || 0)) byName.set(name, count);
      }
    }
    return [...byName.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }

  // Companies to actually display for a question: the selected window, or (if
  // that window is empty and fillEmptyWindow is on) all-time as a fallback, so
  // questions not asked recently still show their historical companies.
  function effectiveCompanies(raw) {
    const list = parseCompanyStats(raw, settings.timeWindow);
    if (list.length || !settings.fillEmptyWindow || settings.timeWindow === "all")
      return { list, fallback: false };
    return { list: parseCompanyStats(raw, "all"), fallback: true };
  }

  // Cache the raw stats (window-independent) so switching windows needs no refetch.
  async function getRawStats(slug) {
    const key = "lce_stats_" + slug;
    const cached = await new Promise((r) =>
      chrome.storage.local.get(key, (o) => r(o[key]))
    );
    if (cached && Date.now() - cached.t < (cached.ttl || CONFIG.cacheTtlMs))
      return cached.v;
    const data = await enqueue(() =>
      graphql(CONFIG.companyTagQuery, { titleSlug: slug })
    );
    const raw = data?.question?.companyTagStats || "";
    // Don't let a transient empty response poison the cache for a week.
    const ttl = raw ? CONFIG.cacheTtlMs : 5 * 60 * 1000;
    chrome.storage.local.set({ [key]: { t: Date.now(), v: raw, ttl } });
    return raw;
  }

  // ------------------------------------------------------------------- DOM helpers
  function slugOf(a) {
    const m = (a.getAttribute("href") || "").match(/\/problems\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function findRows() {
    return [...document.querySelectorAll('a[href*="/problems/"]')].filter((a) =>
      [...a.querySelectorAll("p, span, div")].some(
        (e) =>
          e.childElementCount === 0 &&
          DIFFICULTY.includes((e.textContent || "").trim())
      )
    );
  }

  function titleCell(rowAnchor) {
    const leaf = [...rowAnchor.querySelectorAll("*")].find(
      (el) =>
        el.childElementCount === 0 &&
        /^\d+\.\s/.test((el.textContent || "").trim())
    );
    return leaf && leaf.parentElement && leaf.parentElement.parentElement
      ? leaf.parentElement.parentElement
      : rowAnchor;
  }

  function heatOf(count) {
    if (count >= CONFIG.heat.hot) return "hot";
    if (count >= CONFIG.heat.warm) return "warm";
    return "cool";
  }

  function renderChips(cell, companies, fallback) {
    const box = document.createElement("span");
    box.className = "lce-companies" + (fallback ? " lce-fallback" : "");
    const suffix = fallback ? " · all-time" : "";
    const max = settings.maxChips > 0 ? settings.maxChips : companies.length;
    for (const c of companies.slice(0, max)) {
      const chip = document.createElement("span");
      chip.className =
        "lce-chip" + (settings.heatColors ? " lce-" + heatOf(c.count) : "");
      chip.textContent = c.name;
      chip.title = `${c.name} · ${c.count}×${suffix} (${heatOf(c.count)})`;
      box.appendChild(chip);
    }
    if (companies.length > max) {
      const more = document.createElement("span");
      more.className = "lce-chip lce-more";
      more.textContent = "+" + (companies.length - max);
      more.title = companies
        .slice(max)
        .map((c) => `${c.name} (${c.count}×)`)
        .join(", ");
      box.appendChild(more);
    }
    cell.appendChild(box);
  }

  function clearChips(row) {
    row.querySelectorAll(".lce-companies").forEach((e) => e.remove());
  }

  // -------------------------------------------------------------------- filtering
  function rowMatchesFilter(companies) {
    if (settings.hotOnly) {
      const top = companies[0]?.count || 0;
      if (top < CONFIG.heat.hot) return false;
    }
    const terms = settings.filterCompany
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (terms.length) {
      const names = companies.map((c) => c.name.toLowerCase());
      if (!terms.some((t) => names.some((n) => n.includes(t)))) return false;
    }
    return true;
  }

  function filterActive() {
    return settings.hotOnly || settings.filterCompany.trim().length > 0;
  }

  function applyRowFilter(row) {
    if (!settings.showCompanyTags || !filterActive()) {
      row.classList.remove("lce-dim");
      return;
    }
    const companies = row.__lceCompanies;
    if (!companies) return; // not fetched yet; will be applied on render
    row.classList.toggle("lce-dim", !rowMatchesFilter(companies));
  }

  // ------------------------------------------------------------------- difficulty
  function applyDifficultyHiding() {
    const on = settings.hideDifficulty;
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
  // Fetch (cached) + render chips. The injection target is resolved at RENDER
  // time — not before the fetch — because LeetCode re-renders a row's inner DOM
  // while it loads, which would otherwise leave us appending chips into a
  // detached node (chips silently vanish).
  function ensureChips(row, slug) {
    getRawStats(slug)
      .then((raw) => {
        if (slugOf(row) !== slug) return; // node recycled to another problem
        const { list, fallback } = effectiveCompanies(raw);
        row.__lceCompanies = list;
        row.__lceFallback = fallback;
        if (!settings.showCompanyTags) return;
        clearChips(row);
        if (list.length) renderChips(titleCell(row), list, fallback);
        applyRowFilter(row);
      })
      .catch((err) => {
        if (row.getAttribute(SLUG_ATTR) === slug) row.removeAttribute(SLUG_ATTR);
        log("company fetch failed for", slug, err.message);
      });
  }

  function process() {
    applyDifficultyHiding();
    if (!settings.showCompanyTags) return;

    for (const row of findRows()) {
      const slug = slugOf(row);
      if (!slug) continue;

      if (row.getAttribute(SLUG_ATTR) === slug) {
        // Self-heal: if a React re-render wiped our chips, re-inject from the
        // cached data instead of waiting for the node to recycle.
        if (
          !row.querySelector(".lce-companies") &&
          row.__lceCompanies &&
          row.__lceCompanies.length
        ) {
          renderChips(titleCell(row), row.__lceCompanies, row.__lceFallback);
        }
        applyRowFilter(row);
        continue;
      }

      clearChips(row);
      row.__lceCompanies = null;
      row.setAttribute(SLUG_ATTR, slug);
      ensureChips(row, slug);
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      process();
    }, 250);
  }

  // Re-render chips in place (e.g. after a window/heat/maxChips change) using
  // cached stats, without refetching.
  function rerenderAll() {
    for (const row of findRows()) {
      const slug = slugOf(row);
      if (!slug) continue;
      clearChips(row);
      getRawStats(slug).then((raw) => {
        if (slugOf(row) !== slug) return;
        const { list, fallback } = effectiveCompanies(raw);
        row.__lceCompanies = list;
        row.__lceFallback = fallback;
        clearChips(row);
        if (settings.showCompanyTags && list.length)
          renderChips(titleCell(row), list, fallback);
        applyRowFilter(row);
      });
    }
  }

  function stripAll() {
    document.querySelectorAll("[" + SLUG_ATTR + "]").forEach((row) => {
      clearChips(row);
      row.classList.remove("lce-dim");
      row.removeAttribute(SLUG_ATTR);
      row.__lceCompanies = null;
    });
  }

  function start() {
    process();
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
    });
    // Periodic sweep: retry rows whose fetch failed or never rendered, even
    // when the list is idle (no DOM mutations to trigger a re-process).
    setInterval(() => {
      if (settings.showCompanyTags) process();
    }, CONFIG.sweepMs);
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
    for (const k of Object.keys(changes)) {
      if (k in settings) settings[k] = changes[k].newValue;
    }
    if ("showCompanyTags" in changes && !settings.showCompanyTags) {
      stripAll();
      applyDifficultyHiding();
      return;
    }
    // Window / heat / maxChips changes need a re-render; others just reprocess.
    if (
      "timeWindow" in changes ||
      "fillEmptyWindow" in changes ||
      "heatColors" in changes ||
      "maxChips" in changes
    ) {
      rerenderAll();
    }
    process();
  });
})();
