import { h } from '../core/dom.js'
import { renderStats, openFull } from '../features/stats/view.js'

// gemeinsame statistik fuer youtube und music, gross ueber „⤢ Groß“
export function statsTab() {
  const root = h('div')
  renderStats(root, { onFull: openFull })
  return root
}
