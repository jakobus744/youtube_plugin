// kopiert den gebauten Userscript Code und embed.js der Android App in den iOS Ordner
import { copyFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = resolve(root, 'dist/ytx.user.js')
if (!existsSync(bundle)) throw new Error('dist/ytx.user.js fehlt, zuerst "npm run build"')
const res = resolve(root, 'ios/Ytx/Resources')
copyFileSync(bundle, resolve(res, 'ytx.user.js'))
copyFileSync(resolve(root, 'android/app/src/main/assets/ytx/embed.js'), resolve(res, 'embed.js'))
console.log('ios resources aktualisiert')
