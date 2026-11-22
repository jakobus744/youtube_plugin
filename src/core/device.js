// feste zufaellige id je geraet, damit verlaeufe mehrerer geraete zusammengefuehrt werden koennen
// liegt im skriptspeicher (alle youtube seiten eines geraets teilen ihn) und nie in profilen oder exporten

const KEY = 'ytx.device'
let cached = null

function read() {
  try {
    if (typeof GM_getValue === 'function') return GM_getValue(KEY, null)
  } catch {}
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function write(v) {
  try {
    if (typeof GM_setValue === 'function') return GM_setValue(KEY, v)
  } catch {}
  try {
    localStorage.setItem(KEY, v)
  } catch {}
}

export function deviceId() {
  if (cached) return cached
  let v = read()
  if (typeof v !== 'string' || !/^d-[a-z0-9]{8,}$/.test(v)) {
    v = `d-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
    write(v)
  }
  cached = v
  return v
}
