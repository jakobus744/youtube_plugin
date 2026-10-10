import { targets, GROUPS, targetById } from '../registry/mobile/targets.js'
import { anchors } from '../registry/mobile/anchors.js'
import { tagRules, TAG_ATTRS } from '../registry/mobile/tags.js'
import { colorControls, controls, themes, LOOK_GROUPS, controlById, TOKEN_SCOPE, extraCss } from '../registry/mobile/look.js'
import { pageFromUrl, videoIdFromUrl, PAGE_LABELS } from '../registry/youtube/pages.js'
import { channelRefOf } from '../registry/youtube/paths.js'
import { CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots, channelPageInfo, subscribedChannels, activePlayback, pauseActive } from '../registry/mobile/paths.js'
import { behaviors, behaviorById } from '../behaviors/mobile.js'
import { featureManifests } from '../features/youtube/index.js'
import { initTimedtextCapture } from '../features/youtube/transcript/source.js'
import { bootHashTokens } from './hashBoot.js'
import { setCss } from '../core/css.js'
import { onSweep } from '../core/observer.js'
import { initMiniMode } from './miniMode.js'
import { addDownload, openInYoutubeApp } from '../features/youtube/downloads.js'
import { qs, h } from '../core/dom.js'

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
ytm-mobile-topbar-renderer .ytx-btn { color: inherit !important; background: color-mix(in srgb, currentColor 12%, transparent) !important; }
/* eigene ytx zeile unter dem video, leer unsichtbar */
.ytx-watch-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 4px 12px 12px; }
.ytx-watch-row:not(:has(> :not(.ytx-row-end))) { display: none; }
.ytx-watch-row .ytx-btn { margin: 0 !important; }
ytm-slim-video-information-renderer > .ytx-note { padding: 0 12px; }
/* playlist panel: dauer und suche als eigene zeilen unter dem kopf */
ytm-playlist-engagement-panel-header > [data-ytx-mount] { margin: 0 12px 8px !important; }
ytm-playlist-engagement-panel-header > [data-ytx-mount] input { flex: 1; }`

// alles was ytx ueber m.youtube.com wissen muss
// kern, panel, profile, filter, abo gruppen und schauzeit sind dieselben wie am rechner

const FILTER_PAGES = [
  ['home', 'Startseite'],
  ['subscriptions', 'Abos'],
  ['search', 'Suche'],
  ['watch', 'Empfehlungen auf Videoseite'],
  ['channel', 'Kanal']
]

// zeile direkt unter der aktionsleiste, features docken am end marker an
const OPEN_YT_CSS = `
#ytx-fs-exit { all: initial; position: fixed; top: 14px; right: 14px; z-index: 2147483647; width: 48px; height: 48px; border-radius: 24px; background: rgba(0,0,0,.55); color: #fff; font: 700 26px/48px sans-serif; text-align: center; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity .2s; }
#ytx-fs-exit.show { opacity: 1; pointer-events: auto; }
html:not([data-ytx-fs]) #ytx-fs-exit { display: none; }
/* echtes vollbild in der app: nur das video, ohne leisten und einblendungen */
html[data-ytx-fs] ytm-mobile-topbar-renderer, html[data-ytx-fs] .mobile-topbar-header-background, html[data-ytx-fs] ytm-pivot-bar-renderer, html[data-ytx-fs] [class*="paid-content-overlay"], html[data-ytx-fs] ytm-paid-content-overlay-renderer, html[data-ytx-fs] ytm-custom-control .ytp-paid-content-overlay, html[data-ytx-fs] #movie_player .ytp-paid-content-overlay, html[data-ytx-fs] .ytp-title-channel-logo, html[data-ytx-fs] .ytm-autonav-bar { display: none !important; }
/* hinweisbalken wie „Weitere Informationen zu diesen Ergebnissen“ immer weg */
ytm-info-panel-container-renderer { display: none !important; }
/* filter shorts an: ganze shorts regale samt ueberschrift weg */
html[data-ytx-noshorts] ytm-reel-shelf-renderer, html[data-ytx-noshorts] grid-shelf-view-model:has(ytm-shorts-lockup-view-model), html[data-ytx-noshorts] ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model), html[data-ytx-noshorts] ytm-shorts-lockup-view-model, html[data-ytx-noshorts] ytm-video-with-context-renderer:has(a[href^="/shorts/"]), html[data-ytx-noshorts] ytm-compact-video-renderer:has(a[href^="/shorts/"]), html[data-ytx-noshorts] ytm-pivot-bar-item-renderer[data-ytx-mbpivot="shorts"], html[data-ytx-noshorts] yt-tab-shape[data-ytx-mbtab="shorts"] { display: none !important; }
/* suchvorschlaege wie in der app: kein hellerer streifen hinter den pfeilen */
.ytSuggestionComponentQueryBuilderButton { background: transparent !important; }
/* beim suchen braucht das suchfeld den platz */
ytm-mobile-topbar-renderer:has(yt-searchbox) [data-ytx-mount="top.watchtime"] { display: none !important; }
ytm-mobile-topbar-renderer:has(yt-searchbox) [data-ytx-mount="top.ytx"] { margin: 0 2px 0 8px !important; padding: 0 6px !important; }
/* die leiste dient nur als anker fuer ytx knoepfe, transkript steht im menue des videos */
.ytx-watch-row { display: none !important; }
.ytx-dl-icon { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.ytx-dl-icon svg { width: 24px; height: 24px; fill: currentColor; }`

// kleines herunterladen symbol hinter den anderen symbolen der aktionsleiste
// zum herunterladen oder offline schauen geht es in die offizielle youtube app, das gehoert dort zu premium
function ensureDownloadIcon(bar) {
  if (!window.__ytxNative || bar.querySelector('.ytx-dl-icon')) return
  const buttons = [...bar.querySelectorAll('button')].filter((b) => !b.closest('[data-ytx-own]'))
  const last = buttons[buttons.length - 1]
  if (!last) return
  let slot = last
  while (slot.parentElement && slot.parentElement !== bar && slot.parentElement.children.length < 3) slot = slot.parentElement
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  const path = document.createElementNS(NS, 'path')
  path.setAttribute('d', 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z')
  svg.append(path)
  const icon = h('button', { class: 'ytx-dl-icon', type: 'button', title: 'In der YouTube-App herunterladen', 'aria-label': 'In der YouTube-App herunterladen', 'data-ytx-own': '' }, svg)
  icon.addEventListener('click', (e) => {
    e.stopPropagation()
    const id = videoIdFromUrl(location.href)
    if (!id) return
    document.getElementById('movie_player')?.pauseVideo?.()
    addDownload(id, document.title.replace(/ - YouTube$/, ''))
    openInYoutubeApp(id)
  })
  slot.after(icon)
}

function ensureWatchRow() {
  if (pageFromUrl(location.href) !== 'watch') return
  const bar = qs('ytm-slim-video-metadata-section-renderer ytm-slim-video-action-bar-renderer')
  if (bar) ensureDownloadIcon(bar)
  if (!bar || bar.nextElementSibling?.classList.contains('ytx-watch-row')) return
  const row = h('div', { class: 'ytx-watch-row', 'data-ytx-own': '' }, h('span', { class: 'ytx-row-end' }))
  bar.after(row)
}

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
  // buttons spiegeln braucht die aktionsleiste vom rechner
  features: featureManifests.filter((m) => m.id !== 'ui.proxyButtons'),
  filters: { pages: FILTER_PAGES, CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots },
  channels: { channelRefOf, channelPageInfo, subscribedChannels },
  playback: { activePlayback, pauseActive },
  panelTabs: ['display', 'look', 'behavior', 'filters', 'features', 'subGroups', 'watchStats', 'downloads', 'profiles', 'diagnose'],
  boot() {
    setCss('mobile.baseTokens', BASE_TOKENS + OPEN_YT_CSS)
    initTimedtextCapture()
    initMiniMode()
    onSweep('mobile.watchRow', ensureWatchRow)
    bootHashTokens(pageIsDark, 'mobil', (dark) => document.documentElement.toggleAttribute('data-ytx-dark', dark))
  }
}
