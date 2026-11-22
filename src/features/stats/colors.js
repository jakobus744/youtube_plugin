import { GENRE_GROUPS } from '../music/logic/genres.js'

// feste farben: youtube und music je eine grundfarbe, jede kategorie und jedes genre ueberall dieselbe farbe

export const SRC_COLOR = { yt: '#ff5a4f', music: '#b07cff' }
export const SRC_LABEL = { yt: 'YouTube', music: 'Music' }

// youtube kategorien kommen englisch aus den videodaten
const YT_CATEGORIES = {
  'Film & Animation': ['Film & Animation', '#e8a33d'],
  'Autos & Vehicles': ['Autos & Fahrzeuge', '#8d9aa6'],
  Music: ['Musik', '#b07cff'],
  'Pets & Animals': ['Tiere', '#7cc576'],
  Sports: ['Sport', '#2fb3a5'],
  'Travel & Events': ['Reisen & Events', '#4fa3e0'],
  Gaming: ['Gaming', '#3fbf5f'],
  'People & Blogs': ['Menschen & Blogs', '#f08ab8'],
  Comedy: ['Comedy', '#f5d042'],
  Entertainment: ['Unterhaltung', '#ff8a4c'],
  'News & Politics': ['Nachrichten & Politik', '#5b7cfa'],
  'Howto & Style': ['Anleitungen & Stil', '#d97fd0'],
  Education: ['Bildung', '#39c2e8'],
  'Science & Technology': ['Wissenschaft & Technik', '#22a7f0'],
  'Nonprofits & Activism': ['Gemeinnützig', '#a3b84f']
}

export const catLabel = (name) => YT_CATEGORIES[name]?.[0] || name

// gut unterscheidbar auf hellem und dunklem grund, kein grau (das ist „Sonstige“)
const PALETTE = ['#ff8a4c', '#3fbf5f', '#5b7cfa', '#f5d042', '#e8619a', '#2fb3a5', '#b07cff', '#e8a33d', '#39c2e8', '#a3b84f', '#d97fd0', '#c9784f']

// music genres: eine farbe je genre gruppe, die genres darin als abstufungen
const GROUP_HUE = { 'Techno': 174, 'Hardstyle & Hard Dance': 350, 'Hip-Hop & Rap': 28, 'Elektronisch': 205, 'Weitere': 280 }
const GENRE_COLOR = new Map()
for (const [group, list] of GENRE_GROUPS) {
  const hue = GROUP_HUE[group] ?? 0
  list.forEach((g, i) => GENRE_COLOR.set(g.toLowerCase(), `hsl(${hue + ((i % 3) - 1) * 8} ${62 + (i % 2) * 10}% ${48 + (i % 4) * 7}%)`))
}

function hash(s) {
  let x = 2166136261
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619)
  return x >>> 0
}

export function catColor(name) {
  if (!name || name === 'Sonstige') return '#7a7a7a'
  return YT_CATEGORIES[name]?.[1] || GENRE_COLOR.get(String(name).toLowerCase()) || PALETTE[hash(String(name).toLowerCase()) % PALETTE.length]
}

// farben fuer eine liste: feste farbe, bei gleicher farbe in derselben liste die naechste freie
export function catColors(names) {
  const used = new Set()
  const out = new Map()
  for (const n of names) {
    let c = catColor(n)
    if (used.has(c) && n !== 'Sonstige') {
      const start = hash(String(n).toLowerCase())
      for (let i = 1; i <= PALETTE.length && used.has(c); i++) c = PALETTE[(start + i) % PALETTE.length]
    }
    used.add(c)
    out.set(n, c)
  }
  return out
}
