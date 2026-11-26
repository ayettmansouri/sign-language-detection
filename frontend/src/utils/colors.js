/** Couleur stable par lettre (A-Z), utilisee par le canvas, les barres et la webcam. */
export function colorFor(label) {
  const i = (label?.charCodeAt(0) ?? 65) - 65;
  return `hsl(${(i * 47) % 360} 80% 42%)`;
}
