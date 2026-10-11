// listet Ziele und Anker, die nur einen Selektor haben (kein Rueckfall, wenn YouTube umbaut)
// Aufruf: node tools/selector-audit.mjs
const mods = {
  youtube: ['../src/registry/youtube/targets.js', '../src/registry/youtube/anchors.js'],
  mobile: ['../src/registry/mobile/targets.js', '../src/registry/mobile/anchors.js'],
  music: ['../src/registry/music/targets.js', '../src/registry/music/anchors.js']
}

let single = 0
let total = 0
for (const [site, [t, a]] of Object.entries(mods)) {
  let tm
  let am
  try {
    tm = await import(t)
    am = await import(a)
  } catch (e) {
    console.log(`${site}: Import fehlgeschlagen (${e.message})`)
    continue
  }
  const lists = [
    ['Ziel', tm.targets],
    ['Anker', Array.isArray(am.anchors) ? am.anchors : Object.entries(am.anchors || {}).map(([id, v]) => ({ id, ...v }))]
  ]
  for (const [kind, list] of lists) {
    if (!Array.isArray(list)) continue
    for (const x of list) {
      const sel = [].concat(x.sel || x.selector || [])
      if (!sel.length) continue
      total++
      if (sel.length === 1) {
        single++
        console.log(`${site.padEnd(8)} ${kind.padEnd(6)} ${String(x.id).padEnd(34)} ${sel[0].slice(0, 90)}`)
      }
    }
  }
}
console.log(`\n${single} von ${total} Selektoren ohne Rückfall`)
