import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mainData } from '../src/registry/music/initialData.js'

// laedt echte youtube music seiten als testdaten
// nach youtube aenderungen erneut ausfuehren und npm test laufen lassen
// so sieht man sofort welcher parser bricht

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = resolve(root, 'tests/fixtures/music')
mkdirSync(dir, { recursive: true })

const headers = {
  'accept-language': 'de-DE,de;q=0.9',
  cookie: 'SOCS=CAI',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
}

const pages = {
  artist: '/channel/UCI_7ZfCLlHu5IOvyQv2O9TQ',
  artist2: '/channel/UC4OHFyfFMFfJAVDwPhgWPQg',
  album: '/browse/MPREb_Ranz1zScnEq',
  single: '/browse/MPREb_H2L0JTo1Ibz',
  playlist: '/playlist?list=OLAK5uy_lOtL6_jnSYzg2bjSQ996tiPIaFb85DnjE',
  search: '/search?q=deutschrap',
  moods: '/moods_and_genres',
  home: '/'
}

const only = process.argv.slice(2)
for (const [name, path] of Object.entries(pages)) {
  if (only.length && !only.includes(name)) continue
  const res = await fetch(`https://music.youtube.com${path}`, { headers })
  const html = await res.text()
  const main = mainData(html)
  if (!main) {
    console.log(name, res.status, 'keine daten')
    continue
  }
  writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(main))
  console.log(name, res.status, main.path, Math.round(JSON.stringify(main).length / 1024), 'kb')
  await new Promise((r) => setTimeout(r, 800))
}
