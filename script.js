// No 'use strict': the file is loaded via eval() in Node verification checks,
// and strict-mode eval would hide these top-level function declarations.

/* ---------- pure functions (no DOM) ---------- */

// UTC offset of `timeZone` at the moment `epochMs`, in minutes.
function getOffset(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(epochMs);
  const token = parts.find((p) => p.type === 'timeZoneName').value;
  const m = token.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  if (!m) return 0; // plain "GMT" means UTC
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
}

// Wall-clock parts {year, month (1-12), day, hour, minute} in `timeZone` -> UTC epoch ms.
// Two passes handle DST transitions: the offset at the naive guess may differ
// from the offset at the corrected moment. Wall times inside a spring-forward
// gap (e.g. 02:30 on the skip night) don't converge in any number of passes;
// two passes deterministically map them to the pre-gap reading, which the spec
// accepts as "a nearby valid moment".
function wallTimeToEpoch(parts, timeZone) {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const guess = naive - getOffset(naive, timeZone) * 60000;
  return naive - getOffset(guess, timeZone) * 60000;
}

// Epoch ms -> { time: "10:30 AM", date: "Friday, June 12, 2026" } in `timeZone`.
function formatInZone(epochMs, timeZone) {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit',
  }).format(epochMs);
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(epochMs);
  return { time, date };
}

// Minutes -> "+3h", "−5h 30m", "0h" (U+2212 minus, as in the design).
function formatOffsetDiff(minutes) {
  if (minutes === 0) return '0h';
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h}h ${m}m` : `${sign}${h}h`;
}

// "2026-06-12T17:30" -> {year, month, day, hour, minute}, or null if unparseable.
function parseDateTimeLocal(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  return {
    year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5],
  };
}

// Current moment as a datetime-local value ("2026-06-12T17:30") in `timeZone`,
// so "now" stays correct when the source zone differs from the device zone.
function nowValueInZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(Date.now());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/* ---------- DOM wiring ---------- */

if (typeof document !== 'undefined') {
  if (typeof Intl.supportedValuesOf !== 'function') {
    document.body.innerHTML = '<p class="message message--error">Please update your browser.</p>';
  } else {
    initApp();
  }
}

function initApp() {
  const STORAGE_SOURCE = 'tz-converter-source';
  const STORAGE_TARGET = 'tz-converter-target';

  const sourceInput = document.getElementById('source-zone');
  const targetInput = document.getElementById('target-zone');
  const timeInput = document.getElementById('time-input');
  const nowBtn = document.getElementById('now-btn');
  const swapBtn = document.getElementById('swap-btn');
  const resultTime = document.getElementById('result-time');
  const resultDate = document.getElementById('result-date');
  const resultOffset = document.getElementById('result-offset');
  const datalist = document.getElementById('zones');

  const zones = new Set(Intl.supportedValuesOf('timeZone'));
  zones.add('UTC'); // UTC is always a valid Intl timezone even if absent from supportedValuesOf
  for (const zone of zones) {
    const opt = document.createElement('option');
    opt.value = zone;
    datalist.appendChild(opt);
  }

  // Active zones are the source of truth; inputs may hold invalid free text.
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let sourceZone = restoreZone(STORAGE_SOURCE, localZone);
  let targetZone = restoreZone(STORAGE_TARGET, 'America/New_York');

  sourceInput.value = sourceZone;
  targetInput.value = targetZone;
  timeInput.value = nowValueInZone(sourceZone);

  function restoreZone(key, fallback) {
    try {
      const saved = localStorage.getItem(key);
      return saved && zones.has(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  }

  function update() {
    const parts = parseDateTimeLocal(timeInput.value);
    if (!parts) {
      resultTime.textContent = '—';
      resultDate.textContent = 'Enter a time to see the result';
      resultOffset.textContent = '';
      return;
    }
    const epoch = wallTimeToEpoch(parts, sourceZone);
    const { time, date } = formatInZone(epoch, targetZone);
    const diff = getOffset(epoch, targetZone) - getOffset(epoch, sourceZone);
    resultTime.textContent = time;
    resultDate.textContent = date;
    resultOffset.textContent = `${formatOffsetDiff(diff)} from your zone`;
  }

  timeInput.addEventListener('input', update);

  function saveZone(key, zone) {
    try {
      localStorage.setItem(key, zone);
    } catch {
      // Storage blocked (e.g. private mode): zone choice just won't persist.
    }
  }

  function bindZoneInput(input, setZone, storageKey) {
    // While typing: apply only exact matches, silently.
    input.addEventListener('input', () => {
      if (zones.has(input.value)) {
        setZone(input.value);
        saveZone(storageKey, input.value);
        input.classList.remove('combobox__input--invalid');
        input.removeAttribute('aria-invalid');
        update();
      }
    });
    // On blur/enter: mark leftover non-matching text as invalid.
    input.addEventListener('change', () => {
      const invalid = !zones.has(input.value);
      input.classList.toggle('combobox__input--invalid', invalid);
      input.setAttribute('aria-invalid', invalid);
    });
  }

  bindZoneInput(sourceInput, (z) => { sourceZone = z; }, STORAGE_SOURCE);
  bindZoneInput(targetInput, (z) => { targetZone = z; }, STORAGE_TARGET);

  nowBtn.addEventListener('click', () => {
    timeInput.value = nowValueInZone(sourceZone);
    update();
  });

  swapBtn.addEventListener('click', () => {
    [sourceZone, targetZone] = [targetZone, sourceZone];
    sourceInput.value = sourceZone;
    targetInput.value = targetZone;
    sourceInput.classList.remove('combobox__input--invalid');
    targetInput.classList.remove('combobox__input--invalid');
    sourceInput.removeAttribute('aria-invalid');
    targetInput.removeAttribute('aria-invalid');
    saveZone(STORAGE_SOURCE, sourceZone);
    saveZone(STORAGE_TARGET, targetZone);
    update();
  });

  update();
}
