import { SITE_ID } from '../../core/site.js'
import * as desktop from '../../registry/youtube/paths.js'
import * as mobile from '../../registry/mobile/paths.js'

// seitendaten der laufenden seite, am rechner oder auf m.youtube.com
// gleiche schnittstelle, damit ein feature auf beiden seiten laeuft

const src = SITE_ID === 'mobile' ? mobile : desktop

export const watch = src.watch
export const playlistPage = src.playlistPage
export const playlistPanel = src.playlistPanel
export const videoMenu = src.videoMenu
export const readCard = src.readCard
