import { dataOf, pick } from '../core/bridge.js'
import { qsa } from '../core/dom.js'

// tagger regeln
// youtube liefert lokalisierte labels daher tagging ueber icon namen aus polymer daten

const BUTTON_ICONS = [
  [/SHARE/, 'share'],
  [/PLAYLIST_ADD|SAVE/, 'save'],
  [/DOWNLOAD/, 'download'],
  [/CONTENT_CUT|CLIP/, 'clip'],
  [/MONEY_HEART|THANKS/, 'thanks'],
  [/SPARK/, 'ask'],
  [/FLAG/, 'report'],
  [/LIKE/, 'like']
]

function iconOf(item) {
  if (!item) return ''
  const key = Object.keys(item)[0] || ''
  const v = item[key] || {}
  if (key === 'segmentedLikeDislikeButtonViewModel' || key === 'segmentedLikeDislikeButtonRenderer') return 'LIKE'
  if (key === 'downloadButtonRenderer') return 'DOWNLOAD'
  return v.iconName || v.icon?.iconType || v.buttonViewModel?.iconName || v.defaultIcon?.iconType || key
}

function buttonName(item) {
  const icon = String(iconOf(item))
  for (const [re, name] of BUTTON_ICONS) if (re.test(icon)) return name
  return `icon-${icon.toLowerCase()}`
}

function tagButtons(menu) {
  const d = dataOf(menu)
  if (!d) return 0
  let n = 0
  const top = qsa(':scope > #top-level-buttons-computed > *', menu)
  const topData = d.topLevelButtons || []
  if (top.length === topData.length) {
    top.forEach((el, i) => {
      const name = buttonName(topData[i])
      if (el.getAttribute('data-ytx-btn') !== name) el.setAttribute('data-ytx-btn', name)
      n++
    })
  }
  const flex = qsa(':scope > #flexible-item-buttons > *', menu)
  const flexData = (d.flexibleItems || []).map((f) => f.menuFlexibleItemRenderer?.topLevelButton)
  if (flex.length === flexData.length) {
    flex.forEach((el, i) => {
      const name = buttonName(flexData[i])
      if (el.getAttribute('data-ytx-btn') !== name) el.setAttribute('data-ytx-btn', name)
      n++
    })
  } else {
    // youtube schiebt bei wenig platz buttons ins menue dann nur ueber tagnamen
    for (const el of flex) if (el.tagName === 'YTD-DOWNLOAD-BUTTON-RENDERER') el.setAttribute('data-ytx-btn', 'download')
  }
  return n
}

const SECTION_RULES = [
  ['more', /PREMIUM|STUDIO|YOUTUBE_MUSIC|YOUTUBE_KIDS|UNPLUGGED|YOUTUBE_RED/],
  ['settings', /SETTINGS|FLAG|HELP|FEEDBACK/],
  ['you', /ACCOUNT_CIRCLE|WATCH_HISTORY|PLAYLISTS|WATCH_LATER|LIKE|VIDEO_LIBRARY|MY_VIDEOS|OFFLINE_DOWNLOAD|CONTENT_CUT|PURCHASE/],
  ['explore', /TRENDING|FIRE|SHOPPING|MUSIC|GAMING|NEWS|SPORTS|LIVE|MOVIE|FASHION|PODCAST|COURSE|LEARNING|EXPLORE/],
  ['main', /TAB_HOME|TAB_SHORTS|TAB_SUBSCRIPTIONS/]
]

function entryIcon(item) {
  const k = Object.keys(item || {})[0]
  const r = item?.[k] || {}
  return { key: k, icon: r.icon?.iconType || '', browseId: r.navigationEndpoint?.browseEndpoint?.browseId || '', reel: !!r.navigationEndpoint?.reelWatchEndpoint }
}

function classifySection(d) {
  const items = d?.items || []
  const score = new Map()
  for (const it of items) {
    const e = entryIcon(it)
    if (e.key === 'guideCollapsibleSectionEntryRenderer' || /^UC/.test(e.browseId)) {
      score.set('subscriptions', (score.get('subscriptions') || 0) + 1)
      continue
    }
    for (const [name, re] of SECTION_RULES) {
      if (re.test(e.icon)) {
        score.set(name, (score.get(name) || 0) + 1)
        break
      }
    }
  }
  let best = null
  let max = 0
  for (const [k, v] of score) if (v > max) [best, max] = [k, v]
  return best
}

export const tagRules = [
  {
    id: 'watch.buttons',
    core: true,
    label: 'Buttons der Aktionsleiste',
    pages: ['watch'],
    run() {
      let n = 0
      for (const menu of qsa('ytd-watch-metadata #actions ytd-menu-renderer')) n += tagButtons(menu)
      return n
    }
  },
  {
    id: 'guide.entries',
    label: 'Seitenleisten-Einträge',
    run() {
      let n = 0
      for (const el of qsa('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer')) {
        const d = dataOf(el)
        if (!d) continue
        const icon = d.icon?.iconType || ''
        const name = /SHORTS/.test(icon) || d.navigationEndpoint?.reelWatchEndpoint ? 'shorts' : /SUBSCRIPTIONS/.test(icon) ? 'subscriptions' : /TAB_HOME/.test(icon) ? 'home' : null
        if (name && el.getAttribute('data-ytx-guide') !== name) el.setAttribute('data-ytx-guide', name)
        if (name) n++
      }
      for (const el of qsa('ytd-guide-renderer #sections > ytd-guide-section-renderer, ytd-guide-renderer #sections > ytd-guide-collapsible-section-entry-renderer')) {
        const d = dataOf(el)
        const kind = el.tagName === 'YTD-GUIDE-COLLAPSIBLE-SECTION-ENTRY-RENDERER' ? 'subscriptions' : classifySection(d)
        if (kind && el.getAttribute('data-ytx-guide-section') !== kind) el.setAttribute('data-ytx-guide-section', kind)
        if (kind) n++
      }
      for (const el of qsa('ytd-guide-renderer #sections > ytd-guide-subscriptions-section-renderer')) {
        el.setAttribute('data-ytx-guide-section', 'subscriptions')
        n++
      }
      return n
    }
  },
  {
    id: 'top.buttons',
    label: 'Kopfzeilen-Buttons',
    run() {
      let n = 0
      for (const el of qsa('ytd-masthead #buttons > *')) {
        const d = dataOf(el)
        const icon = String(d?.icon?.iconType || pick(d, 'buttonRenderer.icon.iconType') || '')
        const name = /VIDEO_CALL|UPLOAD|ADD/.test(icon) ? 'create' : /NOTIFICATION/.test(icon) || el.tagName === 'YTD-NOTIFICATION-TOPBAR-BUTTON-RENDERER' ? 'notifications' : null
        if (name) {
          el.setAttribute('data-ytx-top', name)
          n++
        }
      }
      return n
    }
  },
  {
    id: 'channel.tabs',
    label: 'Kanal-Tabs',
    pages: ['channel'],
    run() {
      let n = 0
      const browse = document.querySelector('ytd-browse[page-subtype="channels"]')
      const d = dataOf(browse)
      const tabs = pick(d, 'contents.twoColumnBrowseResultsRenderer.tabs') || []
      const urls = tabs.map((t) => pick(t, 'tabRenderer.endpoint.commandMetadata.webCommandMetadata.url') || pick(t, 'expandableTabRenderer.endpoint.commandMetadata.webCommandMetadata.url') || '')
      const els = qsa('ytd-browse[page-subtype="channels"] yt-tab-group-shape yt-tab-shape, ytd-browse[page-subtype="channels"] tp-yt-paper-tab')
      if (els.length && els.length <= urls.length) {
        els.forEach((el, i) => {
          const url = urls[i] || ''
          const name = /\/shorts$/.test(url) ? 'shorts' : /\/(posts|community)$/.test(url) ? 'posts' : /\/videos$/.test(url) ? 'videos' : /\/streams$/.test(url) ? 'streams' : null
          if (name) {
            el.setAttribute('data-ytx-tab', name)
            n++
          }
        })
      }
      return n
    }
  },
  {
    id: 'cards.live',
    label: 'Live-Markierung auf Kacheln',
    run() {
      let n = 0
      for (const b of qsa('badge-shape[class*="Live"], ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"], ytd-badge-supported-renderer .badge-style-type-live-now-alternate')) {
        const card = b.closest('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer')
        if (card && !card.hasAttribute('data-ytx-live')) {
          card.setAttribute('data-ytx-live', '')
          n++
        }
      }
      return n
    }
  }
]
