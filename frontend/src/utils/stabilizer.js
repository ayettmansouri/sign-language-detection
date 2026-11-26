/**
 * Stabilisation temporelle des predictions (vote majoritaire sur N images)
 * et decision d'ajouter une lettre au mot en cours de construction.
 *
 * A chaque image, on appelle push(label) avec la lettre la plus confiante
 * detectee (ou null s'il n'y a pas de main). Le stabilisateur renvoie :
 *   - stable    : lettre majoritaire sur la fenetre glissante (ou null)
 *   - committed : lettre a AJOUTER au mot (une seule fois), sinon null
 *   - progress  : 0..1, avancement avant validation de la lettre
 *   - locked    : true si la lettre stable est deja ajoutee (en attente
 *                 que la main soit retiree pour pouvoir la doubler)
 *
 * Regles :
 *   - une lettre est stable si elle a au moins `minVotes` votes sur les
 *     `windowSize` dernieres images ;
 *   - elle est validee apres `holdFrames` images stables consecutives ;
 *   - la meme lettre ne peut etre ajoutee deux fois de suite que si la main
 *     a disparu pendant au moins `releaseFrames` images (ex : "LL").
 */
export function createStabilizer({
  windowSize = 7,
  minVotes = 4,
  holdFrames = 5,
  releaseFrames = 4,
} = {}) {
  let votes = [];
  let current = null;
  let run = 0;
  let nullStreak = 0;
  let lastCommitted = null;
  let released = true;

  function majority() {
    const counts = new Map();
    for (const l of votes) if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
    let best = null;
    let bestN = 0;
    for (const [l, n] of counts) {
      if (n > bestN) {
        best = l;
        bestN = n;
      }
    }
    return bestN >= minVotes ? best : null;
  }

  return {
    push(label) {
      votes.push(label ?? null);
      if (votes.length > windowSize) votes.shift();

      nullStreak = label ? 0 : nullStreak + 1;
      if (nullStreak >= releaseFrames) released = true;

      const candidate = majority();
      if (candidate && candidate === current) {
        run += 1;
      } else {
        current = candidate;
        run = candidate ? 1 : 0;
      }

      let committed = null;
      if (current && run >= holdFrames && (current !== lastCommitted || released)) {
        committed = current;
        lastCommitted = current;
        released = false;
        run = 0;
      }

      const locked = Boolean(current) && current === lastCommitted && !released;
      return {
        stable: current,
        committed,
        progress: current ? (locked ? 1 : Math.min(1, run / holdFrames)) : 0,
        locked,
      };
    },
    reset() {
      votes = [];
      current = null;
      run = 0;
      nullStreak = 0;
      lastCommitted = null;
      released = true;
    },
  };
}
