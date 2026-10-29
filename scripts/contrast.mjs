// Verifică raportul de contrast WCAG pentru perechile de culori din src/styles.css (minim AA: 4,5:1).
const L = (hex) => {
  const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const pairs = [
  ['luminos: text / fundal', '#15202b', '#eef1f4'], ['luminos: text / card', '#15202b', '#ffffff'],
  ['luminos: secundar / card', '#4f5b67', '#ffffff'], ['luminos: secundar / fundal', '#4f5b67', '#eef1f4'], ['luminos: secundar / card-2', '#4f5b67', '#f6f8fa'],
  ['buton principal', '#1b2733', '#f2b705'], ['bară sus', '#ffffff', '#1b2733'], ['link', '#0b57a4', '#ffffff'],
  ['pericol', '#b3261e', '#fde8e7'], ['pericol / card', '#b3261e', '#ffffff'], ['ok', '#1e6b34', '#e3f4e8'], ['avertizare', '#5c4400', '#fff4d1'],
  ['toast', '#ffffff', '#1b2733'], ['toast eroare', '#ffffff', '#8c1d18'], ['toast ok', '#ffffff', '#1e5c30'],
  ['întunecat: text / fundal', '#e8eef4', '#0e141a'], ['întunecat: text / card', '#e8eef4', '#17212b'], ['întunecat: secundar / card', '#a9b6c3', '#17212b'],
  ['întunecat: secundar / card-2', '#a9b6c3', '#1e2a36'], ['întunecat: link', '#7cb8ff', '#17212b'], ['întunecat: pericol', '#ff8a80', '#3d1614'],
  ['întunecat: ok', '#8fd6a2', '#12321c'], ['întunecat: avertizare', '#ffe08a', '#3a2e05'], ['întunecat: bară sus', '#ffffff', '#0a1016'],
]
let fail = 0
for (const [n, a, b] of pairs) {
  const r = ratio(a, b)
  const ok = r >= 4.5
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${n}: ${r.toFixed(2)}:1`)
}
if (fail) process.exit(1)
