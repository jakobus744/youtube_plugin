import { targets, GROUPS, targetById } from '../registry/mobile/targets.js'
import { anchors } from '../registry/mobile/anchors.js'
import { tagRules, TAG_ATTRS } from '../registry/mobile/tags.js'
import { colorControls, controls, themes, LOOK_GROUPS, controlById, TOKEN_SCOPE, extraCss, discoverTokens, setDiscovered } from '../registry/mobile/look.js'
import { pageFromUrl, videoIdFromUrl, PAGE_LABELS } from '../registry/youtube/pages.js'
import { channelRefOf } from '../registry/youtube/paths.js'
import { CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots, channelPageInfo, subscribedChannels, activePlayback, pauseActive } from '../registry/mobile/paths.js'
import { behaviors, behaviorById } from '../behaviors/mobile.js'
import subGroups from '../features/youtube/subGroups/index.js'
import watchTime from '../features/youtube/watchtime/index.js'
import { store } from '../core/store.js'
import { applyVars } from '../appliers/vars.js'
import { log } from '../core/log.js'

// alles was ytx ueber m.youtube.com wissen muss
// kern, panel, profile, filter, abo gruppen und schauzeit sind dieselben wie am rechner

const FILTER_PAGES = [
  ['home', 'Startseite'],
  ['subscriptions', 'Abos'],
  ['search', 'Suche'],
  ['watch', 'Empfehlungen auf Videoseite'],
  ['channel', 'Kanal']
]

// farbvariablen der seite an ihrem wert erkennen, sobald das css geladen ist
function discoverColors() {
  const html = document.documentElement
  const cs = getComputedStyle(html)
  const bg = cs.backgroundColor
  if (!bg || bg === 'rgba(0, 0, 0, 0)') return false
  const dark = html.hasAttribute('dark') || html.hasAttribute('darker-dark-theme')
  const text = getComputedStyle(document.body).color
  const vars = []
  for (let i = 0; i < cs.length; i++) if (cs[i].startsWith('--t')) vars.push([cs[i], cs.getPropertyValue(cs[i])])
  const refs = dark ? { bg, text, textSecondary: '#aaaaaa', raised: '#212121', menu: '#282828', accent: '#3ea6ff' } : { bg, text, textSecondary: '#606060', accent: '#065fd4' }
  const map = discoverTokens(vars, refs)
  setDiscovered(map)
  log.info(`mobil farben erkannt: ${Object.entries(map).map(([k, v]) => `${k} ${v.length}`).join(', ')}`)
  applyVars(store.config)
  return true
}

export const mobileSite = {
  id: 'mobile',
  label: 'YouTube mobil',
  appHost: 'ytm-app',
  pageFromUrl,
  videoIdFromUrl,
  PAGE_LABELS,
  targets,
  GROUPS,
  targetById,
  anchors,
  tagRules,
  tagAttrs: TAG_ATTRS,
  look: { colorControls, controls, themes, LOOK_GROUPS, controlById, tokenScope: TOKEN_SCOPE, extraCss },
  presets: { layoutPresets: [], presetById: {}, LAYOUT_PAGES: [], orderGroups: {}, topbarModes: [['', 'Fixiert (YouTube)']], topbarCss: {} },
  behaviors,
  behaviorById,
  features: [subGroups, watchTime],
  filters: { pages: FILTER_PAGES, CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots },
  channels: { channelRefOf, channelPageInfo, subscribedChannels },
  playback: { activePlayback, pauseActive },
  panelTabs: ['display', 'look', 'behavior', 'filters', 'features', 'subGroups', 'watchStats', 'profiles', 'diagnose'],
  boot() {
    let tries = 0
    const t = setInterval(() => {
      if (discoverColors() || ++tries > 40) clearInterval(t)
    }, 500)
  }
}
