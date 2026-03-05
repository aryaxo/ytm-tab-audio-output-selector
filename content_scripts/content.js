const EXT_KEY = "ytmSinkSaved_v5";
const LS_KEY  = "ytmSinkSaved_v5";

const UI_ID = "ytm-output-overlay";
const UI_BTN_ID = "ytm-output-overlay-btn";

function log(...a) { console.log("[YTM Output]", ...a); }
function warn(...a) { console.warn("[YTM Output]", ...a); }

log("✅ injected", new Date().toISOString(), "url =", location.href);

async function extGet() {
  try {
    const obj = await browser.storage.local.get(EXT_KEY);
    return obj[EXT_KEY] || null;
  } catch (e) { warn("extGet failed:", e?.name, e?.message); return null; }
}
async function extSet(val) {
  try { await browser.storage.local.set({ [EXT_KEY]: val }); return true; }
  catch (e) { warn("extSet failed:", e?.name, e?.message); return false; }
}
function siteGet() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { warn("siteGet failed:", e?.name, e?.message); return null; }
}
function siteSet(val) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(val)); return true; }
  catch (e) { warn("siteSet failed:", e?.name, e?.message); return false; }
}

async function getSaved() {
  const ext = await extGet();
  const site = siteGet();
  const chosen = ext || site || null;
  log("Saved check:", { ext, site });

  if (!ext && site) {
    log("Restoring saved from site -> ext");
    await extSet(site);
  }
  return chosen;
}

async function savePicked(deviceId, label) {
  const val = { deviceId: String(deviceId || ""), label: String(label || "") };
  log("Saving:", val);
  await extSet(val);
  siteSet(val);
  return val;
}

/* ---------------- UI overlay ---------------- */

function ensureOverlay() {
  if (document.getElementById(UI_ID)) return;

  const wrap = document.createElement("div");
  wrap.id = UI_ID;

  // Big centered banner
  Object.assign(wrap.style, {
    position: "fixed",
    left: "50%",
    top: "18%",
    transform: "translateX(-50%)",
    zIndex: 2147483647,
    background: "rgba(0,0,0,0.85)",
    color: "white",
    padding: "18px 20px",
    borderRadius: "14px",
    fontSize: "16px",
    lineHeight: "1.35",
    maxWidth: "520px",
    width: "calc(100% - 36px)",
    boxShadow: "0 12px 35px rgba(0,0,0,0.35)",
    display: "none" // start hidden; show when needed
  });

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";
  title.textContent = "Audio Output";

  const msg = document.createElement("div");
  msg.id = UI_ID + "-msg";
  msg.textContent = "…";

  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    gap: "10px",
    marginTop: "12px",
    alignItems: "center",
    flexWrap: "wrap"
  });

  const btn = document.createElement("button");
  btn.id = UI_BTN_ID;
  btn.textContent = "Choose output device";
  Object.assign(btn.style, {
    padding: "10px 14px",
    fontSize: "15px",
    borderRadius: "10px",
    border: "0",
    cursor: "pointer"
  });

  const hint = document.createElement("div");
  hint.id = UI_ID + "-hint";
  hint.style.opacity = "0.85";
  hint.style.fontSize = "13px";
  hint.textContent = "Tip: You can also just press Play — it will prompt when needed.";

  row.appendChild(btn);
  wrap.appendChild(title);
  wrap.appendChild(msg);
  wrap.appendChild(row);
  wrap.appendChild(hint);

  document.documentElement.appendChild(wrap);
  log("Injected overlay UI");

  btn.addEventListener("click", async () => {
    await promptAndApply("overlay-button");
  });
}

function showOverlay(text, { buttonText = "Choose output device", disableButton = false } = {}) {
  ensureOverlay();
  const wrap = document.getElementById(UI_ID);
  const msg = document.getElementById(UI_ID + "-msg");
  const btn = document.getElementById(UI_BTN_ID);

  if (msg) msg.textContent = text;
  if (btn) {
    btn.textContent = buttonText;
    btn.disabled = disableButton;
    btn.style.opacity = disableButton ? "0.6" : "1";
  }
  if (wrap) wrap.style.display = "block";
}

function hideOverlay() {
  const wrap = document.getElementById(UI_ID);
  if (wrap) wrap.style.display = "none";
}

/* ---------------- Routing logic ---------------- */

async function applyToAllMedia(deviceId) {
  const media = [...document.querySelectorAll("audio,video")];
  log("applyToAllMedia: found", media.length);

  let appliedAny = false;
  let lastError = null;

  for (const el of media) {
    if (typeof el.setSinkId !== "function") continue;

    try {
      if (el.sinkId === deviceId) {
        log(el.tagName, "already sinkId =", el.sinkId);
        appliedAny = true;
        continue;
      }
      await el.setSinkId(deviceId);
      log(el.tagName, "setSinkId OK →", el.sinkId);
      appliedAny = true;
    } catch (e) {
      lastError = e;
      warn(el.tagName, "setSinkId FAIL:", e?.name, e?.message);
    }
  }

  return { appliedAny, lastError };
}

let needsRearm = false;
let promptInFlight = false;

async function applySaved(reason) {
  const saved = await getSaved();
  log("applySaved", reason, "saved =", saved);

  if (!saved?.deviceId) {
    needsRearm = true;
    showOverlay("Choose an output device for YouTube Music.", { buttonText: "Choose output device" });
    return false;
  }

  // Wait briefly for media to exist
  for (let i = 1; i <= 10; i++) {
    const r = await applyToAllMedia(saved.deviceId);

    if (r.appliedAny) {
      needsRearm = false;
      hideOverlay();
      return true;
    }

    if (r.lastError?.name === "NotFoundError") {
      needsRearm = true;
      showOverlay(
        "Output routing needs to be re-armed for this tab.\nClick Play (or press the button) to choose an output device.",
        { buttonText: "Re-arm output" }
      );
      warn("Saved deviceId not valid in this session → will re-arm on user gesture.");
      return false;
    }

    await new Promise(res => setTimeout(res, 700));
  }

  // No media yet (not playing). Keep overlay only if we know we need it.
  if (needsRearm) {
    showOverlay("Click Play to re-arm output routing (or press the button).", { buttonText: "Re-arm output" });
  } else {
    // If we have a saved device but no media yet, don't annoy user
    hideOverlay();
  }
  return false;
}

async function promptAndApply(source) {
  if (promptInFlight) return;
  promptInFlight = true;

  try {
    log("promptAndApply source =", source);

    showOverlay("Picking output device…", { buttonText: "Picking…", disableButton: true });

    const d = await navigator.mediaDevices.selectAudioOutput();
    const deviceId = String(d?.deviceId || "");
    const label = String(d?.label || "");
    log("selectAudioOutput OK:", { deviceId, label });

    if (!deviceId) throw new Error("No deviceId returned");

    await savePicked(deviceId, label);

    // Apply immediately (media should exist if user clicked play)
    await applySaved("after-pick");

    needsRearm = false;

    showOverlay("Output set ✔", { buttonText: "Done", disableButton: true });
    setTimeout(() => hideOverlay(), 900);
  } catch (e) {
    warn("promptAndApply FAIL:", e?.name, e?.message);
    needsRearm = true;
    showOverlay("Could not set output. Click to try again.", { buttonText: "Choose output device" });
  } finally {
    promptInFlight = false;
  }
}

/* ---------------- Boot + event hooks ---------------- */

ensureOverlay();

// Initial attempt (may determine we need rearm)
applySaved("initial");

// When user clicks play controls, if rearm is needed, prompt immediately on that click.
document.addEventListener(
  "click",
  (ev) => {
    if (!needsRearm) return;

    const t = ev.target;
    const el = t && t.closest ? t.closest("button,ytmusic-play-button,tp-yt-paper-icon-button") : null;
    if (!el) return;

    // Don’t trigger from clicking our overlay button; it has its own handler.
    if (el.id === UI_BTN_ID) return;

    promptAndApply("click-heuristic");
  },
  true
);

// Retry applying on play/playing (no prompt, just apply attempt)
document.addEventListener("play", () => applySaved("play"), true);
document.addEventListener("playing", () => applySaved("playing"), true);

// If tab becomes visible again, try to apply once (helps after sleep/device changes)
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) applySaved("visibility");
});