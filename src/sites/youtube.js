import { targets, GROUPS, targetById } from '../registry/youtube/targets.js'
import { anchors } from '../registry/youtube/anchors.js'
import { tagRules } from '../registry/youtube/tags.js'
import { colorControls, controls, themes, LOOK_GROUPS, controlById, TOKEN_SCOPE, extraCss } from '../registry/youtube/look.js'
import { layoutPresets, presetById, LAYOUT_PAGES, orderGroups, topbarModes, topbarCss } from '../registry/youtube/presets.js'
import { pageFromUrl, videoIdFromUrl, PAGE_LABELS, FILTER_PAGES } from '../registry/youtube/pages.js'
import { CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots } from '../registry/youtube/paths.js'
import { behaviors, behaviorById } from '../behaviors/youtube.js'
import { featureManifests } from '../features/youtube/index.js'
import { templates } from '../profiles/youtube.js'
import { initTimedtextCapture } from '../features/youtube/transcript/source.js'

// alles was ytx ueber www.youtube.com wissen muss an einer stelle
export const youtubeSite = {
  id: 'youtube',
  label: 'YouTube',
  appHost: 'ytd-app',
  pageFromUrl,
  videoIdFromUrl,
  PAGE_LABELS,
  targets,
  GROUPS,
  targetById,
  anchors,
  tagRules,
  look: { colorControls, controls, themes, LOOK_GROUPS, controlById, tokenScope: TOKEN_SCOPE, extraCss },
  presets: { layoutPresets, presetById, LAYOUT_PAGES, orderGroups, topbarModes, topbarCss },
  behaviors,
  behaviorById,
  features: featureManifests,
  templates,
  filters: { pages: FILTER_PAGES, CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots },
  panelTabs: ['display', 'look', 'layout', 'behavior', 'filters', 'features', 'profiles', 'diagnose'],
  boot() {
    initTimedtextCapture()
  }
}
