import { useCallback, useEffect, useRef, useState } from 'react';
import { predictImage } from '../services/api';
import { createStabilizer } from '../utils/stabilizer';
import { colorFor } from '../utils/colors';

const CAPTURE_WIDTH = 416; // meme taille que l'entrainement (416x416)
const JPEG_QUALITY = 0.7;
const EMPTY_STABLE = { stable: null, committed: null, progress: 0, locked: false };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAbort(e) {
  return e?.name === 'CanceledError' || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED';
}

function cameraErrorMessage(e) {
  switch (e?.name) {
    case 'NotAllowedError':
      return "Accès à la caméra refusé. Autorisez-la dans la barre d'adresse du navigateur, puis réessayez.";
    case 'NotFoundError':
      return 'Aucune caméra détectée sur cet appareil.';
    case 'NotReadableError':
      return 'La caméra est utilisée par une autre application. Fermez-la puis réessayez.';
    default:
      return e?.message === 'no-media-devices'
        ? 'La caméra nécessite une page en HTTPS ou en localhost.'
        : `Impossible de démarrer la caméra (${e?.message ?? 'erreur inconnue'}).`;
  }
}

/**
 * Detection en temps reel depuis la webcam.
 *
 * Props (toutes optionnelles) :
 *  - onDetections(detections, info) : liste brute a chaque image
 *  - onStable({stable, progress, locked}) : lettre stabilisee (vote sur N images)
 *  - onCommit(letter) : lettre validee, a ajouter au mot
 *  - targetFps : cadence maximale des requetes (defaut 8)
 *  - initialConf / iou : seuils envoyes a l'API
 */
export default function WebcamStream({
  onDetections,
  onStable,
  onCommit,
  targetFps = 8,
  initialConf = 0.4,
  iou = 0.45,
}) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureRef = useRef(null);
  const streamRef = useRef(null);
  const abortRef = useRef(null);
  const runningRef = useRef(false);
  const stabilizerRef = useRef(createStabilizer());
  const confRef = useRef(initialConf);
  const callbacksRef = useRef({});
  callbacksRef.current = { onDetections, onStable, onCommit };

  const [status, setStatus] = useState('idle'); // idle | starting | running | error
  const [error, setError] = useState(null);
  const [apiDown, setApiDown] = useState(false);
  const [conf, setConf] = useState(initialConf);
  const [stable, setStable] = useState(EMPTY_STABLE);
  const [stats, setStats] = useState({ serverMs: null, clientMs: null, fps: null, count: 0 });

  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Dessine les boites. La video est affichee en miroir : on inverse donc les x
  // (et on ne retourne pas le canvas, pour que le texte reste lisible).
  const drawOverlay = useCallback((detections, frameW, frameH) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    const sx = cw / frameW;
    const sy = ch / frameH;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (const d of detections) {
      const { x1, y1, x2, y2 } = d.bbox;
      const x = cw - x2 * sx;
      const y = y1 * sy;
      const w = (x2 - x1) * sx;
      const h = (y2 - y1) * sy;
      const color = colorFor(d.label);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);
      const text = `${d.label} ${Math.round(d.confidence * 100)}%`;
      const tw = ctx.measureText(text).width + 10;
      const ty = y - 22 < 0 ? y : y - 22;
      ctx.fillStyle = color;
      ctx.fillRect(x - 1.5, ty, tw, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + 4, ty + 4);
    }
  }, []);

  const loop = useCallback(async () => {
    const video = videoRef.current;
    const minInterval = 1000 / targetFps;
    let fpsEma = null;
    let lastEnd = performance.now();

    while (runningRef.current) {
      const t0 = performance.now();

      if (!video || video.readyState < 2 || !video.videoWidth) {
        await sleep(50);
        continue;
      }

      const w = CAPTURE_WIDTH;
      const h = Math.round((w * video.videoHeight) / video.videoWidth);
      const cv = captureRef.current ?? (captureRef.current = document.createElement('canvas'));
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(video, 0, 0, w, h);
      const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) {
        await sleep(100);
        continue;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await predictImage(blob, {
          conf: confRef.current,
          iou,
          signal: controller.signal,
        });
        if (!runningRef.current) break;
        const t1 = performance.now();

        setApiDown(false);
        drawOverlay(data.detections, w, h);

        const top = data.detections.reduce(
          (best, d) => (!best || d.confidence > best.confidence ? d : best),
          null
        );
        const result = stabilizerRef.current.push(top ? top.label : null);
        setStable(result);

        const cb = callbacksRef.current;
        cb.onDetections?.(data.detections, { serverMs: data.inference_time_ms, clientMs: t1 - t0 });
        cb.onStable?.(result);
        if (result.committed) cb.onCommit?.(result.committed);

        const instFps = 1000 / Math.max(1, t1 - lastEnd);
        lastEnd = t1;
        fpsEma = fpsEma == null ? instFps : fpsEma * 0.8 + instFps * 0.2;
        setStats({
          serverMs: data.inference_time_ms,
          clientMs: t1 - t0,
          fps: fpsEma,
          count: data.detections.length,
        });
      } catch (e) {
        if (isAbort(e) || !runningRef.current) break;
        setApiDown(true);
        clearOverlay();
        callbacksRef.current.onDetections?.([], null);
        await sleep(1000);
      }

      const elapsed = performance.now() - t0;
      if (elapsed < minInterval) await sleep(minInterval - elapsed);
    }
  }, [targetFps, iou, drawOverlay, clearOverlay]);

  // Arrete la boucle et libere la camera (sans toucher a l'etat React).
  const teardown = useCallback(() => {
    runningRef.current = false;
    abortRef.current?.abort();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    teardown();
    clearOverlay();
    stabilizerRef.current.reset();
    setStatus('idle');
    setApiDown(false);
    setStable(EMPTY_STABLE);
    setStats({ serverMs: null, clientMs: null, fps: null, count: 0 });
    callbacksRef.current.onDetections?.([], null);
    callbacksRef.current.onStable?.(EMPTY_STABLE);
  }, [teardown, clearOverlay]);

  const start = useCallback(async () => {
    setError(null);
    setStatus('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-media-devices');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      stabilizerRef.current.reset();
      runningRef.current = true;
      setStatus('running');
      loop();
    } catch (e) {
      teardown();
      setError(cameraErrorMessage(e));
      setStatus('error');
    }
  }, [loop, teardown]);

  // Libere la camera quand le composant est demonte.
  useEffect(() => teardown, [teardown]);

  const running = status === 'running';

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-800">Détection en direct (webcam)</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            running ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${running ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
          {running ? 'En cours' : status === 'starting' ? 'Démarrage…' : 'Arrêtée'}
        </span>
      </header>

      <div className="p-5">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-900">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
            playsInline
            muted
            data-testid="webcam-video"
          />
          <canvas
            ref={overlayRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            data-testid="webcam-overlay"
          />
          {!running && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-300">
              {status === 'starting'
                ? 'Autorisez l’accès à la caméra…'
                : 'Cliquez sur « Démarrer la caméra » pour lancer la détection.'}
            </div>
          )}
          {running && stable.stable && (
            <div className="absolute right-3 top-3 flex h-16 w-16 items-center justify-center rounded-xl bg-black/60 text-4xl font-bold text-white backdrop-blur">
              {stable.stable}
            </div>
          )}
        </div>

        {running && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>
                {stable.stable
                  ? stable.locked
                    ? `Lettre « ${stable.stable} » ajoutée — retirez la main pour répéter`
                    : `Validation de « ${stable.stable} »…`
                  : 'Aucune lettre stable'}
              </span>
              <span>{Math.round(stable.progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  stable.locked ? 'bg-emerald-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${stable.progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {apiDown && (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            API injoignable : nouvelle tentative en cours. Vérifiez que le backend tourne sur le port 8000.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {running ? (
            <button
              onClick={stop}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Arrêter
            </button>
          ) : (
            <button
              onClick={start}
              disabled={status === 'starting'}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              Démarrer la caméra
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Seuil de confiance
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={conf}
              onChange={(e) => {
                const v = Number(e.target.value);
                setConf(v);
                confRef.current = v;
              }}
              className="w-32 accent-indigo-600"
            />
            <span className="w-10 tabular-nums">{conf.toFixed(2)}</span>
          </label>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          {[
            ['Serveur', stats.serverMs != null ? `${stats.serverMs.toFixed(0)} ms` : '—'],
            ['Aller-retour', stats.clientMs != null ? `${stats.clientMs.toFixed(0)} ms` : '—'],
            ['Cadence', stats.fps != null ? `${stats.fps.toFixed(1)} img/s` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-sm font-semibold tabular-nums text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
