import { targets, GROUPS, targetById } from '../registry/mobile/targets.js'
import { anchors } from '../registry/mobile/anchors.js'
import { tagRules, TAG_ATTRS } from '../registry/mobile/tags.js'
import { colorControls, controls, themes, LOOK_GROUPS, controlById, TOKEN_SCOPE, extraCss } from '../registry/mobile/look.js'
import { pageFromUrl, videoIdFromUrl, PAGE_LABELS } from '../registry/youtube/pages.js'
import { channelRefOf } from '../registry/youtube/paths.js'
import { CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots, channelPageInfo, subscribedChannels, activePlayback, pauseActive } from '../registry/mobile/paths.js'
import { behaviors, behaviorById } from '../behaviors/mobile.js'
import subGroups from '../features/youtube/subGroups/index.js'
import watchTime from '../features/youtube/watchtime/index.js'
import { bootHashTokens } from './hashBoot.js'

// alles was ytx ueber m.youtube.com wissen muss
// kern, panel, profile, filter, abo gruppen und schauzeit sind dieselben wie am rechner

const FILTER_PAGES = [
  ['home', 'Startseite'],
  ['subscriptions', 'Abos'],
  ['search', 'Suche'],
  ['watch', 'Empfehlungen auf Videoseite'],
  ['channel', 'Kanal']
]

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
    bootHashTokens(() => document.documentElement.hasAttribute('dark') || document.documentElement.hasAttribute('darker-dark-theme'), 'mobil')
  }
}
