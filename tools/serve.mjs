import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// nur fuer die entwicklung
// liefert dist aus und eine handoff seite fuer tests im eingebauten browser

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
const port = Number(process.env.PORT || 8766)

// navigiert den gleichen tab zu youtube, bundle gzip+base64 im hash
const HANDOFF = `<!doctype html><meta charset="utf-8"><title>ytx handoff</title><body>handoff
<script>
(async () => {
  const p = new URLSearchParams(location.search)
  const file = p.get('file') || 'ytx.min.js'
  const to = p.get('to') || 'https://www.youtube.com/'
  const buf = await (await fetch('/' + file, { cache: 'no-store' })).arrayBuffer()
  const gz = await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(gz)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  location.replace(to + '#ytxb=' + btoa(bin))
})()
</script>`

createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'ytx.user.js'
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.end()
  if (name === 'handoff') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.end(HANDOFF)
  }
  try {
    const body = await readFile(resolve(dist, name))
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
    res.end(body)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
}).listen(port, () => console.log(`ytx dist on http://localhost:${port}`))
