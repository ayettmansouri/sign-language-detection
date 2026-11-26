import { useEffect, useRef, useState } from 'react';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 10;

/**
 * Zone de depot d'image (glisser-deposer ou clic) + galerie d'exemples.
 *
 * Props :
 *  - onFile(file) : appelee avec l'image choisie
 *  - loading : desactive la zone pendant une inference
 * La galerie lit /examples/examples.json (voir public/examples/README.md) ;
 * elle est masquee tant que ce fichier est vide.
 */
export default function UploadZone({ onFile, loading = false }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const [examples, setExamples] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/examples/examples.json')
      .then((r) => r.json())
      .then((list) => !cancelled && Array.isArray(list) && setExamples(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function accept(file) {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError('Format non pris en charge : utilisez une image JPEG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Image trop lourde (maximum ${MAX_MB} Mo).`);
      return;
    }
    onFile(file);
  }

  async function pickExample(example) {
    setError(null);
    try {
      const res = await fetch(example.url);
      const blob = await res.blob();
      accept(new File([blob], example.url.split('/').pop() || 'exemple.jpg', { type: blob.type }));
    } catch {
      setError("Impossible de charger l'image d'exemple.");
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Déposer une image ou cliquer pour en choisir une"
        onClick={() => !loading && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !loading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!loading) accept(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-400'
        } ${loading ? 'cursor-wait opacity-60' : ''}`}
        data-testid="dropzone"
      >
        <span className="text-3xl" aria-hidden="true">🖼️</span>
        <p className="text-sm font-medium text-slate-700">
          {loading ? 'Analyse en cours…' : 'Glissez une image ici ou cliquez pour parcourir'}
        </p>
        <p className="text-xs text-slate-500">JPEG, PNG ou WEBP · {MAX_MB} Mo maximum</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {examples.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Images d’exemple</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {examples.map((ex) => (
              <button
                key={ex.url}
                type="button"
                disabled={loading}
                onClick={() => pickExample(ex)}
                title={ex.name}
                className="overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-2 hover:ring-indigo-400 disabled:opacity-50"
              >
                <img src={ex.url} alt={ex.name} className="aspect-square w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
