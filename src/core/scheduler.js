// bewusst nur setTimeout weil rAF in hintergrund tabs pausiert
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function debounce(fn, wait = 150, maxWait = 0) {
  let timer = null
  let first = 0
  const run = () => {
    timer = null
    first = 0
    fn()
  }
  const call = () => {
    const now = Date.now()
    if (!first) first = now
    clearTimeout(timer)
    if (maxWait && now - first >= maxWait) return run()
    timer = setTimeout(run, wait)
  }
  call.cancel = () => {
    clearTimeout(timer)
    timer = null
    first = 0
  }
  call.flush = () => {
    if (timer) {
      clearTimeout(timer)
      run()
    }
  }
  return call
}

export async function waitFor(check, { timeout = 5000, interval = 100 } = {}) {
  const end = Date.now() + timeout
  for (;;) {
    let v
    try { v = check() } catch { v = null }
    if (v) return v
    if (Date.now() > end) return null
    await sleep(interval)
  }
}
