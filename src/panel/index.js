import { h } from '../core/dom.js'
import { onDispose, listen } from '../core/lifecycle.js'
import { PANEL_CSS } from './styles.js'
import { displayTab, lookTab, layoutTab, behaviorTab, filterTab, featuresTab, profilesTab, diagnoseTab } from './tabs.js'
import { button } from '../features/ui.js'
import { summarize, runChecks } from '../core/diagnose.js'

const TABS = [
  ['display', 'Anzeige', displayTab],
  ['look', 'Look', lookTab],
  ['layout', 'Layout', layoutTab],
  ['behavior', 'Verhalten', behaviorTab],
  ['filters', 'Filter', filterTab],
  ['features', 'Features', featuresTab],
  ['profiles', 'Profile', profilesTab],
  ['diagnose', 'Diagnose', diagnoseTab]
]

export function createPanel(app) {
  const host = h('ytx-panel', { 'data-ytx-own': '' })
  const shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = PANEL_CSS
  shadow.append(style)

  const profileSelect = h('select', { title: 'Aktives Profil' })
  const closeBtn = h('button', { class: 'iconbtn', title: 'Schließen (Alt+Y)', text: '✕' })
  const nav = h('nav', { role: 'tablist' })
  const main = h('main')
  const status = h('span')
  const footInfo = h('span')
  const panel = h('div', { class: 'panel', hidden: true }, h('header', null, h('span', { class: 'logo', text: 'ytx' }), profileSelect, closeBtn), nav, main, h('footer', null, status, footInfo))
  shadow.append(panel)

  let tab = app.store.settings.panelTab || 'display'
  let content = null
  let flashTimer = null
  let countTimer = null

  const tabButtons = new Map()
  for (const [id, label] of TABS) {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === tab), text: label })
    b.addEventListener('click', () => select(id))
    tabButtons.set(id, b)
    nav.append(b)
  }

  function fillProfiles() {
    profileSelect.replaceChildren(...app.store.profiles().map((p) => h('option', { value: p.id, text: p.name, selected: p.active })))
  }
  profileSelect.addEventListener('change', () => app.store.setActive(profileSelect.value))
  closeBtn.addEventListener('click', () => close())

  function select(id) {
    tab = id
    for (const [k, b] of tabButtons) b.setAttribute('aria-selected', String(k === id))
    app.store.updateSettings((s) => (s.panelTab = id))
    render()
  }

  function render() {
    if (panel.hidden) return
    const scroll = main.scrollTop
    const def = TABS.find(([id]) => id === tab) || TABS[0]
    try {
      content = def[2](app)
    } catch (e) {
      app.log.error(`panel ${tab}`, e)
      content = h('p', { class: 'err', text: `Tab konnte nicht gezeichnet werden: ${e.message}` })
    }
    main.replaceChildren(content)
    main.scrollTop = scroll
    fillProfiles()
    updateFooter()
  }

  function updateFooter() {
    const s = summarize(runChecks())
    footInfo.textContent = `v${app.version} · ${s.fail ? `${s.fail} Fehler · ` : ''}${s.warn ? `${s.warn} Warnungen` : 'Diagnose ok'}`
  }

  app.rerender = render
  app.flash = (text) => {
    status.textContent = text
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (status.textContent = ''), 3500)
  }

  function open() {
    if (!host.isConnected) document.documentElement.append(host)
    panel.hidden = false
    render()
    clearInterval(countTimer)
    // treffer zahlen ab und zu auffrischen solange offen
    countTimer = setInterval(() => {
      if (panel.hidden) return
      if ((tab === 'display' || tab === 'diagnose') && !shadow.activeElement) content?.refreshCounts?.()
      updateFooter()
    }, 3000)
  }
  function close() {
    panel.hidden = true
    clearInterval(countTimer)
  }
  function toggle() {
    panel.hidden ? open() : close()
  }

  app.store.subscribe((cfg, reason) => {
    if (panel.hidden) return
    if (reason === 'panel') {
      fillProfiles()
      return
    }
    if (reason !== 'settings') render()
  })

  listen(shadow, 'keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
    // youtube tastenkuerzel nicht ausloesen waehrend im panel getippt wird
    if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key !== 'Escape') e.stopPropagation()
  })
  for (const type of ['keyup', 'keypress']) listen(shadow, type, (e) => e.stopPropagation())

  document.documentElement.append(host)
  onDispose(() => {
    clearInterval(countTimer)
    host.remove()
  })

  return { open, close, toggle, render, select, shadow, get isOpen() { return !panel.hidden } }
}

export function mastheadButton(app, panel) {
  return app.mount({
    id: 'top.ytx',
    anchor: 'top.buttons',
    position: 'prepend',
    when: () => app.store.settings.panelButton !== false,
    create: () => {
      const b = button({ label: 'ytx', title: 'ytx Einstellungen (Alt+Y)', small: true, onClick: () => panel.toggle() })
      b.style.margin = '0 8px'
      return b
    }
  })
}
