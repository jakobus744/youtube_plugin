// alles was beim neu laden oder deaktivieren abgeraeumt werden muss
const disposers = []

export function onDispose(fn) {
  disposers.push(fn)
  return fn
}

export function listen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts)
  return onDispose(() => target.removeEventListener(type, fn, opts))
}

export function disposeAll() {
  while (disposers.length) {
    const fn = disposers.pop()
    try { fn() } catch (e) { console.warn('[ytx] dispose', e) }
  }
}
