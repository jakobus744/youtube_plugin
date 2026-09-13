import { h, clear } from '../core/dom.js'
import { setCss } from '../core/css.js'
import { listen, onDispose } from '../core/lifecycle.js'

// gemeinsame bausteine fuer eingefuegte elemente in der youtube seite
// farben ueber youtube tokens damit themes greifen

const CSS = `
.ytx-btn { all: initial; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 18px; cursor: pointer; white-space: nowrap; user-select: none;
  font: 500 14px/36px Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); background: var(--yt-sys-color-baseline--tonal-background, rgba(255,255,255,.1)); }
.ytx-btn:hover { background: var(--yt-sys-color-baseline--mono-tonal-hover, rgba(255,255,255,.2)); }
.ytx-btn:focus-visible { outline: 2px solid var(--yt-sys-color-baseline--call-to-action, #3ea6ff); }
.ytx-btn[disabled] { opacity: .5; cursor: default; }
.ytx-btn .ytx-ico { font-size: 16px; line-height: 1; }
.ytx-btn, .ytx-split { flex: none !important; }
.ytx-split { all: initial; display: inline-flex; align-items: stretch; margin-left: 8px; vertical-align: middle; }
.ytx-modal { position: fixed; z-index: 2500; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.5); }
.ytx-modal > div { width: min(720px, 92vw); max-height: 80vh; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 12px;
  font: 400 14px/1.4 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); background: var(--yt-sys-color-baseline--menu-background, #282828); }
.ytx-modal textarea { flex: 1; min-height: 300px; resize: vertical; padding: 8px; border-radius: 8px; font: 12px/1.4 ui-monospace, Consolas, monospace;
  color: inherit; background: var(--yt-sys-color-baseline--raised-background, #1f1f1f); border: 1px solid var(--yt-sys-color-baseline--outline, #444); }
.ytx-modal .ytx-row { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
.ytx-split > .ytx-btn:first-child { border-radius: 18px 0 0 18px; padding-right: 10px; }
.ytx-split > .ytx-btn:last-child { border-radius: 0 18px 18px 0; padding: 0 10px; border-left: 1px solid var(--yt-sys-color-baseline--outline, rgba(255,255,255,.2)); }
.ytx-small { height: 28px; line-height: 28px; font-size: 12px; padding: 0 10px; border-radius: 14px; }
.ytx-inline { all: initial; font: inherit; color: inherit; }
.ytx-note { all: initial; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; font: 400 12px/1.4 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); }
.ytx-note b { font-weight: 500; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); }
.ytx-link { all: initial; cursor: pointer; font: 500 12px/1.4 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--call-to-action, #3ea6ff); }
.ytx-link:hover { text-decoration: underline; }
.ytx-menu { position: fixed; z-index: 2300; min-width: 240px; max-width: 340px; max-height: 70vh; overflow: auto; padding: 8px 0; border-radius: 12px; box-sizing: border-box;
  font: 400 14px/1.35 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); background: var(--yt-sys-color-baseline--menu-background, #282828);
  box-shadow: 0 4px 32px rgba(0,0,0,.4); }
.ytx-menu-title { padding: 8px 16px 4px; font-size: 11px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: var(--yt-sys-color-baseline--text-secondary, #aaa); }
.ytx-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; box-sizing: border-box; cursor: pointer; border: 0; background: none; text-align: left; font: inherit; color: inherit; }
.ytx-menu-item:hover, .ytx-menu-item:focus-visible { outline: none; background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.1)); }
.ytx-menu-item[disabled] { opacity: .45; cursor: default; background: none; }
.ytx-menu-item .ytx-check { width: 14px; text-align: center; color: var(--yt-sys-color-baseline--call-to-action, #3ea6ff); }
.ytx-menu-item .ytx-sub { margin-left: auto; padding-left: 12px; font-size: 12px; color: var(--yt-sys-color-baseline--text-secondary, #aaa); }
.ytx-menu-sep { height: 1px; margin: 6px 0; background: var(--yt-sys-color-baseline--outline, rgba(255,255,255,.1)); }
.ytx-menu-foot { padding: 6px 16px 2px; font-size: 12px; color: var(--yt-sys-color-baseline--text-secondary, #aaa); }
.ytx-toast { position: fixed; z-index: 2400; left: 50%; bottom: 32px; transform: translateX(-50%); max-width: 80vw; padding: 10px 16px; border-radius: 8px;
  font: 400 14px/1.3 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary-inverse, #0f0f0f); background: var(--yt-sys-color-baseline--inverted-background, #f1f1f1); box-shadow: 0 4px 16px rgba(0,0,0,.3); }
.ytx-toast[data-kind="error"] { background: #c62828; color: #fff; }
.ytx-badge { position: absolute; z-index: 3; right: 4px; top: 4px; padding: 1px 5px; border-radius: 4px; pointer-events: none; font: 500 11px/16px Roboto, Arial, sans-serif; color: #fff; background: rgba(0,0,0,.75); }
`

export function initUiCss() {
  setCss('ui', CSS)
}

export function button({ label, icon, title, small, onClick }) {
  const b = h('button', { class: ['ytx-btn', small && 'ytx-small'], type: 'button', title, 'data-ytx-own': '' }, icon && h('span', { class: 'ytx-ico', text: icon }), label && h('span', { class: 'ytx-label', text: label }))
  if (onClick)
    b.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick(e)
    })
  return b
}

export function splitButton({ label, icon, title, onMain, onMenu }) {
  const main = button({ label, icon, title, onClick: onMain })
  const more = button({ icon: '▾', title: 'Optionen', onClick: (e) => onMenu(more, e) })
  const wrap = h('div', { class: 'ytx-split', 'data-ytx-own': '' }, main, more)
  wrap.main = main
  wrap.more = more
  return wrap
}

let openMenu = null

export function closeMenu() {
  openMenu?.remove()
  openMenu = null
}

// items: {title} | {sep} | {label, sub, checked, disabled, run} | {foot}
export function showMenu(anchorEl, items) {
  const wasOpenForThis = openMenu && openMenu.__anchor === anchorEl
  closeMenu()
  if (wasOpenForThis) return
  const menu = h('div', { class: 'ytx-menu', role: 'menu', 'data-ytx-own': '' })
  menu.__anchor = anchorEl
  for (const it of items) {
    if (!it) continue
    if (it.sep) menu.append(h('div', { class: 'ytx-menu-sep' }))
    else if (it.title) menu.append(h('div', { class: 'ytx-menu-title', text: it.title }))
    else if (it.foot) menu.append(h('div', { class: 'ytx-menu-foot', text: it.foot }))
    else {
      const b = h(
        'button',
        { class: 'ytx-menu-item', role: 'menuitem', type: 'button', disabled: it.disabled },
        it.checked !== undefined && h('span', { class: 'ytx-check', text: it.checked ? '●' : '' }),
        h('span', { text: it.label }),
        it.sub && h('span', { class: 'ytx-sub', text: it.sub })
      )
      b.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!it.keepOpen) closeMenu()
        it.run?.()
      })
      menu.append(b)
    }
  }
  document.body.append(menu)
  const r = anchorEl.getBoundingClientRect()
  const mw = menu.offsetWidth
  const mh = menu.offsetHeight
  let left = Math.min(r.left, window.innerWidth - mw - 8)
  let top = r.bottom + 6
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6)
  menu.style.left = `${Math.max(8, left)}px`
  menu.style.top = `${top}px`
  openMenu = menu
  menu.querySelector('.ytx-menu-item:not([disabled])')?.focus({ preventScroll: true })
}

let toastEl = null
let toastTimer = null

export function toast(text, kind = 'info', ms = 2600) {
  toastEl?.remove()
  clearTimeout(toastTimer)
  toastEl = h('div', { class: 'ytx-toast', 'data-kind': kind, 'data-ytx-own': '', role: 'status', text })
  document.body.append(toastEl)
  toastTimer = setTimeout(() => {
    toastEl?.remove()
    toastEl = null
  }, ms)
}

// fallback wenn die zwischenablage blockiert ist
export function textDialog(title, text) {
  document.querySelector('.ytx-modal')?.remove()
  const ta = h('textarea', { readonly: true, spellcheck: 'false' })
  ta.value = text
  const close = () => modal.remove()
  const closeBtn = button({ label: 'Schließen', onClick: close })
  const modal = h('div', { class: 'ytx-modal', 'data-ytx-own': '' }, h('div', null, h('b', { text: title }), h('span', { class: 'ytx-note', text: 'Die Zwischenablage war blockiert. Text ist markiert – mit Strg+C kopieren.' }), ta, h('div', { class: 'ytx-row' }, closeBtn)))
  modal.addEventListener('click', (e) => e.target === modal && close())
  modal.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  })
  document.body.append(modal)
  ta.focus()
  ta.select()
}

export function setButtonBusy(btn, busy, label) {
  const l = btn.querySelector('.ytx-label')
  if (busy) {
    btn.__label ??= l?.textContent
    btn.disabled = true
    if (l && label) l.textContent = label
  } else {
    btn.disabled = false
    if (l && btn.__label != null) l.textContent = btn.__label
    btn.__label = null
  }
}

export function initMenuDismiss() {
  listen(document, 'pointerdown', (e) => {
    if (openMenu && !e.composedPath().includes(openMenu) && !e.composedPath().includes(openMenu.__anchor)) closeMenu()
  }, true)
  listen(document, 'keydown', (e) => e.key === 'Escape' && closeMenu(), true)
  listen(window, 'resize', closeMenu)
  listen(document, 'yt-navigate-start', closeMenu)
  onDispose(() => {
    closeMenu()
    toastEl?.remove()
  })
}

export { h, clear }
