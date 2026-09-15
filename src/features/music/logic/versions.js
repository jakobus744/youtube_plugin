// fassungen eines songs erkennen: live, remix, sped up …
// basis fuer doppelte versionen und titelregeln

export const VERSION_TAGS = [
  ['live', /\blive\b|\(live|\blive at\b|\bunplugged\b/i, 'Live'],
  ['remix', /\bremix\b|\brmx\b|\bmix\)|\bedit\)|\bbootleg\b|\bflip\b/i, 'Remix'],
  ['spedup', /sped[\s-]*up|speed[\s-]*up|\bnightcore\b|\bfast(er)? version\b/i, 'Sped up'],
  ['slowed', /\bslowed\b|\breverb\b|\bslow(ed)? version\b/i, 'Slowed'],
  ['karaoke', /\bkaraoke\b|\binstrumental\b|\bbacking track\b/i, 'Karaoke'],
  ['acoustic', /\bacoustic\b|\bakustik\b/i, 'Akustik'],
  ['cover', /\bcover\b/i, 'Cover'],
  ['remaster', /\bremaster(ed)?\b/i, 'Remaster'],
  ['radio', /\bradio edit\b|\bradio version\b/i, 'Radio Edit'],
  ['extended', /\bextended\b/i, 'Extended']
]

export function versionTags(title) {
  const t = String(title || '')
  return VERSION_TAGS.filter(([, re]) => re.test(t)).map(([id]) => id)
}

// titel ohne klammern, feats und fassungszusaetze
export function baseTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((?:[^()]*)\)|\[(?:[^\[\]]*)\]/g, ' ')
    .replace(/\s[-–—|]\s.*(live|remix|version|edit|sped|slowed|nightcore|karaoke|instrumental|acoustic|remaster|mix).*$/i, ' ')
    .replace(/\b(feat|ft|featuring|prod)\.?\s.*$/i, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function artistKey(a) {
  if (!a) return ''
  return a.id || `name:${String(a.name || '').trim().toLowerCase()}`
}

// gleicher song unabhaengig von fassung und video oder audio
export function trackKey(track) {
  const first = track?.artists?.[0]
  const who = first ? String(first.name || first.id || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') : ''
  return `${baseTitle(track?.title)}|${who}`
}
