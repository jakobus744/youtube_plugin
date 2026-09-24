import { h } from '../core/dom.js'
import { formatDuration } from '../core/format.js'
import { row, toggle, btn } from './controls.js'
import { groupsData, updateGroups, addGroup, knownChannels } from '../features/youtube/subGroups/index.js'
import { groupsOf, toggleChannel } from '../features/youtube/subGroups/logic.js'
import { ytDb } from '../features/youtube/watchtime/db.js'
import { watchStats, startOfDay, DAY } from '../features/youtube/watchtime/logic.js'
import { watchTime } from '../features/youtube/watchtime/index.js'

// panel tabs nur fuer youtube

// ---------- abo gruppen ----------

export function subGroupsTab(app) {
  const root = h('div')
  const data = groupsData()
  const enabled = app.store.config.features['subs.groups']?.enabled

  if (!enabled) root.append(h('p', { class: 'hint', text: 'Feature „Abo-Gruppen“ ist aus. Einschalten unter Features, damit die Filterleiste im Abo-Feed erscheint.' }))

  root.append(h('h3', { text: 'Gruppen' }))
  for (const g of data.groups) {
    const name = h('input', { type: 'text', value: g.name })
    name.addEventListener('change', () => updateGroups((d) => {
      const x = d.groups.find((y) => y.id === g.id)
      if (x && name.value.trim()) x.name = name.value.trim()
    }))
    const up = btn('↑', () => {
      updateGroups((d) => {
        const i = d.groups.findIndex((y) => y.id === g.id)
        if (i > 0) [d.groups[i - 1], d.groups[i]] = [d.groups[i], d.groups[i - 1]]
      })
      app.rerender()
    }, 'tiny')
    const del = btn('Löschen', () => {
      const box = h('div', { class: 'btns' }, h('span', { class: 'muted', text: `„${g.name}“ löschen? Die Kanäle bleiben abonniert.` }), btn('Ja', () => {
        updateGroups((d) => (d.groups = d.groups.filter((y) => y.id !== g.id)))
        app.rerender()
      }, 'tiny danger'), btn('Nein', () => box.remove(), 'tiny'))
      rowEl.after(box)
    }, 'tiny danger')
    const rowEl = h('div', { class: 'row' }, name, h('span', { class: 'muted', text: `${g.channels.length} Kanäle` }), up, del)
    root.append(rowEl)
  }
  const newName = h('input', { type: 'text', placeholder: 'Neue Gruppe, z. B. Tech' })
  const add = () => {
    if (addGroup(newName.value)) app.rerender()
  }
  newName.addEventListener('keydown', (e) => e.key === 'Enter' && add())
  root.append(h('div', { class: 'row' }, newName, btn('Anlegen', add, 'primary')))

  if (!data.groups.length) {
    root.append(h('p', { class: 'hint', text: 'Lege zuerst eine Gruppe an, dann kannst du unten Kanäle zuordnen.' }))
    return root
  }

  root.append(h('h3', { text: 'Kanäle zuordnen' }))
  const search = h('input', { type: 'search', placeholder: 'Kanal suchen …', value: app.ui.sgSearch || '' })
  const onlyFree = toggle(app.ui.sgFree ?? false, (v) => {
    app.ui.sgFree = v
    draw()
  })
  const list = h('div')
  root.append(search, row('Nur Kanäle ohne Gruppe', onlyFree), list)
  search.addEventListener('input', () => {
    app.ui.sgSearch = search.value
    draw()
  })

  function draw() {
    const d = groupsData()
    const q = search.value.trim().toLowerCase()
    const chans = knownChannels().filter((c) => !q || `${c.name} ${c.handle || ''}`.toLowerCase().includes(q)).filter((c) => !app.ui.sgFree || !groupsOf(c, d).length)
    list.replaceChildren()
    if (!chans.length) {
      list.append(h('p', { class: 'hint', text: 'Keine Kanäle gefunden. ytx kennt Kanäle aus deiner Abo-Liste in der Seitenleiste (mit Anmeldung) und aus den Videos im Abo-Feed. Auf jeder Kanalseite gibt es außerdem einen Button „Gruppen“.' }))
      return
    }
    for (const c of chans.slice(0, 300)) {
      const mine = new Set(groupsOf(c, d).map((g) => g.id))
      const chips = h('div', { class: 'chips' }, ...d.groups.map((g) => {
        const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(mine.has(g.id)), text: g.name })
        b.addEventListener('click', () => {
          updateGroups((x) => toggleChannel(x, g.id, c))
          b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))
        })
        return b
      }))
      list.append(h('div', { class: 'row stack' }, h('div', { class: 'label' }, c.name || c.handle || c.id, c.handle && h('small', { text: c.handle })), chips))
    }
    if (chans.length > 300) list.append(h('p', { class: 'hint', text: `${chans.length - 300} weitere, Suche nutzen` }))
  }
  draw()
  return root
}

// ---------- schauzeit ----------

function bars(list, max, labelFn) {
  return h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px', margin: '6px 0 2px' } },
    ...list.map((x) => h('div', { title: `${labelFn(x)}: ${formatDuration(x.sec)}`, style: { flex: '1', minWidth: '6px', height: `${Math.max(2, (x.sec / Math.max(1, max)) * 80)}px`, background: 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: x.sec ? '1' : '.25' } }))
  )
}

export function watchStatsTab(app) {
  const root = h('div')
  const f = app.store.config.features['watch.time']
  if (!f?.enabled) {
    root.append(h('p', { class: 'hint', text: 'Feature „Schauzeit & Tageslimit“ ist aus. Einschalten unter Features.' }))
  }
  const ranges = [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage']]
  app.ui.wtRange ||= '7'
  const body = h('div')
  const rangeBox = h('div', { class: 'chips' }, ...ranges.map(([v, l]) => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(app.ui.wtRange === v), text: l })
    b.addEventListener('click', () => {
      app.ui.wtRange = v
      app.rerender()
    })
    return b
  }))
  root.append(row('Zeitraum', rangeBox), body)

  const draw = async () => {
    const days = Number(app.ui.wtRange)
    const now = Date.now()
    const from = startOfDay(now) - (days - 1) * DAY
    const views = await ytDb().byIndex('views', 'startedAt', IDBKeyRange.lowerBound(from))
    // laufende sitzung ist schon zwischengespeichert, sonst hier ergaenzen
    const live = watchTime.instance?.session
    if (live && live.wallSec >= 1 && !views.some((v) => v.id === live.id)) views.push({ ...live })
    else if (live) Object.assign(views.find((v) => v.id === live.id), { wallSec: live.wallSec })
    const st = watchStats(views, { from, to: now + 1, now, days })
    const today = st.byDay.at(-1)?.sec || 0
    const limit = f?.limitMinutes || 0
    body.replaceChildren(
      h('div', { class: 'summary', style: { flexWrap: 'wrap' } },
        h('span', null, h('b', { text: formatDuration(today) }), 'heute'),
        h('span', null, h('b', { text: formatDuration(st.avgPerDay) }), 'Ø pro Tag'),
        h('span', null, h('b', { text: formatDuration(st.total) }), `in ${days} Tagen`),
        h('span', null, h('b', { text: st.total ? `${Math.round((st.shorts / st.total) * 100)} %` : '0 %' }), 'Shorts')
      ),
      limit ? h('p', { class: 'hint', text: `Tageslimit ${formatDuration(limit * 60)} · heute ${Math.min(999, Math.round((today / (limit * 60)) * 100))} % · einstellbar unter Features › Schauzeit` }) : h('p', { class: 'hint', text: 'Kein Tageslimit gesetzt (Features › Schauzeit)' })
    )
    const shown = st.byDay.slice(-Math.min(days, 31))
    const max = Math.max(limit * 60, ...shown.map((x) => x.sec))
    body.append(h('h3', { text: 'Pro Tag' }), bars(shown, max, (x) => x.day), h('div', { class: 'hint', text: `${shown[0]?.day || ''} … heute` }))
    body.append(h('h3', { text: 'Meiste Zeit bei' }))
    if (!st.topChannels.length) body.append(h('p', { class: 'muted', text: 'Noch keine Daten.' }))
    st.topChannels.forEach((c, i) => body.append(h('div', { class: 'row' }, h('div', { class: 'label' }, `${i + 1}. ${c.name}`, h('small', { text: `${c.count} Videos` })), h('span', { class: 'muted', text: formatDuration(c.sec) }))))
    body.append(h('h3', { text: 'Videos' }))
    st.topVideos.forEach((v) => body.append(h('div', { class: 'row' }, h('div', { class: 'label' }, v.title || v.videoId, h('small', { text: `${v.channel}${v.kind === 'short' ? ' · Short' : ''}` })), h('span', { class: 'muted', text: formatDuration(v.sec) }))))
  }
  draw().catch((e) => body.replaceChildren(h('p', { class: 'err', text: e.message })))

  root.append(h('h3', { text: 'Daten' }), h('div', { class: 'btns' },
    btn('Als Text kopieren', async () => {
      const days = Number(app.ui.wtRange)
      const now = Date.now()
      const from = startOfDay(now) - (days - 1) * DAY
      const st = watchStats(await ytDb().byIndex('views', 'startedAt', IDBKeyRange.lowerBound(from)), { from, to: now + 1, now, days })
      const text = [`Meine YouTube-Zeit · ${days} Tage`, `${formatDuration(st.total)} gesamt · Ø ${formatDuration(st.avgPerDay)} pro Tag`, '', ...st.byDay.map((d) => `${d.day}: ${formatDuration(d.sec)}`), '', 'Top-Kanäle', ...st.topChannels.map((c, i) => `${i + 1}. ${c.name} (${formatDuration(c.sec)})`)].join('\n')
      app.flash((await app.copyText(text)) ? 'Kopiert' : 'Kopieren fehlgeschlagen')
    }),
    btn('Verlauf löschen', (e) => {
      const box = h('div', { class: 'btns' }, h('span', { class: 'muted', text: 'Gesamte Schauzeit löschen?' }), btn('Ja', async () => {
        await ytDb().clear('views')
        if (watchTime.instance) watchTime.instance.state.todayBase = 0
        app.flash('Schauzeit gelöscht')
        app.rerender()
      }, 'tiny danger'), btn('Nein', () => box.remove(), 'tiny'))
      e.currentTarget.parentElement.after(box)
    }, 'danger')
  ))
  return root
}

