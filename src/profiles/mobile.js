// mobil abschnitt der eingebauten profile

const H = 'hide'
const C = 'collapse'

const tidyDisplay = {
  'mb.pivot.shorts': H,
  'mb.pivot.create': H,
  'mb.top.openApp': H,
  'mb.home.shorts': H,
  'mb.home.nudge': H,
  'mb.watch.shorts': H,
  'mb.watch.carousel': H,
  'mb.watch.endscreen': H,
  'mb.search.shorts': H,
  'mb.infoPanel': H,
  'mb.search.shelves': C,
  'mb.channel.shortsTab': H,
  'mb.channel.shorts': H,
  'mb.subs.shorts': H,
  'mb.ads': H,
  'mb.premiumPromo': H
}

// dieselben features wie am rechner, ohne buttons spiegeln
export const tidyFeatures = {
  'transcript.copy': { enabled: true },
  'watch.copyInfo': { enabled: true },
  'playlist.duration': { enabled: true },
  'playlist.search': { enabled: true },
  'playlist.sort': { enabled: true },
  'playlist.dimWatched': { enabled: false },
  'subs.groups': { enabled: true },
  'watch.time': { enabled: true },
  'player.endsAt': { enabled: true },
  'watch.publishDate': { enabled: true },
  'thumb.progressBadge': { enabled: true }
}

export const mobileTemplates = {
  youtube: () => ({ display: { 'mb.pivot.shorts': H } }),
  aufgeraeumt: () => ({
    display: { ...tidyDisplay },
    behavior: { shortsRedirect: true, autoplayOff: true, channelTrailerPause: true, swipeDownBack: true },
    filters: { enabled: true, mode: 'dim', shorts: true, pages: ['home', 'subscriptions', 'search', 'watch'] },
    features: structuredClone(tidyFeatures)
  }),
  fokus: () => ({
    display: { ...tidyDisplay, 'mb.home.feed': H, 'mb.home.sections': H, 'mb.home.chips': H, 'mb.watch.related': C, 'mb.watch.comments': C },
    behavior: { shortsRedirect: true, autoplayOff: true, channelTrailerPause: true, swipeDownBack: true, homeRedirect: '/feed/subscriptions' },
    filters: { enabled: true, mode: 'hide', shorts: true, pages: ['home', 'subscriptions', 'search', 'watch', 'channel'] },
    features: structuredClone(tidyFeatures)
  })
}
