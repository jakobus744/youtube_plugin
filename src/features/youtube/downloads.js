import { store } from '../../core/store.js'

// merkliste fuer videos die in der offiziellen youtube app heruntergeladen werden
// ytx laedt selbst nichts, die liste ist nur ein schneller weg zurueck in die app

const BUCKET = 'downloads'

const normalize = (b) => {
  const items = Array.isArray(b?.items) ? b.items : []
  return { items: items.filter((i) => i && /^[\w-]{11}$/.test(i.id)).map((i) => ({ id: i.id, title: String(i.title || i.id), at: Number(i.at) || 0 })).slice(0, 500) }
}

export const downloadList = () => store.bucket(BUCKET, normalize).items

export function addDownload(id, title) {
  store.updateBucket(BUCKET, (d) => {
    d.items = d.items.filter((i) => i.id !== id)
    d.items.unshift({ id, title: String(title || id).slice(0, 200), at: Date.now() })
  }, normalize)
}

export function removeDownload(id) {
  store.updateBucket(BUCKET, (d) => (d.items = d.items.filter((i) => i.id !== id)), normalize)
}

// in der app wird das video in der offiziellen youtube app geoeffnet
export function openInYoutubeApp(id) {
  window.__ytxNative?.({ a: `openyt:${id}` })
}
