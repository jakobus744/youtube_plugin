import { templates as youtubeTemplates, DEFAULT_ACTIVE } from './youtube.js'
import { musicTemplates } from './music.js'
import { mobileTemplates } from './mobile.js'
import { SCHEMA } from '../core/config.js'

// eingebaute profile gelten fuer youtube und music gemeinsam
export const templates = youtubeTemplates.map((t) => ({
  ...t,
  config: () => ({ schema: SCHEMA, youtube: t.config(), music: musicTemplates[t.id]?.() || {}, mobile: mobileTemplates[t.id]?.() || {} })
}))

export const templateById = Object.fromEntries(templates.map((t) => [t.id, t]))
export { DEFAULT_ACTIVE }
