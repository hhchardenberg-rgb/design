"use client";

import { useEffect, useRef } from "react";

/**
 * Wedstrijdklok voor op de tribune/lijn: helften + verlengingen met één tik
 * starten, automatische blessuretijd bij elke faseovergang, wake lock (scherm
 * blijft aan), beeld-in-beeld en een donker thema. Overgenomen van de eigen,
 * al werkende standalone tool van de gebruiker (hhc-stopwatch-extra-tijd) en
 * hier ingebed als hub-onderdeel — de kloklogica (drift-correctie via
 * performance.now(), localStorage-persistentie zodat een herlaad de wedstrijd
 * niet reset) is bewust vrijwel ongewijzigd overgenomen. Wat is weggelaten:
 * de losse-PWA-installatie-onderdelen (dynamisch manifest, favicons/
 * theme-color) — die horen bij de standalone versie, niet bij een pagina
 * binnen deze grotere hub-app.
 */
export function HhcStopwatchTool() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    const { signal } = controller;
    const qs = <T extends Element>(s: string) => root.querySelector<T>(s)!;

    const weergave = qs<HTMLDivElement>("#weergave");
    const statusEl = qs<HTMLDivElement>("#status");

    const eersteBtn = qs<HTMLButtonElement>("#eersteBtn");
    const tweedeBtn = qs<HTMLButtonElement>("#tweedeBtn");
    const eersteVerlBtn = qs<HTMLButtonElement>("#eersteVerlBtn");
    const tweedeVerlBtn = qs<HTMLButtonElement>("#tweedeVerlBtn");

    const pauzeBtn = qs<HTMLButtonElement>("#pauzeBtn");
    const resetBtn = qs<HTMLButtonElement>("#resetBtn");
    const plusMin = qs<HTMLButtonElement>("#plusMin");
    const minMin = qs<HTMLButtonElement>("#minMin");

    const extraBtn = qs<HTMLButtonElement>("#extraBtn");
    const extraResetBtn = qs<HTMLButtonElement>("#extraResetBtn");

    const panelExtra = qs<HTMLDivElement>("#panel-extra");
    const extraTekst = qs<HTMLDivElement>("#extraTekst");
    const extraWeergave = qs<HTMLDivElement>("#extraWeergave");

    const wakeBtn = qs<HTMLButtonElement>("#wakeBtn");
    const pipBtn = qs<HTMLButtonElement>("#pipBtn");
    const themeBtn = qs<HTMLButtonElement>("#themeBtn");

    const pipCanvas = qs<HTMLCanvasElement>("#pipCanvas");
    const pipVideo = qs<HTMLVideoElement>("#pipVideo");
    const pipCtx = pipCanvas.getContext("2d")!;

    const STORE_KEY = "hhcStopwatchV12";
    const THEME_KEY = "hhcTheme";

    let latestMainText = "00:00";
    let latestExtraText = "00:00";
    let latestMainRunning = false;
    let latestExtraRunning = false;
    let prevMainMs = 0;

    function vibrate() {
      if (navigator.vibrate) navigator.vibrate(50);
    }

    function makeClock({ persistKey }: { persistKey: string }) {
      let base = 0;
      let startEpoch: number | null = null;
      let startPerf: number | null = null;
      let running = false;

      function nowWall() {
        return Date.now();
      }
      function nowPerf() {
        return performance.now();
      }

      function elapsedTrue() {
        return running && startEpoch !== null ? base + (nowWall() - startEpoch) : base;
      }

      function elapsedSmooth() {
        return running && startPerf !== null ? base + (nowPerf() - startPerf) : base;
      }

      function resyncPerf() {
        if (!running || startEpoch === null) return;
        startPerf = nowPerf() - (nowWall() - startEpoch);
      }

      function fmt(ms: number) {
        const t = Math.max(0, Math.floor(ms));
        const m = Math.floor(t / 60000);
        const s = Math.floor((t % 60000) / 1000);
        return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
      }

      function save() {
        try {
          localStorage.setItem(persistKey, JSON.stringify({ base, startEpoch, running }));
        } catch {
          /* best-effort */
        }
      }

      function load() {
        try {
          const raw = localStorage.getItem(persistKey);
          if (!raw) return;

          const d = JSON.parse(raw);
          base = Number(d.base) || 0;
          startEpoch = typeof d.startEpoch === "number" ? d.startEpoch : null;
          running = !!d.running;

          if (running && startEpoch !== null) {
            base = Math.max(0, base + (nowWall() - startEpoch));
            startEpoch = nowWall();
            startPerf = nowPerf();
            save();
          } else {
            running = false;
            startEpoch = null;
            startPerf = null;
          }
        } catch {
          /* best-effort */
        }
      }

      function setToMinutes(m: number) {
        base = Math.max(0, m * 60000);
        startEpoch = nowWall();
        startPerf = nowPerf();
        running = true;
        save();
        vibrate();
      }

      function start() {
        if (running) return;
        startEpoch = nowWall();
        startPerf = nowPerf();
        running = true;
        save();
        vibrate();
      }

      function pause() {
        if (!running) return;
        base = elapsedTrue();
        running = false;
        startEpoch = null;
        startPerf = null;
        save();
        vibrate();
      }

      function reset() {
        running = false;
        startEpoch = null;
        startPerf = null;
        base = 0;
        save();
        vibrate();
      }

      function nudgeMs(ms: number) {
        base = Math.max(0, elapsedTrue() + ms);
        if (running) {
          startEpoch = nowWall();
          startPerf = nowPerf();
        }
        save();
        vibrate();
      }

      return {
        elapsedTrue,
        elapsedSmooth,
        resyncPerf,
        fmt,
        load,
        setToMinutes,
        start,
        pause,
        reset,
        nudgeMs,
        get running() {
          return running;
        },
      };
    }

    const mainClock = makeClock({ persistKey: STORE_KEY + ":main" });
    const extraClock = makeClock({ persistKey: STORE_KEY + ":extra" });

    let wakeLock: WakeLockSentinel | null = null;
    const wakeSupported = "wakeLock" in navigator;

    function setWakeLabel(on: boolean) {
      wakeBtn.textContent = wakeSupported ? (on ? "Wake Lock aan" : "Wake Lock uit") : "Wake Lock niet ondersteund";
    }

    async function requestWake() {
      if (!wakeSupported) {
        alert("Wake Lock niet ondersteund op dit apparaat/browser");
        return;
      }
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        setWakeLabel(true);
        wakeLock.addEventListener("release", () => setWakeLabel(false));
      } catch {
        alert("Wake Lock mislukt. Tik opnieuw met het scherm actief.");
      }
    }

    async function releaseWake() {
      try {
        await wakeLock?.release();
        wakeLock = null;
        setWakeLabel(false);
      } catch {
        /* best-effort */
      }
    }

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "visible" && wakeLock) requestWake();
      },
      { signal }
    );

    setWakeLabel(false);
    wakeBtn.addEventListener("click", () => (wakeLock ? releaseWake() : requestWake()), { signal });

    function initTheme() {
      const saved = localStorage.getItem(THEME_KEY);
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

      if (saved === "dark" || (!saved && prefersDark)) root!.classList.add("dark");

      themeBtn.textContent = root!.classList.contains("dark") ? "Licht thema" : "Donker thema";

      themeBtn.addEventListener(
        "click",
        () => {
          root!.classList.toggle("dark");
          const dark = root!.classList.contains("dark");
          localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
          themeBtn.textContent = dark ? "Licht thema" : "Donker thema";
        },
        { signal }
      );
    }

    initTheme();

    function startFase(min: number) {
      mainClock.setToMinutes(min);
      extraClock.reset();
      prevMainMs = min * 60000;
      panelExtra.style.display = "none";
    }

    eersteBtn.addEventListener("click", () => startFase(0), { signal });
    tweedeBtn.addEventListener("click", () => startFase(45), { signal });
    eersteVerlBtn.addEventListener("click", () => startFase(90), { signal });
    tweedeVerlBtn.addEventListener("click", () => startFase(105), { signal });

    pauzeBtn.addEventListener(
      "click",
      () => {
        if (mainClock.running) mainClock.pause();
        else mainClock.start();
      },
      { signal }
    );

    extraBtn.addEventListener(
      "click",
      () => {
        if (extraClock.running) extraClock.pause();
        else extraClock.start();
      },
      { signal }
    );

    extraResetBtn.addEventListener(
      "click",
      () => {
        extraClock.reset();
        panelExtra.style.display = "none";
      },
      { signal }
    );

    resetBtn.addEventListener(
      "click",
      () => {
        mainClock.reset();
        extraClock.reset();
        prevMainMs = 0;
        panelExtra.style.display = "none";
        closePiPIfOpen();
      },
      { signal }
    );

    plusMin.addEventListener("click", () => mainClock.nudgeMs(60000), { signal });
    minMin.addEventListener("click", () => mainClock.nudgeMs(-60000), { signal });

    function drawPiP() {
      const dark = root!.classList.contains("dark");
      const bg = dark ? "#0b0b0b" : "#EC642B";
      const fg = "#ffffff";
      const accent = dark ? "#EC642B" : "#111111";

      pipCtx.fillStyle = bg;
      pipCtx.fillRect(0, 0, pipCanvas.width, pipCanvas.height);

      pipCtx.fillStyle = fg;
      pipCtx.textAlign = "center";
      pipCtx.textBaseline = "middle";

      pipCtx.font = "700 155px Roboto, Arial, sans-serif";
      pipCtx.fillText(latestMainText, pipCanvas.width / 2, 245);

      pipCtx.font = "700 34px Roboto, Arial, sans-serif";
      pipCtx.fillText(latestMainRunning ? "Loopt" : "Gepauzeerd", pipCanvas.width / 2, 365);

      if (latestExtraRunning) {
        pipCtx.fillStyle = accent;
        pipCtx.fillRect(270, 410, 420, 68);

        pipCtx.fillStyle = dark ? "#0b0b0b" : "#ffffff";
        pipCtx.font = "700 32px Roboto, Arial, sans-serif";
        pipCtx.fillText("Extra tijd " + latestExtraText, pipCanvas.width / 2, 445);
      }
    }

    let pipStreamStarted = false;

    async function openPiP() {
      if (!document.pictureInPictureEnabled || !pipVideo.requestPictureInPicture) {
        alert("Beeld-in-beeld wordt niet ondersteund in deze browser.");
        return;
      }
      try {
        drawPiP();
        if (!pipStreamStarted) {
          const stream = pipCanvas.captureStream(30);
          pipVideo.srcObject = stream;
          pipVideo.muted = true;
          pipVideo.playsInline = true;
          await pipVideo.play();
          pipStreamStarted = true;
        }
        await pipVideo.requestPictureInPicture();
        pipBtn.textContent = "Sluit beeld in beeld";
      } catch {
        alert("Beeld-in-beeld kon niet worden gestart.");
      }
    }

    async function closePiPIfOpen() {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        }
      } catch {
        /* best-effort */
      }
      pipBtn.textContent = "Beeld in beeld";
    }

    pipBtn.addEventListener(
      "click",
      async () => {
        if (document.pictureInPictureElement) await closePiPIfOpen();
        else await openPiP();
      },
      { signal }
    );

    document.addEventListener("leavepictureinpicture", () => (pipBtn.textContent = "Beeld in beeld"), { signal });

    let rafId = 0;

    function renderController() {
      const mainMsTrue = mainClock.elapsedTrue();
      const mainMsSmooth = mainClock.elapsedSmooth();
      if (Math.abs(mainMsSmooth - mainMsTrue) > 120) mainClock.resyncPerf();

      const mainTxt = mainClock.fmt(mainClock.elapsedSmooth());
      const [mm, ss] = mainTxt.split(":");

      weergave.innerHTML = `${mm}<span class="knipper">:</span>${ss}`;
      statusEl.textContent = mainClock.running ? "Loopt" : "Gepauzeerd";
      pauzeBtn.textContent = mainClock.running ? "Pauze" : "Start";

      const extraMsTrue = extraClock.elapsedTrue();
      const extraMsSmooth = extraClock.elapsedSmooth();
      if (Math.abs(extraMsSmooth - extraMsTrue) > 120) extraClock.resyncPerf();

      const extraTxt = extraClock.fmt(extraClock.elapsedSmooth());
      const [emm, ess] = extraTxt.split(":");

      extraTekst.textContent = "Extra tijd " + extraTxt;
      extraWeergave.innerHTML = `${emm}<span class="knipper">:</span>${ess}`;
      extraBtn.textContent = extraClock.running ? "Pauze extra tijd" : "Start extra tijd";

      panelExtra.style.display = extraClock.running ? "" : "none";
      document.title = mainTxt + " | HHC Stopwatch";

      latestMainText = mainTxt;
      latestExtraText = extraTxt;
      latestMainRunning = mainClock.running;
      latestExtraRunning = extraClock.running;

      const extraStartMoments = [45, 90, 105, 120].map((m) => m * 60000);

      if (mainClock.running) {
        for (const moment of extraStartMoments) {
          if (prevMainMs < moment && mainMsTrue >= moment) {
            extraClock.reset();
            extraClock.start();
            panelExtra.style.display = "";
          }
        }
      }

      prevMainMs = mainMsTrue;

      if (document.pictureInPictureElement) drawPiP();

      rafId = requestAnimationFrame(renderController);
    }

    mainClock.load();
    extraClock.load();
    prevMainMs = mainClock.elapsedTrue();

    renderController();

    return () => {
      controller.abort();
      cancelAnimationFrame(rafId);
      document.title = "HHC Hardenberg Hub";
      if (wakeLock) releaseWake();
      closePiPIfOpen();
    };
  }, []);

  return (
    <div ref={rootRef} className="hhc-stopwatch">
      <style>{`
        .hhc-stopwatch {
          --bg:#EC642B;
          --fg:#fff;
          --accent:#111;
          --card-bg:rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          background: var(--bg);
          color: var(--fg);
          font-family: 'Roboto', sans-serif;
          font-weight: 700;
          padding: 16px;
          border-radius: 16px;
        }
        .hhc-stopwatch.dark {
          --bg:#0b0b0b;
          --fg:#f2f2f2;
          --accent:#EC642B;
          --card-bg:rgba(255,255,255,0.06);
        }
        .hhc-stopwatch * { box-sizing: border-box; }
        .hhc-stopwatch .wrap { width: 100%; max-width: 1000px; margin: 0 auto; }
        .hhc-stopwatch .panels { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: stretch; width: 100%; }
        @media (min-width: 720px) { .hhc-stopwatch .panels { grid-template-columns: 2fr 1fr; } }
        .hhc-stopwatch .card { width: 100%; text-align: center; border-radius: 12px; padding: 16px; background: var(--card-bg); backdrop-filter: blur(6px); box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
        .hhc-stopwatch .tijd { font-variant-numeric: tabular-nums; font-weight: 700; font-size: clamp(36px, 20vw, 140px); line-height: 1; margin: 14px 0; text-align: center; }
        .hhc-stopwatch .extra-card .tijd { font-size: clamp(36px, 11vw, 90px); }
        .hhc-stopwatch .status { font-size: 14px; margin-bottom: 8px; opacity: .95; text-align: center; }
        .hhc-stopwatch .rij { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; width: 100%; }
        .hhc-stopwatch .rij.controls { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        @media (max-width: 520px) { .hhc-stopwatch .rij, .hhc-stopwatch .rij.controls { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        .hhc-stopwatch button { width: 100%; min-width: 0; border: none; background: var(--fg); color: var(--bg); padding: 10px 14px; border-radius: 8px; font-size: clamp(13px, 4vw, 16px); font-weight: 700; cursor: pointer; font-family: 'Roboto', sans-serif; transition: transform .08s ease, filter .2s ease; white-space: nowrap; }
        .hhc-stopwatch button:hover { filter: brightness(1.05); }
        .hhc-stopwatch button:active { transform: scale(0.97); }
        .hhc-stopwatch .primair { background: #111; color: var(--fg); }
        .hhc-stopwatch.dark .primair { background: var(--accent); color: #0b0b0b; }
        .hhc-stopwatch .sec { background: transparent; color: var(--fg); border: 2px solid var(--fg); }
        .hhc-stopwatch .knipper { animation: hhc-knipper 1s steps(2, start) infinite; }
        @keyframes hhc-knipper { to { visibility: hidden; } }
        .hhc-stopwatch .tools { width: 100%; max-width: 1000px; margin: 12px auto 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; justify-content: center; }
        @media (max-width: 520px) { .hhc-stopwatch .tools { grid-template-columns: 1fr; } }
        .hhc-stopwatch #pipCanvas, .hhc-stopwatch #pipVideo { position: fixed; left: -9999px; top: -9999px; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      `}</style>

      <div className="wrap">
        <div className="panels">
          <section className="card">
            <div id="weergave" className="tijd" aria-live="polite">
              00<span className="knipper">:</span>00
            </div>
            <div id="status" className="status">
              Gepauzeerd
            </div>

            <div className="rij">
              <button id="eersteBtn" className="primair">1e Helft (00:00)</button>
              <button id="tweedeBtn" className="primair">2e Helft (45:00)</button>
            </div>

            <div className="rij">
              <button id="eersteVerlBtn" className="primair">1e Verl. (90:00)</button>
              <button id="tweedeVerlBtn" className="primair">2e Verl. (105:00)</button>
            </div>

            <div className="rij controls">
              <button id="pauzeBtn">Start</button>
              <button id="resetBtn">Reset</button>
              <button id="plusMin" className="sec">+1 min</button>
              <button id="minMin" className="sec">-1 min</button>
            </div>

            <div className="rij">
              <button id="extraBtn" className="sec">Start extra tijd</button>
              <button id="extraResetBtn" className="sec">Reset extra tijd</button>
            </div>
          </section>

          <section className="card extra-card" id="panel-extra" style={{ display: "none" }}>
            <div id="extraTekst" className="status">Extra tijd 00:00</div>
            <div id="extraWeergave" className="tijd" aria-live="polite">
              00<span className="knipper">:</span>00
            </div>
          </section>
        </div>

        <div className="tools">
          <button id="wakeBtn" className="sec">Wake Lock uit</button>
          <button id="pipBtn" className="sec">Beeld in beeld</button>
          <button id="themeBtn" className="sec">Donker thema</button>
        </div>
      </div>

      <canvas id="pipCanvas" width={960} height={540} />
      <video id="pipVideo" muted playsInline />
    </div>
  );
}
