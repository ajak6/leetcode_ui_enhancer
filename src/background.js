// Sets sane defaults on install. Most logic lives in the content script.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    { hideDifficulty: false, showCompanyTags: false },
    (cur) => chrome.storage.sync.set(cur)
  );
});
