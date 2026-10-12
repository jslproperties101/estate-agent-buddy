# Estate Agent Buddy

Field app for a Malaysian property negotiator working mainly in Nilai and Sepang (formerly "Property Explorer").
Target: a native Android app (Capacitor) for the Samsung S23 Ultra, with Supabase (Singapore) as the backend,
OpenFreeMap maps and GitHub Actions builds, as approved in the master document (Version 1D, decisions D5–D7).

## Current state (12 Oct 2026) — honest summary

This repository was created on 12 Oct 2026. Its first commit is a **checkpoint of what existed**, not a working app.

| What | Status |
| --- | --- |
| Android app | Not built |
| Supabase database, login, team access | Not created |
| Saving data permanently | Not implemented — the prototype keeps data only while the page is open |
| Background GPS | Not built, never tested on the phone |
| Browser prototype | Version 1I build only (see below) |

### `prototype/property-explorer-prototype-v1I.html`

The only build available to Claude at the time of this commit: the "Property Explorer Prototype" page last published
11 Oct 2026. It is the **Version 1I** era build (green theme, title "Property Explorer"), with sample data,
the Smart Capture review rules (DETECTED / STATED / INFERRED, Confirm / Edit / Reject), local PDF reading with a
bundled pdf.js, Recently deleted, and English / Bahasa Malaysia switching. It does **not** contain the Version 1J–1L
work (voice, Property List redesign, Estate Agent Buddy black-and-gold dashboard, Voice Command).

**Missing from this repository:** the Version 1L file `estate-agent-buddy-prototype.html`, its source code, the
73 automated tests and the Git history with tags v1I–v1L. If you still have that ZIP, it should be added here as
the real starting point.

Open the HTML file in Chrome to try it. Do not enter real client data.

## Source of truth

- Master document: Google Doc "Property Explorer" (owner's Google Drive), Versions 1A–1L, including the
  database design in Appendix A. The full runnable `schema.sql` mentioned there was never committed anywhere
  and is not in this repository yet.
- Requirements audit against the code (12 Oct 2026):
  https://claude.ai/code/artifact/14385105-6804-4bdd-ac48-abbbec8e9a9c

## Next milestone (waiting for the owner's choice)

Either **M1 – GPS Test app** (Version 1D order) or **M1 – Core databases** (decision D32, 11 Oct 2026).
See the "Conflicts" and "Recommended next milestone" sections of the audit.

## Rules for this project

- No paid services, subscriptions or API keys without the owner's explicit approval.
- Nothing is called working until it is tested, and nothing is called tested on the phone until the owner reports it.
- A tagged Git checkpoint before every major change.
