// welche youtube app gerade laeuft
// ausserhalb des browsers (tests) gilt youtube
const host = typeof location !== 'undefined' ? location.hostname : ''

export const SITE_ID = host === 'music.youtube.com' ? 'music' : 'youtube'
export const IS_MUSIC = SITE_ID === 'music'
