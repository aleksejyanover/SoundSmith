/* ============ SoundSmith — приложение ============ */
"use strict";

/* --- константы --- */
const STEPS = 16;
const MELODY_ROWS = ["C6","B5","A5","G5","F5","E5","D5","C5","B4","A4","G4","F4","E4","D4","C4"];
const DRUM_KEYS  = ["kick","snare","hat","clap"];
const DRUM_LABELS = ["Бочка", "Малый", "Хэт", "Хлопок"];

const DRUM_TEMPLATE = [[0,0],[0,8],[1,4],[1,12],[2,0],[2,2],[2,4],[2,6],[2,8],[2,10],[2,12],[2,14]];
const DRUM_FULL = DRUM_TEMPLATE.concat([[0,10],[3,14]]);
const MOTIF_A = [[14,0],[12,2],[10,4],[12,6],[7,8],[9,10],[10,12],[14,14]];
const MOTIF_B = [[7,0],[9,2],[10,4],[12,6],[7,8],[10,10],[9,12],[5,14]];

/* --- состояние --- */
let idSeq = 0;
const zeros = (r, c) => Array.from({ length: r }, () => Array(c).fill(false));

function makeSection(name, drumT, motif) {
  const m = zeros(MELODY_ROWS.length, STEPS);
  const d = zeros(DRUM_KEYS.length, STEPS);
  (drumT || []).forEach(([t, s]) => { d[t][s] = true; });
  (motif || []).forEach(([r, s]) => { m[r][s] = true; });
  return { id: "sec" + (++idSeq), name, melody: m, drums: d };
}

function defaultState() {
  idSeq = 0;
  const intro  = makeSection("Интро",  DRUM_TEMPLATE, null);
  const verse  = makeSection("Куплет", DRUM_TEMPLATE, MOTIF_A);
  const chorus = makeSection("Припев", DRUM_FULL,     MOTIF_B);
  return {
    bpm: 100,
    waveform: "sawtooth",
    songName: "Моя первая песня",
    mix: { melody: 0.8, drums: 0.85, piano: 0.9, delay: 0.25, master: 0.9, pianoEcho: true },
    sections: [intro, verse, chorus],
    currentId: verse.id
  };
}

function normalizeState(s) {
  if (!s || !s.sections || !s.sections.length) return defaultState();
  if (!s.mix) s.mix = defaultState().mix;
  if (!s.bpm) s.bpm = 100;
  if (!s.sections.some(x => x.id === s.currentId)) s.currentId = s.sections[0].id;
  idSeq = 0;
  s.sections.forEach(x => {
    const n = parseInt(String(x.id).replace("sec", ""), 10);
    if (n > idSeq) idSeq = n;
  });
  return s;
}

let state = normalizeState(loadState());

const currentSection = () => state.sections.find(s => s.id === state.currentId) || state.sections[0];

/* --- DOM --- */
const $ = (sel) => document.querySelector(sel);
const btnPlay = $("#btnPlay"), btnStop = $("#btnStop"), posEl = $("#position");
const audioStatus = $("#audioStatus"), saveStatus = $("#saveStatus");
const melodyGrid = $("#melodyGrid"), drumGrid = $("#drumGrid");
const arrangementEl = $("#arrangement"), sectionNameInput = $("#sectionName");

/* ============ автосохранение ============ */
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(Accounts.songKey(), JSON.stringify(state));
      if (saveStatus) saveStatus.textContent = "сохранено: только что";
    } catch (e) { /* нет места — не критично */ }
  }, 400);
}
function loadState() {
  try {
    const raw = localStorage.getItem(Accounts.songKey());
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/* смена аккаунта — подгружаем его песню */
Accounts.onChange(() => {
  stopPlay();
  state = normalizeState(loadState());
  renderAll();
  applyMix();
});

/* ============ микшер ============ */
function applyMix() {
  if (Audio.ctx) {
    Audio.setMix({
      melody: state.mix.melody,
      drums: state.mix.drums,
      piano: state.mix.piano,
      master: state.mix.master,
      delay: state.mix.pianoEcho ? state.mix.delay : 0,
      melodyDelay: state.mix.delay
    });
  }
}
function bindMixer() {
  const items = [
    ["mixMelody", "valMelody", "melody"],
    ["mixDrums", "valDrums", "drums"],
    ["mixPiano", "valPiano", "piano"],
    ["mixDelay", "valDelay", "delay"],
    ["mixMaster", "valMaster", "master"]
  ];
  items.forEach(([id, valId, key]) => {
    const el = document.getElementById(id), val = document.getElementById(valId);
    el.value = Math.round((state.mix[key] || 0) * 100);
    val.textContent = el.value;
    el.addEventListener("input", () => {
      state.mix[key] = el.value / 100;
      val.textContent = el.value;
      applyMix();
      save();
    });
  });
}

/* ============ сетки ============ */
function buildLabels() {
  $("#noteLabels").innerHTML = MELODY_ROWS.map(n => `<div class="nl">${n}</div>`).join("");
  $("#drumLabels").innerHTML = DRUM_LABELS.map(n => `<div class="nl">${n}</div>`).join("");
}

function renderGrids() {
  const sec = currentSection();

  melodyGrid.innerHTML = sec.melody.map((row, r) =>
    `<div class="rowline">` + row.map((on, c) =>
      `<div class="cell${on ? " on" : ""}${c % 4 === 0 ? " beat" : ""}" data-r="${r}" data-c="${c}"></div>`
    ).join("") + `</div>`
  ).join("");

  drumGrid.innerHTML = sec.drums.map((row, t) =>
    `<div class="rowline">` + row.map((on, c) =>
      `<div class="cell${on ? " on" : ""}${c % 4 === 0 ? " beat" : ""}" data-t="${t}" data-c="${c}" data-track="${t}"></div>`
    ).join("") + `</div>`
  ).join("");
}

let painting = false, paintVal = false;

function previewCell(cell) {
  const ctx = Audio.resume();
  applyMix();
  if (cell.dataset.r != null) {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    if (currentSection().melody[r][c]) {
      Audio.note(noteFreq(MELODY_ROWS[r]), ctx.currentTime, 0.3, {
        ctx, dest: Audio.melodyBus, wave: state.waveform, vol: 0.3
      });
    }
  } else {
    const t = +cell.dataset.t, c = +cell.dataset.c;
    if (currentSection().drums[t][c]) Audio.drum(DRUM_KEYS[t], ctx.currentTime, Audio.drumBus, ctx);
  }
}

function toggleCell(cell, val) {
  const sec = currentSection();
  if (cell.dataset.r != null) {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    sec.melody[r][c] = val;
    if (val) previewCell(cell);
  } else {
    const t = +cell.dataset.t, c = +cell.dataset.c;
    sec.drums[t][c] = val;
    if (val) previewCell(cell);
  }
  cell.classList.toggle("on", val);
  save();
}

function bindGrid(grid) {
  grid.addEventListener("mousedown", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    e.preventDefault();
    painting = true;
    paintVal = !cell.classList.contains("on");
    toggleCell(cell, paintVal);
  });
  grid.addEventListener("mouseover", (e) => {
    if (!painting) return;
    const cell = e.target.closest(".cell");
    if (cell) toggleCell(cell, paintVal);
  });
}
window.addEventListener("mouseup", () => { painting = false; });

/* ============ секции и структура ============ */
function renderPickers() {
  const html = state.sections.map(s =>
    `<button class="chip${s.id === state.currentId ? " active" : ""}" data-id="${s.id}">${s.name}</button>`
  ).join("");
  document.querySelectorAll(".section-picker").forEach(p => { p.innerHTML = html; });
  document.querySelectorAll(".chip").forEach(ch => {
    ch.addEventListener("click", () => selectSection(ch.dataset.id));
  });
}

function renderArrangement() {
  arrangementEl.innerHTML = state.sections.map((s, i) => `
    <li class="${s.id === state.currentId ? "current" : ""}" data-id="${s.id}">
      <span class="num">${i + 1}</span>
      <span class="nm">${escapeHtml(s.name)}</span>
      <button class="btn mini" data-act="up" title="Выше">↑</button>
      <button class="btn mini" data-act="down" title="Ниже">↓</button>
      <button class="btn mini del" data-act="del" title="Удалить">✕</button>
    </li>`).join("");

  arrangementEl.querySelectorAll("li").forEach(li => {
    li.addEventListener("click", (e) => {
      if (e.target.dataset.act) return;
      selectSection(li.dataset.id);
    });
  });
  arrangementEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      const idx = state.sections.findIndex(s => s.id === li.dataset.id);
      const act = btn.dataset.act;
      if (act === "up" && idx > 0) {
        [state.sections[idx - 1], state.sections[idx]] = [state.sections[idx], state.sections[idx - 1]];
      } else if (act === "down" && idx < state.sections.length - 1) {
        [state.sections[idx + 1], state.sections[idx]] = [state.sections[idx], state.sections[idx + 1]];
      } else if (act === "del") {
        if (state.sections.length === 1) { alert("Нужна хотя бы одна секция!"); return; }
        state.sections.splice(idx, 1);
        if (state.currentId === li.dataset.id) state.currentId = state.sections[Math.max(0, idx - 1)].id;
      } else return;
      renderAll();
      save();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function selectSection(id) {
  state.currentId = id;
  renderPickers();
  renderArrangement();
  renderGrids();
  sectionNameInput.value = currentSection().name;
  save();
}

function renderAll() {
  renderPickers();
  renderArrangement();
  renderGrids();
  sectionNameInput.value = currentSection().name;
  document.getElementById("bpm").value = state.bpm;
  document.getElementById("waveform").value = state.waveform;
  document.getElementById("songName").value = state.songName;
  document.getElementById("pianoEcho").checked = !!state.mix.pianoEcho;
  bindMixerValues();
}

/* обновить значения слайдеров без пересоздания обработчиков */
function bindMixerValues() {
  [["mixMelody", "valMelody", "melody"], ["mixDrums", "valDrums", "drums"],
   ["mixPiano", "valPiano", "piano"], ["mixDelay", "valDelay", "delay"],
   ["mixMaster", "valMaster", "master"]].forEach(([id, valId, key]) => {
    const el = document.getElementById(id);
    el.value = Math.round((state.mix[key] || 0) * 100);
    document.getElementById(valId).textContent = el.value;
  });
}

/* ============ пианино ============ */
const WHITE_NOTES = ["C4","D4","E4","F4","G4","A4","B4","C5","D5","E5","F5","G5","A5","B5","C6"];
const KEY_MAP = {
  a: "C4", w: "C#4", s: "D4", e: "D#4", d: "E4", f: "F4", t: "F#4",
  g: "G4", y: "G#4", h: "A4", u: "A#4", j: "B4", k: "C5", o: "C#5",
  l: "D5", p: "D#5", ";": "E5"
};
const KEY_LABELS = { a: "A", s: "S", d: "D", f: "F", g: "G", h: "H", j: "J", k: "K", l: "L", ";": ";" };
const heldNotes = new Map();

function buildPiano() {
  const piano = $("#piano");
  piano.innerHTML = "";
  const w = 100 / WHITE_NOTES.length;

  WHITE_NOTES.forEach((note, i) => {
    const k = document.createElement("div");
    k.className = "key white";
    k.dataset.note = note;
    k.style.left = (i * w) + "%";
    k.style.width = w + "%";
    const letter = note[0];
    const mapped = Object.keys(KEY_MAP).find(key => KEY_MAP[key] === note && KEY_LABELS[key]);
    k.innerHTML = `<span class="kl"><b>${mapped ? KEY_LABELS[mapped] : ""}</b><small>${note}</small></span>`;
    piano.appendChild(k);

    if (["C", "D", "F", "G", "A"].includes(letter)) {
      const black = document.createElement("div");
      black.className = "key black";
      black.dataset.note = letter + "#" + note.slice(1);
      black.style.width = (w * 0.6) + "%";
      black.style.left = ((i + 1) * w - w * 0.3) + "%";
      piano.appendChild(black);
    }
  });

  piano.addEventListener("pointerdown", (e) => {
    const k = e.target.closest(".key");
    if (!k) return;
    e.preventDefault();
    startLiveNote(k.dataset.note);
  });
  piano.addEventListener("pointerup", (e) => {
    const k = e.target.closest(".key");
    if (k) stopLiveNote(k.dataset.note);
  });
  piano.addEventListener("pointerleave", () => { stopAllLive(); });
  piano.addEventListener("pointercancel", () => { stopAllLive(); });
}

function startLiveNote(note) {
  if (heldNotes.has(note)) return;
  const ctx = Audio.resume();
  applyMix();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const flt = ctx.createBiquadFilter();
  flt.type = "lowpass";
  flt.frequency.value = Math.min(9000, noteFreq(note) * 6 + 900);
  osc.type = state.waveform;
  osc.frequency.value = noteFreq(note);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  osc.connect(flt); flt.connect(g); g.connect(Audio.pianoBus);
  osc.start();
  heldNotes.set(note, { osc, g });
  const el = document.querySelector(`.key[data-note="${CSS.escape(note)}"]`);
  if (el) el.classList.add("active");
  audioStatus.textContent = "звук включён ✓";
  audioStatus.classList.add("on");
}

function stopLiveNote(note) {
  const v = heldNotes.get(note);
  const el = document.querySelector(`.key[data-note="${CSS.escape(note)}"]`);
  if (el) el.classList.remove("active");
  if (!v) return;
  heldNotes.delete(note);
  const t = Audio.ctx.currentTime;
  try {
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(Math.max(v.g.gain.value, 0.0001), t);
    v.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    v.osc.stop(t + 0.3);
  } catch (e) { /* уже остановлен */ }
}
function stopAllLive() { Array.from(heldNotes.keys()).forEach(stopLiveNote); }

document.addEventListener("keydown", (e) => {
  if (e.repeat || e.target.matches("input, textarea, select")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); return; }
  const note = KEY_MAP[e.key.toLowerCase()];
  if (note) startLiveNote(note);
});
document.addEventListener("keyup", (e) => {
  const note = KEY_MAP[e.key.toLowerCase()];
  if (note) stopLiveNote(note);
});

/* ============ воспроизведение ============ */
let playing = false, currentStep = 0, nextTime = 0, timer = null;

const stepDur = () => 60 / state.bpm / 4;
const totalSteps = () => state.sections.length * STEPS;

function startPlay() {
  const ctx = Audio.resume();
  applyMix();
  audioStatus.textContent = "звук включён ✓";
  audioStatus.classList.add("on");
  playing = true;
  if (currentStep >= totalSteps()) currentStep = 0;
  nextTime = ctx.currentTime + 0.06;
  clearInterval(timer);
  timer = setInterval(schedulerTick, 25);
  btnPlay.textContent = "⏸ Пауза";
  btnPlay.classList.add("playing");
}

function pausePlay() {
  playing = false;
  clearInterval(timer);
  btnPlay.textContent = "▶ Играть";
  btnPlay.classList.remove("playing");
  clearPlayhead();
}

function stopPlay() {
  pausePlay();
  currentStep = 0;
  posEl.textContent = "—";
}

function togglePlay() { playing ? pausePlay() : startPlay(); }

function schedulerTick() {
  const ctx = Audio.ctx;
  while (nextTime < ctx.currentTime + 0.12) {
    scheduleStep(currentStep, nextTime);
    nextTime += stepDur();
    currentStep++;
    if (currentStep >= totalSteps()) currentStep = 0;
  }
}

function scheduleStep(g, time) {
  const idx = Math.floor(g / STEPS);
  const local = g % STEPS;
  const sec = state.sections[idx];
  if (!sec) return;
  const d = stepDur();

  sec.melody.forEach((row, r) => {
    if (row[local]) {
      Audio.note(noteFreq(MELODY_ROWS[r]), time, d * 1.8, {
        dest: Audio.melodyBus, wave: state.waveform, vol: 0.26
      });
    }
  });
  DRUM_KEYS.forEach((k, i) => {
    if (sec.drums[i][local]) Audio.drum(k, time, Audio.drumBus);
  });

  const delay = Math.max(0, (time - Audio.ctx.currentTime - 0.01) * 1000);
  setTimeout(() => showPlayhead(idx, local), delay);
}

function clearPlayhead() {
  document.querySelectorAll(".cell.playhead").forEach(c => c.classList.remove("playhead"));
  document.querySelectorAll(".chip.playing").forEach(c => c.classList.remove("playing"));
}

function showPlayhead(sectionIdx, local) {
  if (!playing) return;
  clearPlayhead();
  const sec = state.sections[sectionIdx];
  document.querySelectorAll(".chip").forEach(ch => {
    if (ch.dataset.id === sec.id) ch.classList.add("playing");
  });
  if (sec.id === state.currentId) {
    document.querySelectorAll("#melodyGrid .rowline, #drumGrid .rowline").forEach(row => {
      const c = row.children[local];
      if (c) c.classList.add("playhead");
    });
  }
  posEl.textContent = `${sectionIdx + 1}/${state.sections.length} ${sec.name} · шаг ${local + 1}`;
}

/* ============ экспорт WAV ============ */
async function exportWav() {
  const btn = $("#btnExport");
  btn.classList.add("busy");
  const old = btn.textContent;
  btn.textContent = "⏳ Рендер...";
  try {
    const sr = 44100;
    const d = stepDur();
    const total = state.sections.length * STEPS * d + 1.5;
    const off = new OfflineAudioContext(2, Math.ceil(sr * total), sr);

    const master = off.createGain();
    master.gain.value = state.mix.master;
    master.connect(off.destination);

    const mkBus = () => { const g = off.createGain(); g.connect(master); return g; };
    const melodyBus = mkBus(), drumBus = mkBus(), pianoBus = mkBus();
    melodyBus.gain.value = state.mix.melody;
    drumBus.gain.value = state.mix.drums;
    pianoBus.gain.value = state.mix.piano;

    if (state.mix.delay > 0) {
      const send = off.createGain(); send.gain.value = state.mix.delay;
      const dl = off.createDelay(1.5); dl.delayTime.value = 0.28;
      const fb = off.createGain(); fb.gain.value = 0.35;
      melodyBus.connect(send); pianoBus.connect(send);
      send.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(master);
    }

    state.sections.forEach((sec, si) => {
      const base = si * STEPS * d;
      sec.melody.forEach((row, r) => row.forEach((on, c) => {
        if (on) {
          Audio.note(noteFreq(MELODY_ROWS[r]), base + c * d, d * 1.8, {
            ctx: off, dest: melodyBus, wave: state.waveform, vol: 0.26
          });
        }
      }));
      sec.drums.forEach((row, t) => row.forEach((on, c) => {
        if (on) Audio.drum(DRUM_KEYS[t], base + c * d, drumBus, off);
      }));
    });

    const buf = await off.startRendering();
    const blob = encodeWav(buf);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const nm = (state.songName || "песня").replace(/[\\/:*?"<>|]/g, "_");
    a.download = nm + ".wav";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    btn.textContent = "✅ Готово!";
    if (Accounts.current) Accounts.earn(5);
    setTimeout(() => { btn.textContent = old; btn.classList.remove("busy"); }, 1800);
  } catch (err) {
    console.error(err);
    btn.textContent = "Ошибка — попробуй ещё";
    setTimeout(() => { btn.textContent = old; btn.classList.remove("busy"); }, 2200);
  }
}

/* ============ вкладки ============ */
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

/* ============ кнопки и поля ============ */
btnPlay.addEventListener("click", togglePlay);
btnStop.addEventListener("click", stopPlay);

$("#bpm").addEventListener("change", (e) => {
  state.bpm = Math.min(200, Math.max(60, parseInt(e.target.value, 10) || 100));
  e.target.value = state.bpm;
  save();
});
$("#waveform").addEventListener("change", (e) => { state.waveform = e.target.value; save(); });
$("#songName").addEventListener("input", (e) => { state.songName = e.target.value; save(); });
$("#pianoEcho").addEventListener("change", (e) => { state.mix.pianoEcho = e.target.checked; applyMix(); save(); });

$("#btnArpeggio").addEventListener("click", () => {
  const ctx = Audio.resume();
  applyMix();
  const d = stepDur();
  const t0 = ctx.currentTime + 0.05;
  MOTIF_A.forEach(([r, s]) => {
    Audio.note(noteFreq(MELODY_ROWS[r]), t0 + s * d, d * 1.7, {
      ctx, dest: Audio.melodyBus, wave: state.waveform, vol: 0.28
    });
  });
});

document.querySelectorAll("[data-clear]").forEach(btn => {
  btn.addEventListener("click", () => {
    const sec = currentSection();
    if (btn.dataset.clear === "melody") sec.melody = zeros(MELODY_ROWS.length, STEPS);
    else sec.drums = zeros(DRUM_KEYS.length, STEPS);
    renderGrids();
    save();
  });
});
document.querySelectorAll("[data-template]").forEach(btn => {
  btn.addEventListener("click", () => {
    const sec = currentSection();
    if (btn.dataset.template === "melody") {
      MOTIF_A.forEach(([r, s]) => { sec.melody[r][s] = true; });
    } else {
      DRUM_TEMPLATE.forEach(([t, s]) => { sec.drums[t][s] = true; });
    }
    renderGrids();
    save();
  });
});

$("#btnAddSection").addEventListener("click", () => {
  const sec = makeSection("Секция " + (state.sections.length + 1), DRUM_TEMPLATE, null);
  state.sections.push(sec);
  state.currentId = sec.id;
  renderAll();
  save();
});
$("#btnDuplicate").addEventListener("click", () => {
  const cur = currentSection();
  const copy = JSON.parse(JSON.stringify(cur));
  copy.id = "sec" + (++idSeq);
  copy.name = cur.name + " (копия)";
  const idx = state.sections.findIndex(s => s.id === cur.id);
  state.sections.splice(idx + 1, 0, copy);
  state.currentId = copy.id;
  renderAll();
  save();
});
$("#btnRename").addEventListener("click", () => {
  const v = sectionNameInput.value.trim();
  if (!v) return;
  currentSection().name = v;
  renderAll();
  save();
});

$("#btnExport").addEventListener("click", exportWav);
$("#btnSave").addEventListener("click", () => {
  try {
    localStorage.setItem(Accounts.songKey(), JSON.stringify(state));
    saveStatus.textContent = "сохранено в браузер ✓";
  } catch (e) { saveStatus.textContent = "не удалось сохранить"; }
});
$("#btnLoad").addEventListener("click", () => {
  const s = loadState();
  if (!s) { saveStatus.textContent = "сохранений нет"; return; }
  state = s;
  if (!state.mix) state.mix = defaultState().mix;
  renderAll();
  applyMix();
  saveStatus.textContent = "загружено ✓";
});
$("#btnReset").addEventListener("click", () => {
  if (!confirm("Сбросить песню до примера?")) return;
  stopPlay();
  state = defaultState();
  try { localStorage.removeItem(Accounts.songKey()); } catch (e) {}
  renderAll();
  applyMix();
  saveStatus.textContent = "сброшено";
});

/* ============ старт ============ */
buildLabels();
buildPiano();
bindGrid(melodyGrid);
bindGrid(drumGrid);
bindMixer();
renderAll();
applyMix();

/* ============ API для ИИ-модуля и аккаунтов ============ */
window.notePc = (name) => NOTE_BASE[name] % 12;
window.MELODY_ROWS_META = MELODY_ROWS.map((n, idx) => ({
  name: n, idx, pc: noteToMidi(n) % 12, midi: noteToMidi(n)
}));
window.zerosLike = () => zeros(MELODY_ROWS.length, STEPS);
window.zerosDrums = () => zeros(DRUM_KEYS.length, STEPS);

window.SoundSmith = {
  currentSection,
  renderAll,
  save,
  applyMix,
  spend: (n, what) => Accounts.spend(n, what),

  setBpm(v) {
    state.bpm = Math.min(200, Math.max(60, Math.round(v)));
    document.getElementById("bpm").value = state.bpm;
    save();
  },

  makeAiSection(name, gen) {
    const sec = makeSection(name, null, null);
    if (gen) {
      sec.melody = gen.melody;
      sec.drums = gen.drums;
    }
    return sec;
  },

  addSections(arr) {
    state.sections.push(...arr);
    state.currentId = arr[arr.length - 1].id;
    renderAll();
    save();
  },

  replaceAllSections(arr) {
    state.sections = arr;
    state.currentId = arr[0].id;
    renderAll();
    save();
  }
};
