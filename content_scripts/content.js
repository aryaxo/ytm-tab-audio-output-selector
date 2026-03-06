// Wrap everything in an IIFE so `return` is a reliable early-exit.
// `throw` at the top level of a content script can be swallowed by Firefox's runner.
(function () {

  // Guard against double-injection. Both content script sandboxes share the same DOM,
  // so a data attribute on <html> is visible to all instances in this frame.
  if (document.documentElement.dataset.ytmOutputActive === "1") {
    return;
  }
  document.documentElement.dataset.ytmOutputActive = "1";

  const EXT_KEY = "ytmSinkSaved_v5";
  const LS_KEY = "ytmSinkSaved_v5";

  const UI_ID = "ytm-output-overlay";
  const UI_BTN_ID = "ytm-output-overlay-btn";

  function log(...a) { console.log("[YTM Output]", ...a); }
  function warn(...a) { console.warn("[YTM Output]", ...a); }

  log("✅ v1.1.0", new Date().toISOString(), "url =", location.href);

  /* ---------------- Storage helpers ---------------- */

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
    if (!ext && site) { await extSet(site); } // migrate site → ext
    if (chosen?.deviceId) _deviceCache = chosen;
    return chosen;
  }

  async function savePicked(deviceId, label) {
    const val = { deviceId: String(deviceId || ""), label: String(label || "") };
    log("Saving device:", label || deviceId.slice(0, 12));
    _deviceCache = val;
    await extSet(val);
    siteSet(val);
    return val;
  }

  /* ---------------- UI overlay ---------------- */

  function ensureOverlay() {
    if (document.getElementById(UI_ID)) return;

    // Inject keyframe animations
    const style = document.createElement("style");
    style.textContent = `
      @keyframes ytm-slide-in {
        from { opacity: 0; transform: translateY(20px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0)    scale(1);    }
      }
      @keyframes ytm-fade-out {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to   { opacity: 0; transform: translateY(8px) scale(0.97); pointer-events: none; }
      }
      #${UI_ID} { animation: ytm-slide-in 0.35s cubic-bezier(0.16,1,0.3,1) both; }
      #${UI_ID}.ytm-hiding { animation: ytm-fade-out 0.4s cubic-bezier(0.4,0,1,1) forwards; }
      #${UI_BTN_ID}:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }
      #${UI_BTN_ID}:active:not(:disabled) { transform: scale(0.97); }
      #${UI_BTN_ID} { transition: filter 0.15s, transform 0.1s; }
    `;
    document.documentElement.appendChild(style);

    const wrap = document.createElement("div");
    wrap.id = UI_ID;
    Object.assign(wrap.style, {
      position: "fixed",
      bottom: "88px",   // sit just above YTM's player bar
      right: "20px",
      zIndex: "2147483647",
      background: "rgba(24,24,24,0.96)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      color: "#fff",
      padding: "16px 18px 14px",
      borderRadius: "16px",
      fontSize: "14px",
      lineHeight: "1.4",
      width: "280px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)",
      display: "none",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    });

    // Header row: speaker icon + title
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex", alignItems: "center", gap: "8px",
      marginBottom: "8px",
    });

    const icon = document.createElement("span");
    icon.textContent = "🔊";
    icon.style.fontSize = "16px";

    const title = document.createElement("span");
    title.style.fontWeight = "700";
    title.style.fontSize = "13px";
    title.style.letterSpacing = "0.02em";
    title.style.textTransform = "uppercase";
    title.style.opacity = "0.6";
    title.textContent = "Audio Output";

    header.appendChild(icon);
    header.appendChild(title);

    // Message
    const msg = document.createElement("div");
    msg.id = UI_ID + "-msg";
    msg.style.marginBottom = "12px";
    msg.style.fontSize = "14px";
    msg.textContent = "…";

    // Button
    const btn = document.createElement("button");
    btn.id = UI_BTN_ID;
    btn.textContent = "Choose output device";
    Object.assign(btn.style, {
      display: "block",
      width: "100%",
      padding: "9px 14px",
      fontSize: "13px",
      fontWeight: "600",
      fontFamily: "inherit",
      borderRadius: "999px",
      border: "0",
      cursor: "pointer",
      background: "#f03",        // YTM red
      color: "#fff",
      letterSpacing: "0.01em",
    });

    wrap.appendChild(header);
    wrap.appendChild(msg);
    wrap.appendChild(btn);
    document.documentElement.appendChild(wrap);

    btn.addEventListener("click", async () => { await promptAndApply("overlay-button"); });
  }

  function showOverlay(text, { buttonText = "Choose output device", disableButton = false, success = false } = {}) {
    ensureOverlay();
    const wrap = document.getElementById(UI_ID);
    const msg = document.getElementById(UI_ID + "-msg");
    const btn = document.getElementById(UI_BTN_ID);

    if (msg) msg.textContent = text;
    if (btn) {
      if (success) {
        btn.style.display = "none";
      } else {
        btn.style.display = "block";
        btn.textContent = buttonText;
        btn.disabled = disableButton;
        btn.style.opacity = disableButton ? "0.55" : "1";
        btn.style.cursor = disableButton ? "default" : "pointer";
        btn.style.background = "#f03";
      }
    }

    if (wrap) {
      // Cancel any in-flight hide timers so they can't clobber this show.
      clearTimeout(_hideTimer);
      clearTimeout(_hideCleanupTimer);
      // Restart the slide-in animation cleanly every time the overlay is (re)shown.
      wrap.classList.remove("ytm-hiding");
      wrap.style.animation = "none";
      // Force a reflow so removing then re-adding the animation takes effect.
      void wrap.offsetWidth;
      wrap.style.animation = "";
      wrap.style.display = "block";
    }
  }

  const FADE_OUT_MS = 400; // must match ytm-fade-out animation duration
  let _hideTimer = null;
  let _hideCleanupTimer = null; // inner timer that sets display:none after fade
  function hideOverlay(delay = 0) {
    clearTimeout(_hideTimer);
    const wrap = document.getElementById(UI_ID);
    if (!wrap) return;
    const doFade = () => {
      wrap.classList.add("ytm-hiding");
      _hideCleanupTimer = setTimeout(() => {
        wrap.classList.remove("ytm-hiding");
        wrap.style.display = "none";
      }, FADE_OUT_MS);
    };
    if (delay > 0) {
      _hideTimer = setTimeout(doFade, delay);
    } else {
      doFade();
    }
  }

  /* ---------------- Routing logic ---------------- */

  // Collect all audio/video elements including those inside shadow roots.
  // YTM uses Polymer web components; the player <video> may be in a shadow DOM.
  function collectMediaElements(root = document) {
    const results = [];
    root.querySelectorAll("audio,video").forEach(el => results.push(el));
    root.querySelectorAll("*").forEach(el => {
      if (el.shadowRoot) results.push(...collectMediaElements(el.shadowRoot));
    });
    return results;
  }

  async function applyToAllMedia(deviceId) {
    const media = collectMediaElements();
    let appliedAny = false;
    let lastError = null;

    for (const el of media) {
      if (typeof el.setSinkId !== "function") continue;
      try {
        if (el.sinkId === deviceId && armedElements.has(el) && !pendingElements.has(el)) {
          // Confirmed-armed at play/playing state — routing is already established.
          appliedAny = true;
          continue;
        }
        // Element is pending confirmation (setSinkId was called at HAVE_NOTHING, may not
        // have actually routed) or sinkId doesn't match. Do reset+reapply:
        // Firefox treats setSinkId(sameValue) as a no-op even if routing was reset.
        if (el.sinkId === deviceId) await el.setSinkId(""); // force state change
        await el.setSinkId(deviceId);
        pendingElements.delete(el);
        armedElements.add(el);
        log(el.tagName, "→", deviceId.slice(0, 12));
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
  let sessionArmed = false;  // true once setSinkId succeeded at play state
  let hasEverArmed = false;  // sticky: true once selectAudioOutput() ever succeeded
  let applyGeneration = 0;    // increment to cancel stale retry loops
  const armedElements = new WeakSet(); // confirmed-routed at play/playing state
  const pendingElements = new WeakSet(); // setSinkId called at HAVE_NOTHING; needs reconfirm
  let _deviceCache = null;    // hot-path cache: avoids storage IPC latency
  let _skipPollTimer = null;  // polling interval active after a song skip

  // After a skip/nav, poll every 250 ms for up to 3 s to catch any elements that
  // appear late (e.g. during crossfade) or lurk in shadow DOM.
  function startSkipPoll() {
    clearInterval(_skipPollTimer);
    if (!_deviceCache?.deviceId) return;
    let ticks = 0;
    _skipPollTimer = setInterval(async () => {
      ticks++;
      if (ticks > 12) { clearInterval(_skipPollTimer); return; }
      const device = _deviceCache?.deviceId;
      if (!device) { clearInterval(_skipPollTimer); return; }
      for (const el of collectMediaElements()) {
        if (typeof el.setSinkId === "function" && el.sinkId !== device) {
          await applySavedToElement(el, { forceRearm: true });
        }
      }
    }, 250);
  }

  async function applySaved(reason) {
    const myGen = ++applyGeneration;
    const saved = await getSaved();

    if (!saved?.deviceId) {
      if (myGen !== applyGeneration) return false;
      needsRearm = true;
      showOverlay("Choose an output device for YouTube Music.", { buttonText: "Choose output device" });
      return false;
    }

    for (let i = 1; i <= 10; i++) {
      if (myGen !== applyGeneration) return false;
      const r = await applyToAllMedia(saved.deviceId);
      if (myGen !== applyGeneration) return false;

      if (r.appliedAny) {
        sessionArmed = true;
        needsRearm = false;
        hideOverlay();
        return true;
      }

      if (r.lastError?.name === "NotFoundError") {
        if (!sessionArmed) {
          needsRearm = true;
          showOverlay(
            "Output routing needs to be re-armed for this tab.\nClick Play (or press the button) to choose an output device.",
            { buttonText: "Re-arm output" }
          );
          warn("Saved deviceId not valid in this session → re-arm on user gesture.");
        }
        return false;
      }

      await new Promise(res => setTimeout(res, 700));
    }

    if (myGen !== applyGeneration) return false;
    if (needsRearm && !sessionArmed) {
      showOverlay("Click Play to re-arm output routing (or press the button).", { buttonText: "Re-arm output" });
    } else {
      hideOverlay();
    }
    return false;
  }

  async function promptAndApply(source) {
    if (promptInFlight) return;
    promptInFlight = true;
    try {
      showOverlay("Picking output device…", { buttonText: "Picking…", disableButton: true });
      const d = await navigator.mediaDevices.selectAudioOutput();
      const deviceId = String(d?.deviceId || "");
      const label = String(d?.label || "");
      if (!deviceId) throw new Error("No deviceId returned");
      await savePicked(deviceId, label);
      await applySaved("after-pick");
      sessionArmed = true;
      hasEverArmed = true;
      needsRearm = false;
      showOverlay("✔ Output set — " + label, { success: true });
      hideOverlay(3000);
    } catch (e) {
      warn("promptAndApply FAIL:", e?.name, e?.message);
      needsRearm = true;
      showOverlay("Could not set output. Click to try again.", { buttonText: "Choose output device" });
    } finally {
      promptInFlight = false;
    }
  }

  /* ---------------- Boot + event hooks ---------------- */

  // Apply saved sink to a single element via the hot-path cache.
  // forceRearm=true bypasses the armedElements guard (used on song skip/loadstart).
  async function applySavedToElement(el, { forceRearm = false } = {}) {
    if (typeof el.setSinkId !== "function") return;
    if (!forceRearm && armedElements.has(el)) return;

    const fast = _deviceCache;
    if (fast?.deviceId) {
      try {
        const alreadySet = el.sinkId === fast.deviceId;
        if (forceRearm && alreadySet) {
          // Firefox preserves the sinkId property through media reloads but may treat
          // setSinkId(sameValue) as a no-op. Reset to "" to force re-initialisation.
          await el.setSinkId("");
        }
        if (!alreadySet || forceRearm) await el.setSinkId(fast.deviceId);
        // Mark pending — applyToAllMedia confirms routing at play/playing state.
        pendingElements.add(el);
        sessionArmed = true;
        return;
      } catch (e) {
        if (e?.name !== "NotFoundError") {
          warn("applySavedToElement FAIL:", e?.name, e?.message);
          return;
        }
        // NotFoundError — permission not yet granted, fall through to slow-path retries
      }
    }

    // Slow path: full storage read + retry loop (used before first selectAudioOutput)
    const saved = await getSaved();
    if (!saved?.deviceId) return;

    for (let attempt = 0; attempt < 5; attempt++) {
      if (!forceRearm && armedElements.has(el)) return;
      try {
        if (el.sinkId !== saved.deviceId) await el.setSinkId(saved.deviceId);
        pendingElements.add(el);
        sessionArmed = true;
        return;
      } catch (e) {
        if (e?.name !== "NotFoundError" || attempt === 4) {
          warn("applySavedToElement: setSinkId FAIL after", attempt + 1, "attempts:", e?.name);
          needsRearm = true;
          showOverlay(
            "Output routing needs to be re-armed.\nPress the button to select your audio device.",
            { buttonText: "Re-arm output" }
          );
          return;
        }
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  // Watch for new <audio>/<video> nodes added by YTM (e.g. new element on SPA navigation).
  // Also observe shadow roots so elements inside Polymer components are caught.
  const _mediaObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.("audio,video")) applySavedToElement(node);
        node.querySelectorAll?.("audio,video").forEach(el => applySavedToElement(el));
        if (node.shadowRoot) {
          _mediaObserver.observe(node.shadowRoot, { childList: true, subtree: true });
          node.shadowRoot.querySelectorAll("audio,video").forEach(el => applySavedToElement(el));
        }
      }
    }
  });
  _mediaObserver.observe(document.documentElement, { childList: true, subtree: true });

  ensureOverlay();
  applySaved("initial");

  // Trigger device picker on any click when the initial arm is needed.
  // Broad approach: playback can be initiated via song rows, album art, playlist items etc.
  document.addEventListener("click", (ev) => {
    if (!needsRearm || hasEverArmed) return;
    const t = ev.target;
    if (!t) return;
    if (t.closest?.(`#${UI_BTN_ID}`)) return; // overlay button has its own handler
    if (t.closest?.("input,select,textarea,a[href],label")) return; // non-playback elements
    promptAndApply("click-heuristic");
  }, true);

  // Re-apply on every play/playing event — applyToAllMedia is idempotent and
  // this is where pending elements get promoted to confirmed-armed status.
  document.addEventListener("play", () => applySaved("play"), true);
  document.addEventListener("playing", () => applySaved("playing"), true);

  // Re-apply when tab becomes visible again (helps after sleep/device changes).
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) applySaved("visibility");
  });

  // emptied fires when src changes — clear armed/pending state and start skip poll.
  document.addEventListener("emptied", (ev) => {
    const el = ev.composedPath?.()?.[0] ?? ev.target;
    if (el.tagName !== "AUDIO" && el.tagName !== "VIDEO") return;
    if (!hasEverArmed) return;
    armedElements.delete(el);
    pendingElements.delete(el);
    startSkipPoll();
  }, true);

  // loadstart: force-rearm the element using the reset+reapply pattern.
  // Firefox treats setSinkId(sameValue) as a no-op when routing was reset by
  // a media reload, so we must reset to "" first then re-apply our device.
  document.addEventListener("loadstart", async (ev) => {
    const el = ev.composedPath?.()?.[0] ?? ev.target;
    if (el.tagName !== "AUDIO" && el.tagName !== "VIDEO") return;
    if (!hasEverArmed) return;
    if (!_deviceCache?.deviceId) return;
    armedElements.delete(el);
    await applySavedToElement(el, { forceRearm: true });
  }, true);

})(); // end IIFE