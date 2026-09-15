import transcript from './transcript/index.js'
import playlistDuration from './playlist/duration.js'
import playlistDimWatched from './playlist/dimWatched.js'
import playlistSort from './playlist/sort.js'
import { endsAt, publishDate, copyInfo } from './watchExtras.js'
import { progressBadge, proxyButtons } from './cardExtras.js'

// neue features hier eintragen, config und panel ergeben sich aus dem manifest
export const featureManifests = [transcript, copyInfo, playlistDuration, playlistSort, playlistDimWatched, endsAt, publishDate, progressBadge, proxyButtons]
