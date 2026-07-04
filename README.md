# LeetKit

A lightweight Chrome (Manifest V3) toolkit that improves LeetCode's question
lists:

- **Show company tags inline** — see which companies ask each question, right in
  the list, instead of opening every problem. Works on the main `/problemset/`
  list **and** the slide-out question-picker panel on the solve page.
- **Heat colors** — chips are colored by how frequently the company asks the
  question: 🔴 hot, 🟠 warm, 🔵 cool — so frequently-asked questions stand out.
- **Time window** — pull tags from the last 6 months (default), 6mo–1yr, 1–2yr,
  or all time. If a question has no tags in the selected window, it falls back to
  all-time data (shown slightly faded) so questions still show their companies.
- **Filter** — dim rows that don't include a chosen company, or that have no
  "hot" company. One-click **presets** for FAANG / FANG / Big Tech.
- **Hide difficulty** — blur out the Easy / Medium / Hard labels.

> **Company tags require a LeetCode Premium account.** Company data is a
> Premium-only feature on LeetCode; the extension simply reuses your existing
> logged-in session to request it. Without Premium, the other features still
> work but no company chips appear.

## Install (from source)

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Open `leetcode.com`, click the extension icon in the toolbar, and toggle the
   options. Settings persist across pages and sessions.

## Permissions

The extension requests the minimum it needs:

| Permission | Why |
|---|---|
| `storage` | Save your options and cache company tags locally. |
| `https://leetcode.com/*` (host) | Run on LeetCode pages and call LeetCode's own GraphQL API for company tags. |

## Privacy

- The extension talks **only to `leetcode.com`**. Company-tag requests go to
  LeetCode's own GraphQL endpoint using your existing session cookies — the same
  requests the LeetCode site itself makes.
- **No data is sent to any third party.** There are no analytics, trackers, or
  external servers.
- Company-tag responses are cached in `chrome.storage.local` (on your machine)
  for 7 days to avoid refetching. Clear it any time from the popup.

## How it works

`src/content.js` runs on `leetcode.com`. It:

1. Watches the virtualized React list for DOM changes / SPA navigations.
2. Hides difficulty labels via a CSS class toggle.
3. For each question row, calls `POST /graphql/` with the `companyTagStats`
   query, parses the selected time window, and injects colored company chips
   into the row's title cell.

Because the list is virtualized (row DOM nodes are recycled on scroll), the
script tracks the slug last rendered onto each node, resolves the injection
point at render time, and self-heals if React wipes the injected chips.

### Tunable constants

Near the top of `src/content.js` (`CONFIG`):

- `heat: { hot, warm }` — the "times encountered" thresholds for chip colors.
- `windowBucket` — maps time windows to `companyTagStats` buckets.
- `cacheTtlMs`, `maxConcurrentFetches`, `maxChips`.

## Project layout

```
manifest.json         MV3 manifest
src/content.js        List enhancement engine (difficulty + company tags)
src/content.css       Chip + difficulty + filter styles
src/background.js      Service worker (sets default settings on install)
popup/                Settings UI
icons/                Extension icons
```

## Disclaimer

This is an unofficial, community project and is **not affiliated with,
endorsed by, or sponsored by LeetCode**. "LeetCode" is a trademark of its
respective owner. Use it in accordance with LeetCode's Terms of Service.

## License

[MIT](LICENSE) © 2026 Amey Jain
