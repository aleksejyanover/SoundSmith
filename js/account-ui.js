/* ============ SoundSmith — интерфейс аккаунтов ============ */
"use strict";

const AccountUI = {
  init() {
    document.getElementById("accountChip").addEventListener("click", () => {
      document.querySelector('.tab[data-tab="account"]').click();
    });
    this.render();
    Accounts.onChange(() => this.refresh());
  },

  refresh() {
    this.render();
    if (window.AiChat) AiChat.refreshBalance();
  },

  updateChip() {
    const chip = document.getElementById("accountChip");
    chip.innerHTML = Accounts.current
      ? `👤 ${escapeUi(Accounts.current)} · 🪙 ${Accounts.tokens()}`
      : `👤 гость · 🪙 ${Accounts.tokens()}`;
    chip.classList.toggle("logged", !!Accounts.current);
  },

  render() {
    this.updateChip();
    const box = document.getElementById("accountBox");
    if (!box) return;

    if (!Accounts.current) {
      box.innerHTML = `
        <div class="card acc-card">
          <h2>Вход в аккаунт</h2>
          <div class="acc-form">
            <input type="text" id="accNick" placeholder="Ник" spellcheck="false" autocomplete="username">
            <input type="password" id="accPass" placeholder="Пароль" autocomplete="current-password">
            <div class="row">
              <button class="btn btn-export" id="btnRegister">✨ Создать аккаунт</button>
              <button class="btn" id="btnLogin">Войти</button>
            </div>
            <p class="hint" id="accMsg">Аккаунты хранятся в этом браузере — сервер не нужен.</p>
          </div>
        </div>
        <div class="card">
          <h2>Зачем аккаунт?</h2>
          <ul class="acc-perks">
            <li>🪙 <b>60 Talking</b> на старт и <b>+25</b> ежедневный бонус</li>
            <li>🤖 доступ к ИИ-музыканту в чате <b>Talking</b></li>
            <li>🎵 своя песня сохраняется отдельно для каждого аккаунта</li>
            <li>🔁 входишь под разными никами — у каждого свои треки</li>
          </ul>
        </div>`;

      const msg = document.getElementById("accMsg");
      const tryAction = async (fn) => {
        try {
          await fn();
          msg.textContent = "Готово! 🎉";
          msg.classList.remove("err");
        } catch (e) {
          msg.textContent = e.message;
          msg.classList.add("err");
        }
        AccountUI.refresh();
      };
      document.getElementById("btnLogin").addEventListener("click", () => {
        const nick = document.getElementById("accNick").value;
        const pass = document.getElementById("accPass").value;
        tryAction(() => Accounts.login(nick, pass));
      });
      document.getElementById("btnRegister").addEventListener("click", () => {
        const nick = document.getElementById("accNick").value;
        const pass = document.getElementById("accPass").value;
        tryAction(async () => {
          const t = await Accounts.register(nick, pass);
          msg.textContent = `Аккаунт создан! 🎁 +${t} Talking`;
        });
      });
    } else {
      const a = Accounts.acc();
      const canBonus = a.lastBonus !== Accounts.today();
      box.innerHTML = `
        <div class="card acc-card">
          <h2>👤 ${escapeUi(Accounts.current)}</h2>
          <div class="acc-tokens">🪙 <b>${a.tokens}</b> <span>Talking</span></div>
          <div class="row">
            <button class="btn ${canBonus ? "btn-export" : "btn-ghost"}" id="btnBonus" ${canBonus ? "" : "disabled"}>
              ${canBonus ? "🎁 Получить +25" : "🌙 Бонус завтра"}
            </button>
            <button class="btn btn-ghost" id="btnLogout">Выйти</button>
          </div>
          <button class="btn btn-ghost danger" id="btnDelete">Удалить аккаунт вместе с песней</button>
          <p class="hint" id="accMsg">Создан: ${new Date(a.created).toLocaleDateString("ru-RU")}</p>
        </div>
        <div class="card">
          <h2>Talking — что это</h2>
          <p class="hint">Внутриигровая валюта SoundSmith. Тратится на ИИ-генерацию:</p>
          <ul class="acc-perks">
            <li>🎶 целая песня — <b>20</b></li>
            <li>🎼 секция (куплет/припев/интро) — <b>10</b></li>
            <li>🎵 мелодия — <b>8</b></li>
            <li>🥁 бит — <b>5</b></li>
            <li>⬇️ экспорт WAV приносит <b>+5</b></li>
          </ul>
        </div>`;

      const msg = document.getElementById("accMsg");
      document.getElementById("btnBonus").addEventListener("click", () => {
        try {
          const t = Accounts.bonus();
          msg.textContent = `🎁 +${Accounts.BONUS_TOKENS} Talking! Всего: ${t}`;
          msg.classList.remove("err");
        } catch (e) {
          msg.textContent = e.message;
          msg.classList.add("err");
        }
        AccountUI.refresh();
      });
      document.getElementById("btnLogout").addEventListener("click", () => Accounts.logout());
      document.getElementById("btnDelete").addEventListener("click", () => {
        if (confirm(`Удалить аккаунт «${Accounts.current}» и его песню безвозвратно?`)) {
          try { localStorage.removeItem(Accounts.songKey()); } catch (e) {}
          Accounts.remove();
        }
      });
    }
  }
};

function escapeUi(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.addEventListener("DOMContentLoaded", () => AccountUI.init());
