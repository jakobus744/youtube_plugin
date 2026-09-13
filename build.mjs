import * as esbuild from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const watch = process.argv.includes('--watch')
const REPO = 'https://github.com/jakobus744/youtube_plugin'
const RAW = 'https://raw.githubusercontent.com/jakobus744/youtube_plugin/main/dist/ytx.user.js'

const meta = (name, extra = []) =>
  [
    '// ==UserScript==',
    `// @name         ${name}`,
    '// @namespace    ytx.local',
    `// @version      ${pkg.version}`,
    `// @description  ${pkg.description}`,
    '// @match        https://www.youtube.com/*',
    '// @run-at       document-start',
    '// @grant        GM_getValue',
    '// @grant        GM_setValue',
    '// @grant        GM_setClipboard',
    '// @grant        unsafeWindow',
    '// @sandbox      JavaScript',
    '// @inject-into  page',
    '// @noframes',
    ...extra,
    '// ==/UserScript==',
    ''
  ].join('\n')

mkdirSync(resolve(root, 'dist'), { recursive: true })

// dev stub laedt die lokale datei per @require, tampermonkey braucht dafuer dateizugriff
const devUrl = pathToFileURL(resolve(root, 'dist/ytx.user.js')).href
writeFileSync(resolve(root, 'dist/ytx.dev.user.js'), meta('ytx (dev)', [`// @require      ${devUrl}`]))

// tampermonkey prueft updates ueber diese urls, version in package.json erhoehen
const release = [`// @homepageURL  ${REPO}`, `// @supportURL   ${REPO}/issues`, `// @updateURL    ${RAW}`, `// @downloadURL  ${RAW}`]

const options = {
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox121'],
  outfile: resolve(root, 'dist/ytx.user.js'),
  banner: { js: meta('ytx', release) },
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info'
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
} else {
  await esbuild.build(options)
  await esbuild.build({ ...options, banner: {}, minify: true, outfile: resolve(root, 'dist/ytx.min.js'), logLevel: 'warning' })
}
