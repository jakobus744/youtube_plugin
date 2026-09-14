import { controls, colorControls, themes, searchboxCss } from '../registry/look.js'
import { setCss } from '../core/css.js'

// farben ueberschreiben youtubes eigene tokens
// [dark] und [light] definieren tokens auch auf inneren elementen neu
const TOKEN_SCOPE = 'html:root:root, html:root:root [dark], html:root:root [light]'

export function buildVarsCss(vars) {
  const theme = themes.find((t) => t.id === vars.theme) || themes[0]
  const colors = { ...theme.values }
  for (const c of colorControls) if (vars[c.id]) colors[c.id] = vars[c.id]

  const out = []
  const decl = []
  for (const c of colorControls) {
    const v = colors[c.id]
    if (!v) continue
    for (const token of c.tokens) decl.push(`${token}: ${v} !important;`)
    if (c.extra) out.push(c.extra(v))
  }
  if (decl.length) out.unshift(`${TOKEN_SCOPE} { ${decl.join(' ')} }`)
  const search = searchboxCss(colors)
  if (search) out.push(search)

  for (const c of controls) {
    const v = vars[c.id]
    if (v === undefined || v === null || v === '') continue
    out.push(c.css(v))
  }
  return out.join('\n')
}

export function applyVars(cfg) {
  setCss('vars', buildVarsCss(cfg.vars))
}
