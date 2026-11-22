// webdav ordnerliste ohne DOMParser, den youtube am pc per trusted types sperrt

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

function tag(block, name) {
  const m = block.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i'))
  return m ? unxml(m[1].trim()) : ''
}

export function parseDavList(xml) {
  const out = []
  const re = /<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi
  for (const [, block] of String(xml).matchAll(re)) {
    let href = tag(block, 'href')
    try {
      href = decodeURIComponent(href)
    } catch {}
    const dir = /<(?:[\w-]+:)?collection\b/i.test(block)
    out.push({ name: href.replace(/\/+$/, '').split('/').pop(), etag: tag(block, 'getetag'), dir })
  }
  return out
}
