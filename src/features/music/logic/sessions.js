// temporaere hoermodi, ueberschreiben filter und discovery nur fuer eine session
// das gespeicherte profil bleibt unveraendert

export const SESSION_PRESETS = [
  {
    id: 'focus',
    label: 'Fokus',
    description: 'Ruhig und vertraut, keine Live- oder Remix-Versionen',
    discovery: 0.25,
    extraTerms: ['live', 'remix', 'sped up', 'nightcore'],
    moods: ['konzentration', 'focus', 'chill', 'entspann'],
    skipHighSkip: true
  },
  {
    id: 'gym',
    label: 'Gym',
    description: 'Energie, gerne auch neue Songs',
    discovery: 0.45,
    extraTerms: ['slowed', 'acoustic', 'akustik', 'karaoke'],
    moods: ['workout', 'power', 'party', 'sport'],
    skipHighSkip: true
  },
  {
    id: 'evening',
    label: 'Abends',
    description: 'Entspannt, eher Bekanntes',
    discovery: 0.3,
    extraTerms: ['sped up', 'nightcore'],
    moods: ['chill', 'entspann', 'romantik', 'einschlafen', 'sleep', 'relax'],
    skipHighSkip: true
  },
  {
    id: 'explore',
    label: 'Entdecken',
    description: 'Passende Künstler, die du kaum gehört hast',
    discovery: 0.9,
    extraTerms: [],
    moods: [],
    skipHighSkip: true,
    skipRecentlyPlayed: true
  },
  {
    id: 'known',
    label: 'Nur bekannte Musik',
    description: 'Nur Künstler, die du schon gehört oder favorisiert hast',
    discovery: 0,
    extraTerms: [],
    moods: [],
    onlyKnownArtists: true,
    skipHighSkip: true
  }
]

export const presetById = Object.fromEntries(SESSION_PRESETS.map((p) => [p.id, p]))

// wirksame einstellungen aus dauerhaften vorlieben und aktiver session
export function effectiveSettings(prefs, session) {
  const p = session?.presetId ? presetById[session.presetId] : null
  const terms = [...new Set([...(prefs.blocklist?.terms || []), ...(p?.extraTerms || [])])]
  return {
    discovery: p ? p.discovery : prefs.discovery,
    blocklist: { ...(prefs.blocklist || {}), terms },
    onlyKnownArtists: !!p?.onlyKnownArtists,
    skipHighSkip: p ? !!p.skipHighSkip : !!prefs.smartQueue?.skipHighSkip,
    skipRecentlyPlayed: p ? !!p.skipRecentlyPlayed : !!prefs.smartQueue?.skipRecentlyPlayed,
    moods: p?.moods || [],
    preset: p
  }
}

export function matchMood(moods, keywords) {
  if (!keywords?.length) return null
  const lower = keywords.map((k) => k.toLowerCase())
  return moods.find((m) => lower.some((k) => m.name.toLowerCase().includes(k))) || null
}
