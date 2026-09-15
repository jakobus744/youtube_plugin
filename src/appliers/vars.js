import { site } from '../sites/index.js'
import { setCss } from '../core/css.js'

// farben ueber die tokens der jeweiligen seite, rest ueber extraCss der registry
export function buildVarsCss(vars, look = site.look) {
  const theme = look.themes.find((t) => t.id === vars.theme) || look.themes[0]
  const colors = { ...theme.values }
  for (const c of look.colorControls) if (vars[c.id]) colors[c.id] = vars[c.id]

  const out = []
  const decl = []
  for (const c of look.colorControls) {
    const v = colors[c.id]
    if (!v) continue
    for (const token of c.tokens) decl.push(`${token}: ${v} !important;`)
    if (c.extra) out.push(c.extra(v))
  }
  if (decl.length) out.unshift(`${look.tokenScope} { ${decl.join(' ')} }`)
  const extra = look.extraCss?.(colors)
  if (extra) out.push(extra)

  for (const c of look.controls) {
    const v = vars[c.id]
    if (v === undefined || v === null || v === '') continue
    out.push(c.css(v))
  }
  return out.join('\n')
}

export function applyVars(cfg) {
  setCss('vars', buildVarsCss(cfg.vars))
}
