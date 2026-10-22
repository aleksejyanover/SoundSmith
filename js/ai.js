/* ============ SoundSmith — ИИ-композитор и чат Talking ============ */
"use strict";

/* --- стили и теория --- */
const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const ROOT_WORDS = { "до": "C", "ре": "D", "ми": "E", "фа": "F", "соль": "G", "ля": "A", "си": "B" };

const AI_STYLES = {
  pop:   { label: "Поп",   scale: "major", prog: [0, 4, 5, 3], bpm: 105, density: 0.55,
           drums: [[0,0],[0,8],[1,4],[1,12],[2,0],[2,2],[2,4],[2,6],[2,8],[2,10],[2,12],[2,14]] },
  lofi:  { label: "Лоу-фай", scale: "minor", prog: [0, 5, 2, 6], bpm: 80, density: 0.38,
           drums: [[0,0],[0,10],[1,4],[1,12],[2,2],[2,6],[2,10],[2,14]] },
  edm:   { label: "EDM",   scale: "minor", prog: [5, 3, 0, 4], bpm: 128, density: 0.62,
           drums: [[0,0],[0,4],[0,8],[0,12],[1,4],[1,12],[2,2],[2,6],[2,10],[2,14],[3,15]] },
  rock:  { label: "Рок",   scale: "minor", prog: [0, 6, 5, 4], bpm: 120, density: 0.5,
           drums: [[0,0],[0,6],[0,8],[1,4],[1,12],[2,0],[2,2],[2,4],[2,6],[2,8],[2,10],[2,12],[2,14]] },
  chill: { label: "Чилл",  scale: "major", prog: [0, 3, 4, 4], bpm: 90,  density: 0.32,
           drums: [[0,0],[0,8],[1,12],[2,2],[2,6],[2,10],[2,14]] }
};

const PRICES = { song: 20, section: 10, melody: 8, drums: 5 };

const ROOT_NAMES = { C: "до", D: "ре", E: "ми", F: "фа", G: "соль", A: "ля", B: "си" };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const intervalOf = (scaleArr, degree) => scaleArr[degree % 7] + 12 * Math.floor(degree / 7);
const chordPcs = (rootPC, scaleArr, degree) =>
  [0, 2, 4].map(o => (rootPC + intervalOf(scaleArr, degree + o)) % 12);

/* --- генерация --- */
function aiGenerate(styleKey, root, minor, kind) {
  const style = AI_STYLES[styleKey];
  const scaleArr = SCALE[minor ? "minor" : "major"];
  const rootPC = ((window.notePc ? window.notePc(root) : 0) + 120) % 12;
  const rng = mulberry32(Date.now() % 100000 + rootPC * 7 + styleKey.length);

  // допустимые строки сетки: ноты выбранной тональности
  const allowed = window.MELODY_ROWS_META
    .filter(r => scaleArr.includes(r.pc))
    .map(r => ({ idx: r.idx, pc: r.pc, midi: r.midi }));

  if (!allowed.length) return null;

  const targetMidi = kind === "chorus" ? 74 : kind === "verse" ? 69 : 64;
  let cur = allowed.reduce((b, r) => Math.abs(r.midi - targetMidi) < Math.abs(b.midi - targetMidi) ? r : b, allowed[0]);

  const melody = window.zerosLike();
  for (let s = 0; s < 16; s++) {
    const strong = s % 4 === 0;
    const play = strong ? rng() < 0.92 : rng() < style.density;
    if (!play) continue;
    const chord = chordPcs(rootPC, scaleArr, style.prog[Math.floor(s / 4) % 4]);
    const pool = strong ? allowed.filter(r => chord.includes(r.pc)) : allowed;
    if (!pool.length) continue;
    let best = pool[0], bestScore = Infinity;
    pool.forEach(r => {
      const score = Math.abs(r.midi - cur.midi) + rng() * 7;
      if (score < bestScore) { bestScore = score; best = r; }
    });
    melody[best.idx][s] = true;
    cur = best.midi + (kind === "chorus" && rng() < 0.12 ? 12 : 0);
  }

  // ритм
  const drums = window.zerosDrums();
  let dT = style.drums.map(p => p.slice());
  if (kind === "intro") dT = dT.filter(p => p[0] === 2 || (p[0] === 0 && p[1] === 0));
  if (kind === "chorus" && !dT.some(p => p[0] === 3)) dT.push([3, 14]);
  dT.forEach(([t, s]) => { drums[t][s] = true; });

  return { melody, drums, bpm: style.bpm };
}

/* --- разбор запроса --- */
function aiParse(text) {
  const t = text.toLowerCase();
  let style = null;
  if (/лоф|лоу|lo-?fi/.test(t)) style = "lofi";
  else if (/edm|эдэм|электро|танц|клуб|dance/.test(t)) style = "edm";
  else if (/рок|rock|гитар/.test(t)) style = "rock";
  else if (/чилл|спокойн|мягк|тих|chill|расслаб/.test(t)) style = "chill";
  else if (/поп|pop|хит|радио/.test(t)) style = "pop";

  // тональность: «в тональности соль», «ре-минор», «ля минор», «ре-миноре»
  const keyRe = /тональност[а-яё]*\s+(?:в\s+|на\s+)?(до|ре|ми|фа|соль|ля|си|[a-g])(?![а-яё])/i;
  const wordRe = /(?:^|\s)(?:в\s+|на\s+)?(до|ре|ми|фа|соль|ля|си|[a-g])(?=[\s\-.]|$)/i;
  let root = null, keyMinor = null;
  const km = keyRe.exec(t) || wordRe.exec(t);
  if (km) {
    const w = km[1].toLowerCase();
    root = ROOT_WORDS[w] || (/^[a-g]$/.test(w) ? w.toUpperCase() : null);
    const tail = t.slice(km.index, km.index + km[0].length + 16);
    if (/минор/.test(tail)) keyMinor = true;
    else if (/мажор/.test(tail)) keyMinor = false;
  }

  const minorAsk = /минор|мрачн|грустн|тёмн|темн/.test(t);
  const majorAsk = /мажор|вес[её]л|ярк|светл/.test(t);
  const minor = keyMinor != null ? keyMinor : (minorAsk && !majorAsk ? true : (majorAsk ? false : null));

  let action = null;
  if (/песн|трек|вс[её] целиком|целиком|альбом|создай музыку|напиши песн/.test(t)) action = "song";
  else if (/припев/.test(t)) action = "chorus";
  else if (/куплет/.test(t)) action = "verse";
  else if (/интро|вступлен/.test(t)) action = "intro";
  else if (/бит|ритм|барабан|дром|beat|драм/.test(t)) action = "drums";
  else if (/мелод|мотив|линию/.test(t)) action = "melody";

  return { style, root, minor, action };
}

/* --- чат --- */
const AiChat = {
  log: null, input: null, rec: null, busy: false,

  init() {
    this.log = document.getElementById("chatLog");
    this.input = document.getElementById("chatInput");
    if (!this.log) return;

    document.getElementById("btnSend").addEventListener("click", () => this.submit());
    this.input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.submit(); });
    document.querySelectorAll("[data-quick]").forEach(b => {
      b.addEventListener("click", () => { this.input.value = b.dataset.quick; this.submit(); });
    });
    document.getElementById("btnBonusAi").addEventListener("click", () => this.bonus());

    // голосовой ввод
    const btnVoice = document.getElementById("btnVoice");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      this.rec = new SR();
      this.rec.lang = "ru-RU";
      this.rec.interimResults = false;
      this.rec.maxAlternatives = 1;
      this.rec.onresult = (e) => {
        this.input.value = e.results[0][0].transcript;
        this.submit();
      };
      this.rec.onend = () => btnVoice.classList.remove("rec");
      btnVoice.addEventListener("click", () => {
        try { this.rec.start(); btnVoice.classList.add("rec"); this.say("🎙 Слушаю… говори!"); }
        catch (e) { this.say("Микрофон уже занят, попробуй ещё раз"); }
      });
    } else {
      btnVoice.addEventListener("click", () => {
        this.say("Этот браузер не поддерживает голосовой ввод 😔 Попробуй Chrome — или просто напиши текстом.");
      });
    }

    this.say("Привет! Я твой ИИ-музыкант 🤖🎧 Напиши, что сделать: «сделай лоу-фай припев», «поп-песня в тональности соль», «эдэм бит» — или нажми готовую кнопку. Пиши и голосом (🎙).");
    this.refreshBalance();
  },

  refreshBalance() {
    const el = document.getElementById("aiBalance");
    if (!el) return;
    el.innerHTML = Accounts.current
      ? `🪙 <b>${Accounts.tokens()}</b> Talking<br><small>${Accounts.current}</small>`
      : `🪙 <b>${Accounts.tokens()}</b> Talking<br><small>гость — Talking появятся в аккаунте</small>`;
  },

  say(text, who) {
    const div = document.createElement("div");
    div.className = "msg " + (who || "bot");
    div.innerHTML = text;
    this.log.appendChild(div);
    this.log.scrollTop = this.log.scrollHeight;
  },

  bonus() {
    try {
      const total = Accounts.bonus();
      this.say(`🎁 Бонус получен! Счёт пополнился, теперь у тебя <b>${total}</b> Talking. Возвращайся завтра за новыми!`);
    } catch (e) {
      this.say("🎁 " + e.message);
    }
  },

  submit() {
    if (this.busy) return;
    const text = (this.input.value || "").trim();
    if (!text) return;
    this.input.value = "";
    this.say(escapeChat(text), "me");
    this.handle(text);
  },

  handle(text) {
    if (!Accounts.current) {
      this.say("Чтобы делать музыку с ИИ, зайди в аккаунт — вкладка <b>👤 Аккаунт</b>. Это бесплатно, без интернет-сервера, и я сразу дам тебе <b>60 Talking</b> на старт! 🎁");
      return;
    }
    const req = aiParse(text);

    // стиль по умолчанию
    const keys = Object.keys(AI_STYLES);
    const styleKey = req.style || keys[Math.floor(Math.random() * keys.length)];
    const style = AI_STYLES[styleKey];
    const minor = req.minor == null ? (style.scale === "minor") : req.minor;
    const root = req.root || ["C", "D", "E", "F", "G", "A"][Math.floor(Math.random() * 6)];
    const keyName = ROOT_NAMES[root] + (minor ? "-минор" : "-мажор");

    const S = window.SoundSmith;
    if (!S) return;

    try {
      if (!req.action) {
        if (req.style || req.root || req.minor != null) req.action = "song";
        else {
          this.say("Не совсем понял 😅 Могу сделать: целую <b>песню</b>, <b>куплет</b>, <b>припев</b>, <b>интро</b>, <b>мелодию</b> или <b>бит</b>. Скажи стиль (поп, лоу-фай, EDM, рок, чилл) и, если хочешь, тональность.");
          return;
        }
      }

      if (req.action === "drums") {
        S.spend(PRICES.drums, "бит");
        const gen = aiGenerate(styleKey, root, minor, "verse");
        const sec = S.currentSection();
        sec.drums = gen.drums;
        S.setBpm(gen.bpm);
        S.renderAll();
        S.save();
        this.say(`🥁 Готово! Залил ${style.label}-бит в текущую секцию «${escapeChat(sec.name)}», темп ${gen.bpm} BPM. Потратил <b>${PRICES.drums}</b> Talking. Нажми <b>▶ Играть</b>!`);
        return;
      }

      if (req.action === "melody") {
        S.spend(PRICES.melody, "мелодия");
        const gen = aiGenerate(styleKey, root, minor, "verse");
        const sec = S.currentSection();
        sec.melody = gen.melody;
        S.renderAll();
        S.save();
        this.say(`🎵 Нарисовал мелодию в тональности <b>${keyName}</b>, стиль ${style.label} — в секцию «${escapeChat(sec.name)}». Стоимость: <b>${PRICES.melody}</b> Talking.`);
        return;
      }

      if (req.action === "song") {
        S.spend(PRICES.song, "целая песня");
        S.setBpm(style.bpm);
        const kinds = [["intro", "Интро"], ["verse", "Куплет"], ["chorus", "Припев"]];
        const secs = kinds.map(([kind, name]) => {
          const gen = aiGenerate(styleKey, root, minor, kind);
          return S.makeAiSection(`${name} (${style.label})`, gen);
        });
        S.replaceAllSections(secs);
        this.say(`🎶 Собрал целую песню: интро, куплет и припев в стиле <b>${style.label}</b>, тональность <b>${keyName}</b>, темп ${style.bpm} BPM. Потратил <b>${PRICES.song}</b> Talking. Жми <b>▶ Играть</b>!`);
        return;
      }

      // секция: chorus / verse / intro
      const kindName = { chorus: ["chorus", "Припев"], verse: ["verse", "Куплет"], intro: ["intro", "Интро"] }[req.action];
      S.spend(PRICES.section, "секция");
      const gen = aiGenerate(styleKey, root, minor, kindName[0]);
      const sec = S.makeAiSection(`${kindName[1]} (${style.label})`, gen);
      S.addSections([sec]);
      S.setBpm(gen.bpm);
      this.say(`✨ Добавил секцию «${escapeChat(sec.name)}» в тональности <b>${keyName}</b>. Она уже в конце песни — жми <b>▶ Играть</b>. Потратил <b>${PRICES.section}</b> Talking.`);
    } catch (e) {
      this.say("🪙 " + escapeChat(e.message));
    }
  }
};

function escapeChat(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.addEventListener("DOMContentLoaded", () => AiChat.init());
