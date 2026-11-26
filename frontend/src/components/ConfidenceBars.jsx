import { colorFor } from '../utils/colors';

/**
 * Barres de confiance animees pour les meilleures detections.
 * Note : l'API renvoie la confiance de chaque detection retenue (apres NMS),
 * pas le vecteur complet des 26 probabilites.
 */
export default function ConfidenceBars({ detections = [], max = 5 }) {
  const top = [...detections].sort((a, b) => b.confidence - a.confidence).slice(0, max);

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-800">Confiance par détection</h2>
      </header>
      <div className="space-y-3 p-5" data-testid="confidence-bars">
        {top.length === 0 && <p className="text-sm text-slate-400">Aucune lettre détectée.</p>}
        {top.map((d, i) => {
          const pct = Math.round(d.confidence * 100);
          return (
            <div key={`${d.label}-${i}`} className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ background: colorFor(d.label) }}
              >
                {d.label}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${pct}%`, background: colorFor(d.label) }}
                />
              </div>
              <span className="w-12 text-right text-sm tabular-nums text-slate-600">{pct}%</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
