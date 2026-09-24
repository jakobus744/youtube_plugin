import transcript from './transcript/index.js'
import playlistDuration from './playlist/duration.js'
import playlistDimWatched from './playlist/dimWatched.js'
import playlistSort from './playlist/sort.js'
import playlistSearch from './playlist/search.js'
import { endsAt, publishDate, copyInfo } from './watchExtras.js'
import { progressBadge, proxyButtons } from './cardExtras.js'

// neue features hier eintragen, config und panel ergeben sich aus dem manifest
export const featureManifests = [transcript, copyInfo, playlistDuration, playlistSearch, playlistSort, playlistDimWatched, endsAt, publishDate, progressBadge, proxyButtons]
