import { SITE_ID } from '../core/site.js'
import { youtubeSite } from './youtube.js'
import { musicSite } from './music.js'
import { mobileSite } from './mobile.js'

// beide seiten sind im bundle, zur laufzeit zaehlt nur eine
export const sites = { youtube: youtubeSite, music: musicSite, mobile: mobileSite }
export const site = sites[SITE_ID]
