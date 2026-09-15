import { targets, GROUPS, targetById } from '../registry/music/targets.js'
import { anchors } from '../registry/music/anchors.js'
import { tagRules, TAG_ATTRS } from '../registry/music/tags.js'
import { colorControls, controls, themes, LOOK_GROUPS, controlById, TOKEN_SCOPE, extraCss } from '../registry/music/look.js'
import { layoutPresets, presetById, LAYOUT_PAGES, orderGroups, topbarModes, topbarCss } from '../registry/music/presets.js'
import { pageFromUrl, videoIdFromUrl, PAGE_LABELS } from '../registry/music/pages.js'
import { playerApi, appState, currentBrowse } from '../registry/music/player.js'
import { behaviors, behaviorById } from '../behaviors/music.js'
import { featureManifests } from '../features/music/index.js'
import { initMusicUiCss } from '../features/music/ui.js'
import { registerMusicChecks } from '../features/music/diagnose.js'
import { music } from '../features/music/runtime.js'
import { catalog } from '../features/music/data/catalog.js'
import { buildMix, checkReleases } from '../features/music/engine.js'
import { ytxQueue } from '../features/music/ytxQueue.js'

// alles was ytx ueber music.youtube.com wissen muss an einer stelle
export const musicSite = {
  id: 'music',
  label: 'YouTube Music',
  appHost: 'ytmusic-app',
  // alben oeffnen unter /playlist?list=OLAK..., die browse id im app zustand verraet den echten typ
  pageFromUrl(href) {
    const page = pageFromUrl(href)
    if (page !== 'playlist' || href !== location.href) return page
    const id = currentBrowse()?.browseId || ''
    return id.startsWith('MPREb_') ? 'album' : page
  },
  videoIdFromUrl,
  // der player laeuft seitenuebergreifend, der titel kommt nicht aus der url
  currentVideoId(page, href) {
    try {
      const id = playerApi()?.getVideoData?.()?.video_id
      if (id) return id
    } catch {}
    return appState()?.player?.playerResponse?.videoDetails?.videoId || videoIdFromUrl(href)
  },
  PAGE_LABELS,
  targets,
  GROUPS,
  targetById,
  anchors,
  tagRules,
  tagAttrs: TAG_ATTRS,
  look: { colorControls, controls, themes, LOOK_GROUPS, controlById, tokenScope: TOKEN_SCOPE, extraCss },
  presets: { layoutPresets, presetById, LAYOUT_PAGES, orderGroups, topbarModes, topbarCss },
  behaviors,
  behaviorById,
  features: featureManifests,
  filters: null,
  // fuer diagnose in der konsole ueber __ytx.debug
  get debug() {
    return { music, catalog, buildMix, checkReleases, ytxQueue }
  },
  panelTabs: ['display', 'look', 'layout', 'behavior', 'features', 'music', 'musicData', 'musicStats', 'profiles', 'diagnose'],
  boot() {
    initMusicUiCss()
    registerMusicChecks()
  }
}
