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
  'mb.search.shelves': C,
  'mb.channel.shortsTab': H,
  'mb.channel.shorts': H,
  'mb.subs.shorts': H,
  'mb.ads': H,
  'mb.premiumPromo': H
}

const tidyFeatures = {
  'subs.groups': { enabled: true },
  'watch.time': { enabled: true }
}

export const mobileTemplates = {
  youtube: () => ({}),
  aufgeraeumt: () => ({
    display: { ...tidyDisplay },
    behavior: { shortsRedirect: true },
    filters: { enabled: true, mode: 'dim', shorts: true, pages: ['home', 'subscriptions', 'search', 'watch'] },
    features: structuredClone(tidyFeatures)
  }),
  fokus: () => ({
    display: { ...tidyDisplay, 'mb.home.feed': H, 'mb.home.sections': H, 'mb.home.chips': H, 'mb.watch.related': C, 'mb.watch.comments': C },
    behavior: { shortsRedirect: true, homeRedirect: '/feed/subscriptions' },
    filters: { enabled: true, mode: 'hide', shorts: true, pages: ['home', 'subscriptions', 'search', 'watch', 'channel'] },
    features: structuredClone(tidyFeatures)
  })
}
