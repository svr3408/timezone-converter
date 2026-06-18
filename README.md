# Timezone Converter

A single-page timezone converter: pick a time in one zone and instantly see it in another.

**Live demo:** https://svr3408.github.io/timezone-converter/

## Features

- Convert a wall-clock time between any two IANA timezones.
- Type-ahead zone picker with current UTC offsets.
- "Now" button to fill in the current time, and a swap button to flip source and target.
- Handles daylight saving time correctly — all math uses the browser's `Intl.DateTimeFormat`, so the IANA database is the single source of truth.
- Your zone choices persist between visits via `localStorage`.

## Tech

Pure vanilla HTML, CSS, and JavaScript. No framework, no build step, no dependencies.

## Running

Open `index.html` in a browser, or serve the directory statically. There is no build step.
