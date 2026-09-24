import { store } from '../../../core/store.js'
import { pageWindow } from '../../../core/bridge.js'
import { qsa } from '../../../core/dom.js'
import { CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots, channelRefOf, channelPageInfo, subscribedChannels } from '../../../registry/youtube/paths.js'
import { GROUPS_BUCKET, NONE, normalizeGroups, visibleIn, toggleChannel, groupsOf, enrich } from './logic.js'
import { h, button, showMenu, toast } from '../../ui.js'

// abo gruppen: filterleiste im abo feed, zuordnen auf der kanalseite und im panel

const ATTR = 'data-ytx-sg-hide'

export const groupsData = () => store.bucket(GROUPS_BUCKET, normalizeGroups)
export const updateGroups = (fn) => store.updateBucket(GROUPS_BUCKET, fn, normalizeGroups)

export function addGroup(name) {
  const n = String(name || '').trim()
  if (!n) return null
  let id = null
  updateGroups((d) => {
    id = `g${Date.now().toString(36)}`
    d.groups.push({ id, name: n, channels: [] })
  })
  return id
}

// kanaele die ytx gerade kennt: abo liste, feed kacheln, schon zugeordnete
export function knownChannels() {
  const out = new Map()
  const add = (c) => {
    if (!c?.name && !c?.id) return
    const key = c.id || c.handle || `name:${c.name.toLowerCase()}`
    const prev = out.get(key)
    out.set(key, { id: c.id || prev?.id || null, handle: c.handle || prev?.handle || null, name: c.name || prev?.name || '' })
  }
  for (const c of subscribedChannels()) add(c)
  for (const el of outerCards()) add(channelRefOf(readCard(el)))
  for (const g of groupsData().groups) for (const c of g.channels) add(c)
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

function outerCards() {
  const out = []
  for (const root of activePageRoots()) {
    for (const el of qsa(CARD_SELECTORS.join(', '), root)) if (!el.parentElement?.closest(CARD_PARENT)) out.push(el)
  }
  return out
}

function openPanelTab() {
  const panel = pageWindow.__ytx?.panel
  if (!panel) return
  panel.open()
  panel.select('subGroups')
}

export default {
  id: 'subs.groups',
  label: 'Abo-Gruppen',
  group: 'Abos',
  description: 'Eigene Gruppen wie „Tech“ oder „Musik“ für deine Abos. Filterleiste über dem Abo-Feed, Zuordnen auf der Kanalseite und im Tab „Abo-Gruppen“',
  pages: ['subscriptions', 'channel'],
  stability: 'mittel',
  anchors: ['subs.feedTop', 'channel.headerButtons'],
  settings: {
    showNone: { type: 'toggle', label: 'Chip „Ohne Gruppe“ anzeigen', default: true },
    rememberGroup: { type: 'toggle', label: 'Zuletzt gewählte Gruppe merken', default: false }
  },
  setup(ctx) {
    let s = ctx.settings
    let active = s.rememberGroup ? ctx.state.get('subs.activeGroup', null) : null
    const stats = { checked: 0, hidden: 0 }
    ctx.css(`[${ATTR}] { display: none !important; }
.ytx-sg-bar { all: initial; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 8px; font: 500 14px Roboto, Arial, sans-serif; }
.ytx-sg-chip { all: initial; cursor: pointer; padding: 6px 12px; border-radius: 8px; font: 500 14px/20px Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.1)); }
.ytx-sg-chip:hover { background: var(--yt-sys-color-baseline--mono-tonal-hover, rgba(255,255,255,.2)); }
.ytx-sg-chip[aria-pressed="true"] { color: var(--yt-sys-color-baseline--text-primary-inverse, #0f0f0f); background: var(--yt-sys-color-baseline--text-primary, #f1f1f1); }
.ytx-sg-chip small { opacity: .65; margin-left: 4px; font-size: 12px; }
.ytx-sg-edit { all: initial; cursor: pointer; font: 500 13px Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--call-to-action, #3ea6ff); margin-left: 4px; }
.ytx-sg-info { font: 400 12px Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); margin-left: auto; }`)

    function apply() {
      const data = groupsData()
      let checked = 0
      let hidden = 0
      let learned = false
      for (const el of outerCards()) {
        const card = readCard(el)
        if (!card) continue
        const ch = channelRefOf(card)
        checked++
        if (groupsOf(ch, data).length && enrich(data, ch)) learned = true
        const show = ctx.nav.page !== 'subscriptions' || visibleIn(ch, active, data)
        if (show) el.removeAttribute(ATTR)
        else {
          el.setAttribute(ATTR, '')
          hidden++
        }
      }
      if (learned) updateGroups((d) => Object.assign(d, data))
      stats.checked = checked
      stats.hidden = hidden
    }

    function drawBar(node) {
      const data = groupsData()
      const chip = (id, label, count) => {
        const b = h('button', { type: 'button', class: 'ytx-sg-chip', 'aria-pressed': String((active || null) === id) }, label, count != null && h('small', { text: String(count) }))
        b.addEventListener('click', () => {
          active = id
          if (s.rememberGroup) ctx.state.set('subs.activeGroup', id)
          apply()
          drawBar(node)
          window.scrollTo({ top: 0 })
        })
        return b
      }
      const edit = h('button', { type: 'button', class: 'ytx-sg-edit', text: data.groups.length ? '✎ Gruppen bearbeiten' : '+ Abo-Gruppe anlegen' })
      edit.addEventListener('click', openPanelTab)
      const kids = [chip(null, 'Alle')]
      for (const g of data.groups) kids.push(chip(g.id, g.name, g.channels.length))
      if (s.showNone && data.groups.length) kids.push(chip(NONE, 'Ohne Gruppe'))
      kids.push(edit)
      if (active) kids.push(h('span', { class: 'ytx-sg-info', text: `${stats.checked - stats.hidden} von ${stats.checked} Videos` }))
      node.replaceChildren(...kids)
    }

    const bar = ctx.mount({
      id: 'subs.groups.bar',
      anchor: 'subs.feedTop',
      position: 'before',
      when: () => ctx.nav.page === 'subscriptions',
      create: () => h('div', { class: 'ytx-sg-bar' }),
      update: (node) => drawBar(node)
    })

    // kanalseite: gruppen button
    const chan = ctx.mount({
      id: 'subs.groups.channel',
      anchor: 'channel.headerButtons',
      position: 'append',
      when: () => ctx.nav.page === 'channel' && !!channelPageInfo(),
      create: () => {
        const b = button({
          label: 'Gruppen',
          icon: '☰',
          title: 'Kanal einer Abo-Gruppe zuordnen',
          onClick: () => {
            const ch = channelPageInfo()
            if (!ch) return toast('Kanal noch nicht erkannt')
            const data = groupsData()
            const items = [{ title: ch.name }]
            for (const g of data.groups) {
              const on = groupsOf(ch, data).some((x) => x.id === g.id)
              items.push({ label: g.name, checked: on, run: () => {
                updateGroups((d) => toggleChannel(d, g.id, ch))
                toast(`${ch.name} ${on ? 'aus' : 'in'} „${g.name}“`)
                chan.refresh()
              } })
            }
            items.push({ sep: true }, { label: 'Neue Gruppe …', run: () => {
              const name = pageWindow.prompt('Name der neuen Abo-Gruppe')
              const id = addGroup(name)
              if (!id) return
              updateGroups((d) => toggleChannel(d, id, ch))
              toast(`${ch.name} in „${name.trim()}“`)
              chan.refresh()
            } }, { label: 'Alle Gruppen verwalten', run: openPanelTab })
            showMenu(chan.node, items)
          }
        })
        b.style.marginLeft = '8px'
        return b
      },
      update: (node) => {
        const ch = channelPageInfo()
        const names = ch ? groupsOf(ch, groupsData()).map((g) => g.name) : []
        const label = node.querySelector('.ytx-label')
        const text = names.length ? names.join(', ') : 'Gruppen'
        if (label && label.textContent !== text) label.textContent = text
      }
    })

    const off = ctx.onSweep(() => {
      if (ctx.nav.page === 'subscriptions') {
        apply()
        if (bar.node && active) drawBar(bar.node)
      }
    })

    return {
      onPage(page) {
        if (page !== 'subscriptions') for (const el of qsa(`[${ATTR}]`)) el.removeAttribute(ATTR)
        bar.refresh()
        chan.refresh()
      },
      update(next) {
        s = next
        bar.refresh()
      },
      dispose() {
        off()
        for (const el of qsa(`[${ATTR}]`)) el.removeAttribute(ATTR)
        bar.destroy()
        chan.destroy()
      },
      health() {
        const n = groupsData().groups.length
        if (ctx.nav.page === 'subscriptions') return bar.ok ? { status: 'ok', detail: `${n} Gruppen · ${active ? `Filter aktiv, ${stats.hidden}/${stats.checked} ausgeblendet` : 'kein Filter'}` } : { status: 'warn', detail: 'Abo-Feed nicht gefunden (Anmeldung nötig)' }
        if (ctx.nav.page === 'channel') return chan.ok ? { status: 'ok', detail: 'Gruppen-Button auf der Kanalseite' } : { status: 'warn', detail: 'Kanal-Kopf nicht gefunden' }
        return { status: 'skip', detail: `${n} Gruppen` }
      },
      debug: { apply, setActive: (id) => ((active = id), apply()), stats }
    }
  }
}
