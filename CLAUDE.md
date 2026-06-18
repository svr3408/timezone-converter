# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page timezone converter: pick a time in one zone, see it in another. Pure vanilla HTML/CSS/JS — no framework, no build step, no dependencies. Three source files: `index.html`, `style.css`, `script.js`.

## Running

Open `index.html` in a browser, or serve the directory statically. There is no build, lint, or package manager config.

## Architecture

`script.js` is split into two halves, and the split is load-bearing:

- **Pure functions (top of file, no DOM).** `getOffset`, `wallTimeToEpoch`, `formatInZone`, `formatOffsetDiff`, `parseDateTimeLocal`, `nowValueInZone`. These are verified by loading the file via `eval()` in Node. That is why the file has **no `'use strict'`** — strict-mode eval would hide the top-level function declarations from the verifier. Keep these functions DOM-free and keep them as top-level declarations.
- **DOM wiring (`initApp`).** Runs only when `document` exists. Guards on `Intl.supportedValuesOf` and shows an update-browser message on older engines.

### Key invariants

- **All timezone math uses `Intl.DateTimeFormat`** — no offset tables, no date library. The browser's IANA database is the single source of truth.
- **`wallTimeToEpoch` uses two offset passes** to handle DST. A wall time inside a spring-forward gap won't fully converge; two passes deterministically maps it to the pre-gap reading (accepted as "a nearby valid moment"). Don't "fix" this into a loop.
- **Active zones (`sourceZone`/`targetZone` vars) are the source of truth, not the input values.** Inputs can hold invalid free text. Each datalist option's value is the full label `Zone (UTC±HH:MM)`; `resolveZone` maps an input string back to the bare IANA name (accepting either the full label or a bare zone name) via the `labelToZone`/`zoneToLabel` maps. On `input`, a zone is applied only when `resolveZone` returns non-null; on `change` (blur/enter), leftover non-matching text sets `aria-invalid="true"` on the input. Validity has a single source of truth — the `aria-invalid` attribute. JS only toggles that attribute; `style.css` keys the error border and message off `[aria-invalid="true"]` (no separate CSS modifier class).
- **Offsets in the picker labels are computed once at load (`Date.now()`)** and can drift across DST. That's accepted — they're a picker hint. `localStorage` stores the bare IANA zone, never the label, so persistence is immune to the drift.
- **Minus sign in offsets is U+2212 (`−`), not ASCII `-`** — matches the design.
- Zone choices persist in `localStorage` (`tz-converter-source`/`tz-converter-target`), wrapped in try/catch so private mode degrades gracefully.

## Conventions

- CSS classes follow **BEM**.
