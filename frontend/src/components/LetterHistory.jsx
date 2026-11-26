import { useState } from 'react';

/**
 * Affiche le mot construit a partir des lettres detectees.
 *
 * Props :
 *  - text : mot courant (string)
 *  - onSpace / onBackspace / onClear : actions (voir useWordBuilder)
 *  - stable : lettre en cours de validation (optionnel, ex. "A")
 *  - progress : avancement 0..1 de la validation (optionnel)
 */
export default function LetterHistory({ text, onSpace, onBackspace, onClear, stable = null, progress = 0 }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible : on ignore */
    }
  }

  const btn =
    'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-800">Mot construit</h2>
        <span className="text-xs text-slate-500">{text.length} caractère{text.length > 1 ? 's' : ''}</span>
      </header>

      <div className="p-5">
        <div
          className="flex min-h-[72px] flex-wrap items-center gap-1 rounded-xl bg-slate-900 px-4 py-3 font-mono text-3xl tracking-widest text-white"
          aria-live="polite"
          data-testid="word"
        >
          {text === '' && !stable && <span className="text-base tracking-normal text-slate-500">Les lettres validées apparaissent ici…</span>}
          <span className="whitespace-pre-wrap break-all">{text}</span>
          {stable && (
            <span
              className="rounded bg-white/15 px-1.5 text-slate-300"
              style={{ opacity: 0.35 + 0.65 * progress }}
              title="Lettre en cours de validation"
            >
              {stable}
            </span>
          )}
          <span className="ml-0.5 inline-block h-7 w-0.5 animate-pulse bg-indigo-400" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className={btn} onClick={onSpace} disabled={!text}>
            Espace
          </button>
          <button className={btn} onClick={onBackspace} disabled={!text}>
            ⌫ Effacer la dernière
          </button>
          <button className={btn} onClick={onClear} disabled={!text}>
            Tout effacer
          </button>
          <button className={btn} onClick={copy} disabled={!text}>
            {copied ? 'Copié ✓' : 'Copier'}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Maintenez un signe environ une seconde pour l’ajouter. Pour répéter la même lettre (ex. « LL »),
          retirez la main de l’image entre les deux.
        </p>
      </div>
    </section>
  );
}
