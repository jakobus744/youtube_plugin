import { historyFeature } from './history.js'
import { favoritesFeature } from './favorites.js'
import { releasesFeature } from './releases.js'
import { hubFeature } from './hub.js'
import { weeklyFeature } from './weekly.js'
import { smartQueueFeature, queueInfoFeature, lyricsFeature, audioFeature } from './player.js'

// music features, config und panel ergeben sich wie bei youtube aus dem manifest
export const featureManifests = [historyFeature, favoritesFeature, hubFeature, releasesFeature, weeklyFeature, smartQueueFeature, queueInfoFeature, lyricsFeature, audioFeature]
