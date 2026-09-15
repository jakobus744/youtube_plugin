import { h } from '../../core/dom.js'
import { setCss } from '../../core/css.js'
import { formatDuration } from '../../core/format.js'
import { listen, onDispose } from '../../core/lifecycle.js'

// bausteine fuer music, farben ueber music tokens damit themes greifen

const PAGE_CSS = `
.ytx-m-iconbtn { all: initial; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 36px; padding: 0 8px; border-radius: 18px; cursor: pointer; user-select: none;
  font: 500 18px/1 Roboto, Arial, sans-serif; color: var(--ytmusic-text-secondary, #aaa); background: transparent; flex: none; }
.ytx-m-iconbtn:hover { color: var(--ytmusic-text-primary, #fff); background: rgba(255,255,255,.1); }
.ytx-m-iconbtn[aria-pressed="true"] { color: #ffc83d; }
.ytx-m-iconbtn .ytx-m-lbl { font-size: 13px; margin-left: 6px; }
.ytx-m-pill { all: initial; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 18px; cursor: pointer; user-select: none; white-space: nowrap;
  font: 500 14px/36px Roboto, Arial, sans-serif; color: var(--ytmusic-text-primary, #fff); background: rgba(255,255,255,.1); }
.ytx-m-pill:hover { background: rgba(255,255,255,.2); }
.ytx-m-pill[data-badge]:after { content: attr(data-badge); margin-left: 2px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; box-sizing: border-box; font-size: 11px; line-height: 18px; text-align: center; color: #fff; background: #e53935; }
.ytx-m-info { all: initial; display: block; padding: 6px 16px; font: 400 12px/1.4 Roboto, Arial, sans-serif; color: var(--ytmusic-text-secondary, #aaa); }
.ytx-m-info b { font-weight: 500; color: var(--ytmusic-text-primary, #fff); }
.ytx-m-mark { all: initial; display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 4px; font: 500 10px/16px Roboto, Arial, sans-serif; color: #fff; background: rgba(229,57,53,.85); vertical-align: middle; white-space: nowrap; }
.ytx-m-mark[data-kind="highSkip"] { background: rgba(255,152,0,.85); }
.ytx-m-mark[data-kind="duplicate"], .ytx-m-mark[data-kind="recent"] { background: rgba(120,120,120,.85); }
ytmusic-player-queue-item[data-ytx-skip] { opacity: .55; }
ytmusic-player-queue-item[data-ytx-skip]:hover { opacity: 1; }
.ytx-m-bar-btns { display: inline-flex; align-items: center; gap: 2px; margin: 0 4px; }
`

export function initMusicUiCss() {
  setCss('music.ui', PAGE_CSS)
}

export function iconButton({ icon, label, title, pressed, onClick }) {
  const b = h('button', { type: 'button', class: 'ytx-m-iconbtn', title: title || label || '', 'aria-pressed': pressed == null ? undefined : String(!!pressed) }, h('span', { text: icon }), label && h('span', { class: 'ytx-m-lbl', text: label }))
  b.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onClick?.(e, b)
  })
  return b
}

export function pill({ label, title, onClick }) {
  const b = h('button', { type: 'button', class: 'ytx-m-pill', title: title || label, text: label })
  b.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onClick?.(e, b)
  })
  return b
}

// ---------- schublade im shadow dom ----------

const DRAWER_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { position: fixed; z-index: 2200; top: 64px; right: 0; bottom: 72px; width: min(520px, 100vw); display: flex; flex-direction: column;
  font: 400 14px/1.4 Roboto, Arial, sans-serif; color: var(--ytmusic-text-primary, #fff); background: var(--ytx-m-bg, #121212); border-left: 1px solid rgba(255,255,255,.1); box-shadow: -8px 0 32px rgba(0,0,0,.45); }
.wrap[hidden] { display: none; }
header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
header h2 { flex: 1; margin: 0; font-size: 18px; font-weight: 500; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 8px; }
.tab, .chip { border: 0; cursor: pointer; padding: 5px 11px; border-radius: 14px; font: 500 12px/1.3 inherit; font-family: inherit; color: var(--ytmusic-text-primary, #fff); background: rgba(255,255,255,.08); }
.tab:hover, .chip:hover { background: rgba(255,255,255,.16); }
.tab[aria-selected="true"], .chip[aria-pressed="true"] { color: #000; background: #fff; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 4px 14px 8px; border-bottom: 1px solid rgba(255,255,255,.08); }
.tools label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ytmusic-text-secondary, #aaa); }
.tools input[type=range] { width: 130px; accent-color: #fff; }
.tools select, .tools input[type=search] { font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,.15); color: inherit; background: rgba(255,255,255,.06); }
.tools select option { color: #000; }
main { flex: 1; overflow: auto; padding: 6px 6px 16px; }
.status { padding: 8px 10px; font-size: 12px; color: var(--ytmusic-text-secondary, #aaa); }
.status.err { color: #ff8a80; }
.row { display: grid; grid-template-columns: 44px 1fr auto; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 8px; }
.row:hover { background: rgba(255,255,255,.06); }
.row img, .row .ph { width: 44px; height: 44px; border-radius: 4px; object-fit: cover; background: rgba(255,255,255,.08); }
.row .t { min-width: 0; }
.row .title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 500; }
.row .sub { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; color: var(--ytmusic-text-secondary, #aaa); }
.reasons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.reason { font-size: 10.5px; padding: 1px 6px; border-radius: 4px; color: var(--ytmusic-text-secondary, #bbb); background: rgba(255,255,255,.07); }
.acts { display: flex; gap: 2px; opacity: .55; }
.row:hover .acts { opacity: 1; }
.ib { border: 0; cursor: pointer; width: 30px; height: 30px; border-radius: 15px; font-size: 15px; color: inherit; background: transparent; }
.ib:hover { background: rgba(255,255,255,.12); }
.btn { border: 0; cursor: pointer; padding: 6px 12px; border-radius: 16px; font: 500 12px/1.3 inherit; font-family: inherit; color: #000; background: #fff; }
.btn.sec { color: inherit; background: rgba(255,255,255,.1); }
.btn:disabled { opacity: .5; cursor: default; }
.menu { position: fixed; z-index: 10; min-width: 200px; padding: 6px 0; border-radius: 10px; background: #282828; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
.menu button { display: block; width: 100%; padding: 7px 14px; border: 0; text-align: left; font: inherit; color: inherit; background: none; cursor: pointer; }
.menu button:hover { background: rgba(255,255,255,.08); }
.section-title { padding: 10px 10px 4px; font-size: 12px; font-weight: 500; letter-spacing: .03em; text-transform: uppercase; color: var(--ytmusic-text-secondary, #aaa); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; padding: 4px 8px; }
.card { cursor: pointer; min-width: 0; }
.card img { width: 100%; aspect-ratio: 1; border-radius: 6px; object-fit: cover; background: rgba(255,255,255,.08); }
.card .title { font-size: 12px; font-weight: 500; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.card .sub { font-size: 11px; color: var(--ytmusic-text-secondary, #aaa); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.new { color: #ffc83d; }
`

export function createDrawer({ title, onClose }) {
  const host = h('ytx-music-drawer', { 'data-ytx-own': '' })
  const shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = DRAWER_CSS
  const heading = h('h2', { text: title })
  const close = h('button', { class: 'ib', title: 'Schließen', text: '✕' })
  const tabs = h('div', { class: 'tabs' })
  const tools = h('div', { class: 'tools' })
  const main = h('main')
  const wrap = h('div', { class: 'wrap', hidden: true }, h('header', null, heading, close), tabs, tools, main)
  shadow.append(style, wrap)
  close.addEventListener('click', () => api.close())
  for (const type of ['keydown', 'keyup', 'keypress']) listen(shadow, type, (e) => {
    if (e.key === 'Escape' && type === 'keydown') api.close()
    e.stopPropagation()
  })
  let menu = null
  const closeMenu = () => {
    menu?.remove()
    menu = null
  }
  listen(shadow, 'click', (e) => {
    if (menu && !menu.contains(e.composedPath()[0])) closeMenu()
  })
  const api = {
    host,
    shadow,
    tabs,
    tools,
    main,
    setTitle: (t) => (heading.textContent = t),
    get isOpen() {
      return !wrap.hidden
    },
    open() {
      if (!host.isConnected) document.documentElement.append(host)
      wrap.hidden = false
    },
    close() {
      wrap.hidden = true
      closeMenu()
      onClose?.()
    },
    toggle() {
      wrap.hidden ? api.open() : api.close()
    },
    menu(anchor, items) {
      closeMenu()
      const r = anchor.getBoundingClientRect()
      menu = h('div', { class: 'menu' })
      for (const [label, fn] of items) {
        const b = h('button', { type: 'button', text: label })
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          closeMenu()
          fn()
        })
        menu.append(b)
      }
      wrap.append(menu)
      const w = 220
      menu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`
      menu.style.top = `${Math.min(window.innerHeight - 260, r.bottom + 4)}px`
    }
  }
  onDispose(() => host.remove())
  return api
}

export function artistNames(t) {
  return (t.artists || []).map((a) => a.name).join(', ')
}

export function trackRow(item, { explain = true, onPlay, onMenu, extra } = {}) {
  const img = item.thumbnail ? h('img', { src: item.thumbnail, loading: 'lazy', alt: '' }) : h('div', { class: 'ph' })
  const sub = [artistNames(item), item.album?.name, item.durationSec ? formatDuration(item.durationSec) : null].filter(Boolean).join(' · ')
  const reasons = explain && item.reasons?.length ? h('div', { class: 'reasons' }, ...item.reasons.slice(0, 4).map((r) => h('span', { class: 'reason', text: r }))) : null
  const play = h('button', { class: 'ib', title: 'Abspielen', text: '▶' })
  const more = h('button', { class: 'ib', title: 'Feedback und mehr', text: '⋯' })
  play.addEventListener('click', (e) => {
    e.stopPropagation()
    onPlay?.(item)
  })
  more.addEventListener('click', (e) => {
    e.stopPropagation()
    onMenu?.(item, more)
  })
  const row = h('div', { class: 'row' }, img, h('div', { class: 't' }, h('div', { class: 'title', text: item.title || item.videoId }), h('div', { class: 'sub', text: sub }), reasons, extra), h('div', { class: 'acts' }, play, more))
  row.addEventListener('dblclick', () => onPlay?.(item))
  return row
}
