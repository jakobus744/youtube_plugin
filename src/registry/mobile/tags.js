import { qsa } from '../../core/dom.js'

// tagger fuer m.youtube.com
// untere leiste ueber die klassennamen der tabs, die sind nicht uebersetzt

export const TAG_ATTRS = ['data-ytx-mbpivot', 'data-ytx-mbtab']

const PIVOT = [
  [/\b(w2w|pivot-w2w|home)\b/, 'home'],
  [/\b(shorts|pivot-shorts)\b/, 'shorts'],
  [/\b(subs|pivot-subs|subscriptions)\b/, 'subs'],
  [/\b(library|pivot-library|you)\b/, 'you'],
  [/\b(create|upload|pivot-create)\b/, 'create']
]

export const tagRules = [
  {
    id: 'mb.pivot',
    label: 'Untere Leiste',
    run() {
      let n = 0
      for (const el of qsa('ytm-pivot-bar-item-renderer')) {
        const cls = [...el.querySelectorAll('.pivot-bar-item-tab, [class*="pivot"]')].map((x) => x.className).join(' ') + ' ' + el.className
        const hit = PIVOT.find(([re]) => re.test(cls))
        if (!hit) continue
        if (el.getAttribute('data-ytx-mbpivot') !== hit[1]) el.setAttribute('data-ytx-mbpivot', hit[1])
        n++
      }
      return n
    }
  },
  {
    id: 'mb.channelTabs',
    label: 'Kanal-Tabs',
    pages: ['channel'],
    run() {
      let n = 0
      // der shorts tab heisst in fast allen sprachen shorts
      for (const el of qsa('ytm-browse yt-tab-shape')) {
        const t = (el.getAttribute('tab-title') || el.textContent || '').trim()
        if (/^shorts$/i.test(t)) {
          el.setAttribute('data-ytx-mbtab', 'shorts')
          n++
        }
      }
      return n
    }
  }
]
