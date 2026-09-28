import { behaviors as yt } from './youtube.js'

// verhalten fuer m.youtube.com
// umleitungen arbeiten nur mit urls und laufen deshalb unveraendert auch mobil

const SHARED = ['shortsRedirect', 'homeRedirect']

export const behaviors = yt.filter((b) => SHARED.includes(b.id))

export const behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]))
