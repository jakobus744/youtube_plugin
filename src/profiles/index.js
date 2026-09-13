// eingebaute profile
// targets haben keine meinung, meinungen stehen nur hier

const H = 'hide'
const D = 'dim'
const C = 'collapse'

const tidyDisplay = {
  'guide.shorts': H,
  'guide.explore': H,
  'guide.moreYT': H,
  'guide.footer': H,
  'top.create': H,
  'top.voice': H,
  'home.shortsShelf': H,
  'home.chips': H,
  'home.shelves': H,
  'home.banner': H,
  'watch.sidebar': C,
  'watch.comments': C,
  'watch.shortsShelf': H,
  'watch.merch': H,
  'watch.ads': H,
  'watch.ambient': H,
  'watch.infoCards': H,
  'watch.btn.download': H,
  'watch.btn.clip': H,
  'watch.btn.thanks': H,
  'watch.btn.ask': H,
  'watch.btn.join': H,
  'player.endscreen': H,
  'player.cards': H,
  'player.pauseOverlay': H,
  'player.paidPromo': H,
  'player.watermark': H,
  'player.btn.cast': H,
  'thumb.image': D,
  'thumb.hoverPreview': H,
  'search.shorts': H,
  'search.peopleAlsoSearch': H,
  'search.shelves': H,
  'search.ads': H,
  'channel.shortsTab': H,
  'channel.shortsShelf': H,
  'subs.shorts': H
}

const tidyFeatures = {
  'transcript.copy': { enabled: true },
  'watch.copyInfo': { enabled: true },
  'playlist.duration': { enabled: true },
  'playlist.dimWatched': { enabled: false },
  'playlist.sort': { enabled: true },
  'player.endsAt': { enabled: true },
  'watch.publishDate': { enabled: true },
  'thumb.progressBadge': { enabled: true },
  'ui.proxyButtons': { enabled: false }
}

export const templates = [
  {
    id: 'youtube',
    name: 'YouTube (Original)',
    description: 'Nichts verändert. Zum Vergleichen und als Notausgang',
    config: () => ({})
  },
  {
    id: 'aufgeraeumt',
    name: 'Aufgeräumt',
    description: 'Shorts und Ablenkungen weg, nützliche Features an',
    config: () => ({
      display: { ...tidyDisplay },
      behavior: { shortsRedirect: true, autoplayOff: true, channelTrailerPause: true },
      filters: { enabled: true, mode: 'dim', shorts: true, pages: ['home', 'subscriptions', 'search', 'watch'] },
      features: structuredClone(tidyFeatures)
    })
  },
  {
    id: 'fokus',
    name: 'Fokus',
    description: 'Radikal: keine Startseite, keine Empfehlungen, keine Thumbnails',
    config: () => ({
      display: {
        ...tidyDisplay,
        'guide.subs': C,
        'top.notifications': H,
        'home.feedAll': H,
        'watch.sidebar': H,
        'watch.comments': H,
        'watch.chat': C,
        'watch.btn.likeCount': H,
        'player.btn.autoplay': H,
        'thumb.image': H
      },
      layout: { presets: { watch: 'focus', subscriptions: 'list' } },
      behavior: { shortsRedirect: true, autoplayOff: true, channelTrailerPause: true, homeRedirect: '/feed/subscriptions' },
      filters: { enabled: true, mode: 'hide', shorts: true, pages: ['home', 'subscriptions', 'search', 'watch', 'channel'] },
      features: structuredClone(tidyFeatures)
    })
  }
]

export const templateById = Object.fromEntries(templates.map((t) => [t.id, t]))
export const DEFAULT_ACTIVE = 'aufgeraeumt'
