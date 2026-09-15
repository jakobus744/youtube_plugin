// music abschnitt der eingebauten profile
// schluessel sind die ids der gemeinsamen profile

const H = 'hide'
const C = 'collapse'

const tidyDisplay = {
  'm.guide.samples': H,
  'm.guide.upgrade': H,
  'm.guide.signin': H,
  'm.promo.mealbar': H,
  'm.promo.background': H,
  'm.promo.upsell': H,
  'm.home.podcastChip': H,
  'm.home.podcasts': H,
  'm.home.samplesShelf': H,
  'm.explore.podcasts': H,
  'm.search.podcasts': C,
  'm.search.profiles': H
}

const tidyFeatures = {
  'm.history': { enabled: true },
  'm.favorites': { enabled: true },
  'm.hub': { enabled: true },
  'm.releases': { enabled: true },
  'm.smartQueue': { enabled: true },
  'm.queueInfo': { enabled: true },
  'm.lyrics': { enabled: true },
  'm.audio': { enabled: false }
}

export const musicTemplates = {
  youtube: () => ({}),
  aufgeraeumt: () => ({
    display: { ...tidyDisplay },
    behavior: { 'm.stillThere': true },
    features: structuredClone(tidyFeatures)
  }),
  fokus: () => ({
    display: {
      ...tidyDisplay,
      'm.guide.explore': H,
      'm.home.chips': H,
      'm.home.videos': H,
      'm.home.playlists': C,
      'm.home.background': H,
      'm.player.comments': H,
      'm.player.related': H,
      'm.search.videos': C
    },
    behavior: { 'm.stillThere': true, 'm.closePromoDialogs': true },
    features: { ...structuredClone(tidyFeatures), 'm.audio': { enabled: true, preferAudio: true } }
  })
}
