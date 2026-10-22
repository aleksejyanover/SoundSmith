/* ============ SoundSmith — аккаунты и валюта Talking ============ */
"use strict";

const Accounts = {
  DB_KEY: "ss_accounts_v1",
  CUR_KEY: "ss_current_v1",
  START_TOKENS: 60,
  BONUS_TOKENS: 25,
  db: {},
  current: null,
  _listeners: [],

  load() {
    try { this.db = JSON.parse(localStorage.getItem(this.DB_KEY) || "{}"); }
    catch (e) { this.db = {}; }
    this.current = localStorage.getItem(this.CUR_KEY) || null;
    if (this.current && !this.db[this.current]) this.current = null;
  },

  persist() {
    try {
      localStorage.setItem(this.DB_KEY, JSON.stringify(this.db));
      if (this.current) localStorage.setItem(this.CUR_KEY, this.current);
      else localStorage.removeItem(this.CUR_KEY);
    } catch (e) { /* приватный режим браузера */ }
  },

  onChange(fn) { this._listeners.push(fn); },
  changed() { this._listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); },

  async hash(pass, nick) {
    const data = new TextEncoder().encode(nick + "::" + pass);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  },

  async register(nick, pass) {
    nick = String(nick || "").trim();
    if (nick.length < 2) throw new Error("Ник минимум 2 символа");
    if (!/^[\wа-яё\- ]+$/i.test(nick)) throw new Error("Ник: буквы, цифры, пробел и дефис");
    if (String(pass || "").length < 3) throw new Error("Пароль минимум 3 символа");
    if (this.db[nick]) throw new Error("Такой ник уже занят — войди вместо него");
    this.db[nick] = {
      passHash: await this.hash(pass, nick),
      tokens: this.START_TOKENS,
      lastBonus: "",
      created: Date.now()
    };
    this.current = nick;
    this.persist();
    this.changed();
    return this.START_TOKENS;
  },

  async login(nick, pass) {
    nick = String(nick || "").trim();
    const acc = this.db[nick];
    if (!acc) throw new Error("Нет такого аккаунта");
    if (acc.passHash !== await this.hash(pass, nick)) throw new Error("Неверный пароль");
    this.current = nick;
    this.persist();
    this.changed();
  },

  logout() { this.current = null; this.persist(); this.changed(); },

  remove() {
    if (!this.current) return;
    delete this.db[this.current];
    this.current = null;
    this.persist();
    this.changed();
  },

  acc() { return this.current ? this.db[this.current] : null; },
  tokens() { const a = this.acc(); return a ? a.tokens : 0; },

  today() { return new Date().toISOString().slice(0, 10); },

  bonus() {
    const a = this.acc();
    if (!a) throw new Error("Войди в аккаунт, чтобы получать бонус");
    if (a.lastBonus === this.today()) throw new Error("Бонус уже получен — возвращайся завтра 🌙");
    a.lastBonus = this.today();
    a.tokens += this.BONUS_TOKENS;
    this.persist();
    this.changed();
    return a.tokens;
  },

  spend(n, what) {
    const a = this.acc();
    if (!a) throw new Error("Чтобы тратить Talking, войди в аккаунт (вкладка 👤 Аккаунт)");
    if (a.tokens < n) throw new Error(`Не хватает ${n - a.tokens} Talking на «${what}» — получи бонус или упрости запрос`);
    a.tokens -= n;
    this.persist();
    this.changed();
    return a.tokens;
  },

  earn(n) {
    const a = this.acc();
    if (!a) return 0;
    a.tokens += n;
    this.persist();
    this.changed();
    return a.tokens;
  },

  songKey() { return this.current ? "ss_song_" + this.current : "soundsmith-song-v1"; }
};

Accounts.load();
