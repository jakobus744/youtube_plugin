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
import { setCss } from '../core/css.js'

// die mobilseite kennt die youtube farbtokens nicht, ytx elemente brauchen sie fuer hell und dunkel
// ein ytx theme ueberschreibt sie mit html:root:root
// darker-dark-theme steht auch im hellen modus am html, deshalb zaehlt die textfarbe der seite
const BASE_TOKENS = `html {
  --yt-sys-color-baseline--base-background: #fff; --yt-sys-color-baseline--raised-background: #fff; --yt-sys-color-baseline--menu-background: #fff;
  --yt-sys-color-baseline--text-primary: #0f0f0f; --yt-sys-color-baseline--text-secondary: #606060; --yt-sys-color-baseline--call-to-action: #065fd4;
  --yt-sys-color-baseline--tonal-background: rgba(0,0,0,.05); --yt-sys-color-baseline--mono-tonal-hover: rgba(0,0,0,.1); --yt-sys-color-baseline--outline: rgba(0,0,0,.1);
  --yt-sys-color-baseline--additive-background: rgba(0,0,0,.05); --yt-sys-color-baseline--text-primary-inverse: #fff;
}
html[data-ytx-dark] {
  --yt-sys-color-baseline--base-background: #0f0f0f; --yt-sys-color-baseline--raised-background: #212121; --yt-sys-color-baseline--menu-background: #282828;
  --yt-sys-color-baseline--text-primary: #f1f1f1; --yt-sys-color-baseline--text-secondary: #aaa; --yt-sys-color-baseline--call-to-action: #3ea6ff;
  --yt-sys-color-baseline--tonal-background: rgba(255,255,255,.1); --yt-sys-color-baseline--mono-tonal-hover: rgba(255,255,255,.2); --yt-sys-color-baseline--outline: rgba(255,255,255,.2);
  --yt-sys-color-baseline--additive-background: rgba(255,255,255,.1); --yt-sys-color-baseline--text-primary-inverse: #0f0f0f;
}
/* die kopfleiste ist auf der videoseite auch im hellen modus dunkel, knoepfe folgen ihrer schriftfarbe und schrumpfen nicht */
ytm-mobile-topbar-renderer [data-ytx-mount] { flex: none !important; }
ytm-mobile-topbar-renderer .ytx-btn { color: inherit !important; background: color-mix(in srgb, currentColor 12%, transparent) !important; }`

// alles was ytx ueber m.youtube.com wissen muss
// kern, panel, profile, filter, abo gruppen und schauzeit sind dieselben wie am rechner

const FILTER_PAGES = [
  ['home', 'Startseite'],
  ['subscriptions', 'Abos'],
  ['search', 'Suche'],
  ['watch', 'Empfehlungen auf Videoseite'],
  ['channel', 'Kanal']
]

function pageIsDark() {
  const m = getComputedStyle(document.documentElement).color.match(/\d+/g)
  if (!m) return true
  const [r, g, b] = m.map(Number)
  return 0.299 * r + 0.587 * g + 0.114 * b > 128
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
    setCss('mobile.baseTokens', BASE_TOKENS)
    bootHashTokens(pageIsDark, 'mobil', (dark) => document.documentElement.toggleAttribute('data-ytx-dark', dark))
  }
}
