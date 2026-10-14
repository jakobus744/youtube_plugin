import { qsa } from '../../core/dom.js'

// tagger fuer m.youtube.com
// untere leiste ueber die klassennamen der tabs, die sind nicht uebersetzt

export const TAG_ATTRS = ['data-ytx-mbpivot', 'data-ytx-mbtab', 'data-ytx-mbgames']

// regal "Playables" (Instant-Spiele): erkannt am link nach /playables oder an einer klasse mit mini-game
const GAME_HINT = 'a[href*="/playables"], [class*="mini-game"], [class*="minigame"], [class*="playables"]'
const GAME_HOLDER = 'ytm-rich-section-renderer, ytm-rich-item-renderer, ytm-item-section-renderer, ytm-shelf-renderer'

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
    id: 'mb.games',
    label: 'Spiele-Regale (Playables)',
    pages: ['home', 'subscriptions', 'search', 'watch'],
    run() {
      let n = 0
      for (const hit of qsa(GAME_HINT)) {
        const holder = hit.closest(GAME_HOLDER)
        if (!holder) continue
        if (!holder.hasAttribute('data-ytx-mbgames')) holder.setAttribute('data-ytx-mbgames', '')
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
