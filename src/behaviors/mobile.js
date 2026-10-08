import { behaviors as yt } from './youtube.js'

// verhalten fuer m.youtube.com
// umleitungen arbeiten mit urls, der rest mit der player api, beides gibt es auch mobil

const SHARED = ['shortsRedirect', 'homeRedirect', 'autoplayOff', 'forceQuality', 'speedMemory', 'pauseOnBlur', 'channelTrailerPause']

export const behaviors = yt.filter((b) => SHARED.includes(b.id))

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
