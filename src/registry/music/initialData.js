// youtube music rendert die seitendaten als initialData.push aufrufe ins html
// damit lassen sich kuenstler, alben, playlists und suche ohne api aufruf laden

const RE = /initialData\.push\(\{path: '((?:\\.|[^'])*)', params: JSON\.parse\('((?:\\.|[^'])*)'\), data: '((?:\\.|[^'])*)'\}\)/g

const SIMPLE = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' }

// ein durchgang ueber alle escape sequenzen eines js string literals
function unescapeJs(s) {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, (_, e) => {
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16))
    if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16))
    return SIMPLE[e] ?? e
  })
}

export function extractInitialData(html) {
  const out = []
  RE.lastIndex = 0
  let m
  while ((m = RE.exec(html))) {
    try {
      out.push({ path: unescapeJs(m[1]), params: JSON.parse(unescapeJs(m[2])), data: JSON.parse(unescapeJs(m[3])) })
    } catch (e) {
      out.push({ path: null, error: e.message })
    }
  }
  return out
}

// hauptdaten einer seite, guide wird ignoriert
export function mainData(html) {
  const blocks = extractInitialData(html)
  const main = blocks.find((b) => b.path && b.path !== '/guide')
  return main ? { path: main.path, params: main.params, data: main.data } : null
}
