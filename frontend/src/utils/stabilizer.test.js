import test from 'node:test';
import assert from 'node:assert/strict';
import { createStabilizer } from './stabilizer.js';

/** Fait passer une sequence d'images et renvoie les lettres validees. */
function run(sequence, options) {
  const s = createStabilizer(options);
  const committed = [];
  for (const label of sequence) {
    const r = s.push(label);
    if (r.committed) committed.push(r.committed);
  }
  return committed;
}

const rep = (label, n) => Array(n).fill(label);

test('une lettre tenue est ajoutee une seule fois', () => {
  assert.deepEqual(run(rep('A', 30)), ['A']);
});

test('un scintillement isole ne change pas le resultat', () => {
  const seq = [...rep('A', 6), 'B', ...rep('A', 10)];
  assert.deepEqual(run(seq), ['A']);
});

test('trop peu d\'images stables : rien n\'est ajoute', () => {
  assert.deepEqual(run(rep('A', 5)), []);
});

test('deux lettres differentes a la suite', () => {
  const seq = [...rep('H', 15), ...rep('I', 15)];
  assert.deepEqual(run(seq), ['H', 'I']);
});

test('meme lettre doublee seulement apres retrait de la main', () => {
  const seq = [...rep('L', 15), ...rep(null, 6), ...rep('L', 15)];
  assert.deepEqual(run(seq), ['L', 'L']);
});

test('sans retrait de la main, pas de doublon', () => {
  const seq = [...rep('L', 15), null, null, ...rep('L', 15)];
  assert.deepEqual(run(seq), ['L']);
});

test('absence de main : aucune lettre', () => {
  assert.deepEqual(run(rep(null, 40)), []);
});

test('alternance rapide A/B : aucune majorite stable, rien n\'est ajoute', () => {
  const seq = Array.from({ length: 40 }, (_, i) => (i % 2 ? 'A' : 'B'));
  assert.deepEqual(run(seq), []);
});

test('progress monte jusqu\'a 1 puis la lettre est verrouillee', () => {
  const s = createStabilizer();
  let last;
  for (const l of rep('K', 12)) last = s.push(l);
  assert.equal(last.stable, 'K');
  assert.equal(last.locked, true);
  assert.equal(last.progress, 1);
});

test('reset remet l\'etat a zero', () => {
  const s = createStabilizer();
  for (const l of rep('A', 12)) s.push(l);
  s.reset();
  const committed = [];
  for (const l of rep('A', 12)) {
    const r = s.push(l);
    if (r.committed) committed.push(r.committed);
  }
  assert.deepEqual(committed, ['A']);
});
