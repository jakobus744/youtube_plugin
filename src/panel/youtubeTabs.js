import { h } from '../core/dom.js'
import { formatDuration } from '../core/format.js'
import { row, toggle, btn } from './controls.js'
import { featureCard } from './tabs.js'
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

  root.append(h('p', { class: 'hint', text: 'Abo-Gruppen sortieren deine abonnierten Kanäle in eigene Themen, z. B. „Tech“, „Musik“ oder „Sport“. Im Abo-Feed erscheint dann oben eine Leiste mit diesen Gruppen: ein Klick zeigt nur noch Videos der Kanäle aus dieser Gruppe. Zuordnen geht hier unten oder auf jeder Kanalseite über den Button „Gruppen“. Alles bleibt lokal, YouTube merkt davon nichts.' }))
  root.append(featureCard(app, 'subs.groups', null, { title: 'Abo-Gruppen benutzen' }))
  if (!enabled) return root

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

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

function bars(list, limitSec) {
  const top = Math.max(60, ...list.map((x) => x.sec))
  const max = limitSec && limitSec <= top * 1.25 ? Math.max(top, limitSec) : top
  const H = 90
  const few = list.length <= 14
  const cols = list.map((x) => {
    const d = new Date(`${x.day}T12:00:00`)
    const over = limitSec && x.sec > limitSec
    return h('div', { title: `${x.day}: ${formatDuration(x.sec)}`, style: { flex: '1', minWidth: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '2px', height: `${H + (few ? 30 : 0)}px` } },
      few && x.sec ? h('span', { text: `${Math.round(x.sec / 60)}m`, style: { fontSize: '10px', opacity: '.7', whiteSpace: 'nowrap' } }) : null,
      h('div', { style: { width: '100%', height: `${x.sec ? Math.max(3, (x.sec / max) * H) : 2}px`, background: over ? 'var(--danger, #e53935)' : 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: x.sec ? '1' : '.25' } }),
      few ? h('span', { text: WD[d.getDay()], style: { fontSize: '10px', opacity: '.7' } }) : null
    )
  })
  const wrap = h('div', { style: { position: 'relative', display: 'flex', alignItems: 'flex-end', gap: '4px', margin: '6px 0 2px' } }, ...cols)
  if (limitSec && limitSec <= max) wrap.append(h('div', { title: `Tageslimit ${formatDuration(limitSec)}`, style: { position: 'absolute', left: 0, right: 0, bottom: `${(limitSec / max) * H + (few ? 16 : 0)}px`, borderTop: '1px dashed var(--danger, #e53935)', opacity: '.7', pointerEvents: 'none' } }))
  return wrap
}

export function watchStatsTab(app) {
  const root = h('div')
  const f = app.store.config.features['watch.time']
  if (!f?.enabled) {
    root.append(h('p', { class: 'hint', text: 'Schauzeit ist aus. Unten einschalten, dann misst ytx lokal, wie lange Videos laufen.' }))
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
      limit ? h('p', { class: 'hint', text: `Tageslimit ${formatDuration(limit * 60)} · heute ${Math.min(999, Math.round((today / (limit * 60)) * 100))} % · einstellbar unten` }) : h('p', { class: 'hint', text: 'Kein Tageslimit gesetzt (unten einstellbar)' })
    )
    const shown = st.byDay.slice(-Math.min(days, 31))
    const lim = limit * 60
    const over = lim && Math.max(...shown.map((x) => x.sec)) * 1.25 < lim
    body.append(h('h3', { text: 'Pro Tag' }), bars(shown, lim), h('div', { class: 'hint', text: `${shown[0]?.day || ''} … heute${over ? ` · Limit ${formatDuration(lim)} liegt weit darüber` : lim ? ' · gestrichelt: Tageslimit' : ''}` }))
    body.append(h('h3', { text: 'Meiste Zeit bei' }))
    if (!st.topChannels.length) body.append(h('p', { class: 'muted', text: 'Noch keine Daten.' }))
    st.topChannels.forEach((c, i) => body.append(h('div', { class: 'row' }, h('div', { class: 'label' }, `${i + 1}. ${c.name}`, h('small', { text: `${c.count} Videos` })), h('span', { class: 'muted', text: formatDuration(c.sec) }))))
    body.append(h('h3', { text: 'Videos' }))
    st.topVideos.forEach((v) => body.append(h('div', { class: 'row' }, h('div', { class: 'label' }, v.title || v.videoId, h('small', { text: `${v.channel}${v.kind === 'short' ? ' · Short' : ''}` })), h('span', { class: 'muted', text: formatDuration(v.sec) }))))
  }
  draw().catch((e) => body.replaceChildren(h('p', { class: 'err', text: e.message })))

  root.append(h('h3', { text: 'Einstellungen' }), featureCard(app, 'watch.time', null, { title: 'Schauzeit & Tageslimit' }))
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

