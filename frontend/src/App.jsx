import { useCallback, useEffect, useRef, useState } from 'react';
import UploadZone from './components/UploadZone';
import DetectionCanvas from './components/DetectionCanvas';
import ConfidenceBars from './components/ConfidenceBars';
import WebcamStream from './components/WebcamStream';
import LetterHistory from './components/LetterHistory';
import { useWordBuilder } from './hooks/useWordBuilder';
import { getHealth, getModelMetadata, predictImage, visualizeImage } from './services/api';

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}

function ImageTab() {
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [result, setResult] = useState(null); // { detections, serverMs, clientMs }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conf, setConf] = useState(0.25);
  const [iou, setIou] = useState(0.45);
  const requestId = useRef(0);

  const run = useCallback(async (f, c, i) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      const data = await predictImage(f, { conf: c, iou: i });
      if (id !== requestId.current) return; // reponse obsolete
      setResult({
        detections: data.detections,
        serverMs: data.inference_time_ms,
        clientMs: performance.now() - t0,
      });
    } catch (e) {
      if (id !== requestId.current) return;
      setResult(null);
      setError(
        e?.response?.data?.detail
          ? `Erreur de l'API : ${e.response.data.detail}`
          : "API injoignable. Vérifiez que le backend tourne sur le port 8000."
      );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  function handleFile(f) {
    setFile(f);
    setImageUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    run(f, conf, iou);
  }

  // Relance automatique (apres une courte pause) quand on change les seuils.
  useEffect(() => {
    if (!file) return undefined;
    const t = setTimeout(() => run(file, conf, iou), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conf, iou]);

  async function download() {
    try {
      const blob = await visualizeImage(file, { conf, iou });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `annotee_${file.name.replace(/\.[^.]+$/, '')}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Impossible de générer l'image annotée.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Image à analyser</h2>
        <UploadZone onFile={handleFile} loading={loading} />

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            Seuil de confiance : <b className="tabular-nums">{conf.toFixed(2)}</b>
            <input
              type="range" min="0.05" max="0.95" step="0.05" value={conf}
              onChange={(e) => setConf(Number(e.target.value))}
              className="mt-1 w-full accent-indigo-600"
            />
          </label>
          <label className="text-sm text-slate-600">
            Seuil IoU (NMS) : <b className="tabular-nums">{iou.toFixed(2)}</b>
            <input
              type="range" min="0.1" max="0.9" step="0.05" value={iou}
              onChange={(e) => setIou(Number(e.target.value))}
              className="mt-1 w-full accent-indigo-600"
            />
          </label>
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Résultat</h2>
          <DetectionCanvas imageUrl={imageUrl} detections={result?.detections ?? []} />
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {result && (
            <>
              <dl className="mt-4 grid grid-cols-3 gap-3">
                <Stat label="Serveur" value={`${result.serverMs.toFixed(0)} ms`} />
                <Stat label="Aller-retour" value={`${result.clientMs.toFixed(0)} ms`} />
                <Stat label="Détections" value={result.detections.length} />
              </dl>
              <button
                onClick={download}
                className="mt-4 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Télécharger l’image annotée
              </button>
            </>
          )}
        </section>
        <ConfidenceBars detections={result?.detections ?? []} />
      </div>
    </div>
  );
}

function WebcamTab() {
  const { text, addLetter, addSpace, backspace, clear } = useWordBuilder();
  const [detections, setDetections] = useState([]);
  const [stable, setStable] = useState({ stable: null, progress: 0, locked: false });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <WebcamStream onDetections={setDetections} onStable={setStable} onCommit={addLetter} />
        <ConfidenceBars detections={detections} />
      </div>
      <LetterHistory
        text={text}
        onSpace={addSpace}
        onBackspace={backspace}
        onClear={clear}
        stable={stable.locked ? null : stable.stable}
        progress={stable.progress}
      />
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('image');
  const [health, setHealth] = useState(null);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth({ status: 'down' }));
    getModelMetadata().then(setMeta).catch(() => {});
  }, []);

  const apiOk = health?.status === 'ok';
  const tabBtn = (id, label) => (
    <button
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        tab === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Détection de la langue des signes</h1>
          <p className="text-sm text-slate-500">
            Alphabet dactylologique ·{' '}
            {meta ? `${meta.architecture} · mAP@0.5 ${meta.map50.toFixed(3)}` : 'YOLOv8n + ONNX Runtime'}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            apiOk ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${apiOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
          {health === null ? 'API…' : apiOk ? `API connectée · ${health.model_version}` : 'API injoignable'}
        </span>
      </header>

      <nav role="tablist" className="mb-6 inline-flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {tabBtn('image', 'Image')}
        {tabBtn('webcam', 'Webcam en direct')}
      </nav>

      {tab === 'image' ? <ImageTab /> : <WebcamTab />}
    </main>
  );
}
