const MAX = 100
const entries = []
const counts = new Map()

function stringify(x) {
  if (x instanceof Error) return x.message
  if (typeof x === 'string') return x
  try { return JSON.stringify(x) } catch { return String(x) }
}

function push(level, args) {
  const msg = args.map(stringify).join(' ')
  const last = entries[entries.length - 1]
  if (last && last.msg === msg && last.level === level) {
    last.n++
    last.t = Date.now()
  } else {
    entries.push({ t: Date.now(), level, msg, n: 1 })
    if (entries.length > MAX) entries.shift()
  }
  counts.set(level, (counts.get(level) || 0) + 1)
  if (level === 'error') console.error('[ytx]', ...args)
  else if (level === 'warn') console.warn('[ytx]', ...args)
}

export const log = {
  info: (...a) => push('info', a),
  warn: (...a) => push('warn', a),
  error: (...a) => push('error', a),
  entries: () => entries.slice(),
  count: (level) => counts.get(level) || 0
}

// faengt fehler ab damit youtube nie mitkaputt geht
export function guard(label, fn) {
  return function guarded(...args) {
    try {
      const r = fn.apply(this, args)
      if (r && typeof r.catch === 'function') r.catch((e) => log.error(label, e))
      return r
    } catch (e) {
      log.error(label, e)
      return undefined
    }
  }
}
