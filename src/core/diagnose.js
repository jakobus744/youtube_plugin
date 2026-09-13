import { log } from './log.js'

// module melden hier ihre pruefungen an
const checks = new Map()

export function registerCheck(id, group, label, run) {
  checks.set(id, { id, group, label, run })
  return () => checks.delete(id)
}

export function runChecks() {
  const out = []
  for (const c of checks.values()) {
    let r
    try {
      r = c.run() || { status: 'skip', detail: '' }
    } catch (e) {
      r = { status: 'fail', detail: `Prüfung abgestürzt: ${e.message}` }
      log.error(`check ${c.id}`, e)
    }
    const list = Array.isArray(r) ? r : [r]
    for (const item of list) out.push({ id: item.id || c.id, group: c.group, label: item.label || c.label, status: item.status, detail: item.detail || '' })
  }
  return out
}

export function summarize(results) {
  const s = { ok: 0, warn: 0, fail: 0, skip: 0 }
  for (const r of results) s[r.status] = (s[r.status] || 0) + 1
  return s
}

export function reportText(results, meta) {
  const lines = [`ytx Diagnose ${new Date().toISOString()}`, ...Object.entries(meta).map(([k, v]) => `${k}: ${v}`), '']
  let group = null
  for (const r of results) {
    if (r.group !== group) {
      group = r.group
      lines.push(`## ${group}`)
    }
    lines.push(`[${r.status.toUpperCase()}] ${r.label}${r.detail ? ` – ${r.detail}` : ''}`)
  }
  const errs = log.entries().filter((e) => e.level !== 'info')
  if (errs.length) {
    lines.push('', '## Log')
    for (const e of errs.slice(-30)) lines.push(`${new Date(e.t).toISOString()} ${e.level} ${e.msg}${e.n > 1 ? ` ×${e.n}` : ''}`)
  }
  return lines.join('\n')
}
