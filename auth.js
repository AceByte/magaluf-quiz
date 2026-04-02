(function () {
  const STORAGE_KEY = "magaluf-quiz-unlocked";
  const PASSWORD_HASH = "55847d6046a38bb739cb8cc3fcd7a2720de863eba29df5e7d9f0bfea3e151cac";
  const SALT = "magaluf-quiz::";

  let unlockPromise = null;

  function isUnlocked() {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  }

  function setUnlocked(value) {
    sessionStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(function (byte) { return byte.toString(16).padStart(2, "0"); })
      .join("");
  }

  async function hashPassword(value) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(SALT + value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(digest);
  }

  function createOverlay() {
    if (document.getElementById("authOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "authOverlay";
    overlay.className = "auth-overlay";
    overlay.innerHTML = [
      '<div class="auth-card">',
      '  <p class="eyebrow">Adgang påkrævet</p>',
      '  <h1>Indtast password</h1>',
      '  <p>For at åbne kompendiet skal du skrive adgangskoden.</p>',
      '  <form class="auth-form" id="authForm">',
      '    <label class="auth-label" for="authInput">Password</label>',
      '    <input id="authInput" name="password" type="password" autocomplete="current-password" placeholder="Skriv password" />',
      '    <p id="authError" class="auth-error" aria-live="polite"></p>',
      '    <button class="btn" type="submit">Lås op</button>',
      '  </form>',
      '</div>'
    ].join("");

    document.body.appendChild(overlay);

    const form = document.getElementById("authForm");
    const input = document.getElementById("authInput");
    const error = document.getElementById("authError");

    input.focus();

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      error.textContent = "";

      try {
        const enteredHash = await hashPassword(input.value);
        if (enteredHash === PASSWORD_HASH) {
          setUnlocked(true);
          overlay.remove();
          document.body.classList.remove("auth-locked");
          document.dispatchEvent(new CustomEvent("magaluf-auth-unlocked"));
          if (unlockPromiseResolve) unlockPromiseResolve(true);
          return;
        }

        error.textContent = "Forkert password. Prøv igen.";
        input.select();
      } catch (err) {
        error.textContent = "Kunne ikke tjekke password.";
      }
    });
  }

  let unlockPromiseResolve = null;

  async function ensureUnlocked() {
    if (isUnlocked()) return true;

    if (!unlockPromise) {
      unlockPromise = new Promise(function (resolve) {
        unlockPromiseResolve = resolve;
      });
      document.body.classList.add("auth-locked");
      createOverlay();
    }

    return unlockPromise;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!isUnlocked()) {
      document.body.classList.add("auth-locked");
      createOverlay();
    }
  });

  window.SiteAuth = {
    ensureUnlocked: ensureUnlocked,
    isUnlocked: isUnlocked
  };
})();