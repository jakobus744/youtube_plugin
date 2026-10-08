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
.ytx-watch-row:not([data-open]) > :not(.ytx-row-toggle) { display: none !important; }
.ytx-watch-row .ytx-row-toggle { all: unset; box-sizing: border-box; margin: 4px 12px; padding: 4px 12px; border-radius: 14px; font: 500 13px/18px Roboto, sans-serif; cursor: pointer; opacity: .8; background: var(--yt-spec-badge-chip-background, rgba(255,255,255,.1)); color: var(--yt-spec-text-primary, #f1f1f1); }
.ytx-watch-row[data-open] { display: flex; flex-wrap: wrap; align-items: center; }
.ytx-open-yt { all: unset; box-sizing: border-box; margin: 6px 12px; padding: 8px 14px; border-radius: 18px; font: 500 14px/20px Roboto, sans-serif; cursor: pointer; background: var(--yt-spec-badge-chip-background, rgba(255,255,255,.1)); color: var(--yt-spec-text-primary, #f1f1f1); }`

function ensureWatchRow() {
  if (pageFromUrl(location.href) !== 'watch') return
  const bar = qs('ytm-slim-video-metadata-section-renderer ytm-slim-video-action-bar-renderer')
  if (!bar || bar.nextElementSibling?.classList.contains('ytx-watch-row')) return
  const row = h('div', { class: 'ytx-watch-row', 'data-ytx-own': '' }, h('span', { class: 'ytx-row-end' }))
  // zum herunterladen oder offline schauen geht es in die offizielle youtube app, das gehoert dort zu premium
  if (window.__ytxNative) {
    const open = h('button', { class: 'ytx-open-yt', type: 'button', text: 'Herunterladen (YouTube-App)' })
    open.addEventListener('click', () => {
      const id = videoIdFromUrl(location.href)
      if (!id) return
      document.getElementById('movie_player')?.pauseVideo?.()
      addDownload(id, document.title.replace(/ - YouTube$/, ''))
      openInYoutubeApp(id)
    })
    row.append(open)
  }
  // standardmaessig zu, damit unter dem video Ruhe ist
  const toggle = h('button', { class: 'ytx-row-toggle', type: 'button', text: 'ytx ▾' })
  toggle.addEventListener('click', () => {
    const on = row.toggleAttribute('data-open')
    toggle.textContent = on ? 'ytx ▴' : 'ytx ▾'
  })
  row.prepend(toggle)
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
