const DEFAULTS = {
  hideDifficulty: false,
  showCompanyTags: false,
  timeWindow: "6mo",
  heatColors: true,
  maxChips: 5,
  filterCompany: "",
  hotOnly: false,
};

// [id, kind] — how to read/write each control.
const FIELDS = [
  ["hideDifficulty", "check"],
  ["showCompanyTags", "check"],
  ["timeWindow", "value"],
  ["heatColors", "check"],
  ["maxChips", "number"],
  ["filterCompany", "value"],
  ["hotOnly", "check"],
];

const $ = (id) => document.getElementById(id);
function setStatus(m) {
  $("status").textContent = m || "";
}

function readEl(id, kind) {
  const el = $(id);
  if (kind === "check") return el.checked;
  if (kind === "number") return Math.max(1, Math.min(15, +el.value || 5));
  return el.value;
}
function writeEl(id, kind, v) {
  const el = $(id);
  if (kind === "check") el.checked = !!v;
  else el.value = v;
}

function refreshEnabled() {
  $("companyOpts").classList.toggle("disabled", !$("showCompanyTags").checked);
}

// Load settings into controls.
chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const [id, kind] of FIELDS) writeEl(id, kind, s[id]);
  refreshEnabled();
});

// Persist on any change.
for (const [id, kind] of FIELDS) {
  const evt = kind === "value" || kind === "number" ? "input" : "change";
  $(id).addEventListener(evt, () => {
    chrome.storage.sync.set({ [id]: readEl(id, kind) });
    if (id === "showCompanyTags") refreshEnabled();
    setStatus("Saved.");
    setTimeout(() => setStatus(""), 1000);
  });
}

// Clear cached company data.
$("clearCache").addEventListener("click", () => {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter(
      (k) => k.startsWith("lce_stats_") || k.startsWith("lce_companies_")
    );
    chrome.storage.local.remove(keys, () => {
      setStatus(`Cleared ${keys.length} cached entries.`);
      setTimeout(() => setStatus(""), 1800);
    });
  });
});
