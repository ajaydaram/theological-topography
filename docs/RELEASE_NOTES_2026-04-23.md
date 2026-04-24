# Release Notes - 2026-04-23

## What Changed

- Added guided empty states in key study paths:
  - no search results
  - no verse matches
  - no shared documents for a selected verse
  - no cross-reference connections
  - no roots registered/available
- Added a data freshness label in the sidebar status card:
  - Last Generated timestamp
  - Source Used (Local snapshot, Remote fetch, Seed fallback)
- Standardized loader metadata so the app can report freshness and source reliably at runtime.
- Polished the lightweight metrics view in the status card (browser-local counters):
  - Deep Search count
  - Compare Opened count
  - Tooltip Opened count
  - Panel Swaps count
- Added a temporary scope-freeze note for this week in the README to keep delivery focused on usability fixes only.

## Why It Matters

- Users get clear next steps instead of dead-end empty screens, reducing confusion during study.
- The app communicates trust signals (where data came from and when it was generated), which improves confidence when sharing the tool.
- Lightweight metrics provide immediate feedback on whether key workflows are being used, without introducing external analytics complexity.
- Scope freeze improves execution quality and lowers release risk by preventing feature creep.

## Known Limits

- Metrics are browser-local only (stored in localStorage), so they are not shared across devices or users.
- The generated timestamp appears as UNKNOWN when remote fetch is used or when snapshot metadata is missing.
- Empty-state guidance is heuristic and may need copy tuning after external user feedback.
- Source labels reflect runtime loading behavior and are not cryptographic data provenance guarantees.

## Freeze Policy (This Week)

- Fix only usability bugs and clarity issues.
- Do not add new product features this week.
