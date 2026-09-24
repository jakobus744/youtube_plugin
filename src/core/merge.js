// drei wege merge fuer gespeicherte daten mehrerer tabs
// was nur eine seite geaendert hat gewinnt, bei echtem konflikt die eigene seite
// arrays zaehlen als ein wert

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)

export function merge3(base, ours, theirs) {
  if (same(ours, base)) return theirs
  if (same(theirs, base)) return ours
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {}
    const out = {}
    for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      const v = merge3(b[k], ours[k], theirs[k])
      if (v !== undefined) out[k] = v
    }
    return out
  }
  return ours
}

export { same }
