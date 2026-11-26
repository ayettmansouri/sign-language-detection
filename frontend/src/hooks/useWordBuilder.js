import { useCallback, useState } from 'react';

/**
 * Etat du mot en cours de construction (utilise par LetterHistory).
 *
 *   const { text, addLetter, addSpace, backspace, clear } = useWordBuilder();
 *   <WebcamStream onCommit={addLetter} />
 *   <LetterHistory text={text} onSpace={addSpace} onBackspace={backspace} onClear={clear} />
 */
export function useWordBuilder() {
  const [text, setText] = useState('');

  const addLetter = useCallback((letter) => setText((t) => t + letter), []);
  const addSpace = useCallback(
    () => setText((t) => (t && !t.endsWith(' ') ? `${t} ` : t)),
    []
  );
  const backspace = useCallback(() => setText((t) => t.slice(0, -1)), []);
  const clear = useCallback(() => setText(''), []);

  return { text, addLetter, addSpace, backspace, clear };
}
