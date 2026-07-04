# Privacy Policy — LeetKit

_Last updated: 2026-07-03_

LeetKit ("the extension") is a browser extension that adds
company tags and display options to LeetCode's question lists. This policy
explains what the extension does and does not do with your data.

## Summary

**The extension does not collect, store, transmit, or sell any personal data to
the developer or any third party.** It has no analytics, no tracking, and no
external servers. Everything it does happens locally in your browser and between
your browser and `leetcode.com`.

## What the extension accesses

- **Your LeetCode session (on leetcode.com only).** To display company tags, the
  extension calls LeetCode's own GraphQL API (`https://leetcode.com/graphql/`)
  using your existing logged-in session cookies — the same requests the LeetCode
  website itself makes. Company tag data is a LeetCode Premium feature, so this
  only returns data if your account has access. The extension never reads,
  copies, or transmits your cookies or credentials anywhere; the browser attaches
  them to same-origin requests automatically.

- **The page content of LeetCode list pages.** The extension reads question
  titles/links in the list in order to insert tags and hide difficulty labels.

The extension runs **only on `https://leetcode.com/*`**. It does not run on, or
have access to, any other website.

## What the extension stores

All storage is local to your browser via the standard `chrome.storage` API:

- **Your settings** (which toggles/filters you enabled).
- **A cache of company tags** per question, kept for up to 7 days to avoid
  refetching. This contains only public company-tag information returned by
  LeetCode — no personal data.

You can clear the cache at any time from the extension's popup. Uninstalling the
extension removes all of its stored data.

## Data sharing

None. No data is sent to the developer or any third party. The only network
requests the extension makes are to `leetcode.com`.

## Changes

Any changes to this policy will be published in this file in the project
repository.

## Contact

Questions or concerns: open an issue at
<https://github.com/ajak6/leetcode_ui_enhancer/issues>.
