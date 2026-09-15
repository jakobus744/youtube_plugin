import { SITE_ID } from '../core/site.js'
import { youtubeSite } from './youtube.js'
import { musicSite } from './music.js'

// beide seiten sind im bundle, zur laufzeit zaehlt nur eine
export const sites = { youtube: youtubeSite, music: musicSite }
export const site = sites[SITE_ID]
