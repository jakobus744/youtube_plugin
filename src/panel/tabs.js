import { h } from '../core/dom.js'
import { MODE_LABELS } from '../registry/shared.js'
import { site } from '../sites/index.js'
import { templateById } from '../profiles/index.js'
import { countMatches } from '../appliers/display.js'
import { filterStats } from '../appliers/filters.js'
import { compileRules } from '../appliers/filterLogic.js'
import { runChecks, summarize, reportText } from '../core/diagnose.js'
import { listActions, keyFor, comboFromEvent } from '../core/hotkeys.js'
import { capabilities } from '../core/bridge.js'
import { mountStatus, getAnchorStatus } from '../core/mount.js'
import { sweepStats } from '../core/observer.js'
import { cssStats } from '../core/css.js'
import { log } from '../core/log.js'
import { row, badge, segmented, toggle, select, range, color, number, lines, textarea, chips, btn, settingControl } from './controls.js'

const PAGE_LABEL = site.PAGE_LABELS

// ---------- anzeige ----------

export function displayTab(app) {
  const cfg = app.store.config
  const root = h('div')
  const search = h('input', { type: 'search', placeholder: 'Suchen …', value: app.ui.displaySearch || '' })
  const onlyPage = toggle(app.ui.displayOnlyPage ?? false, (v) => {
    app.ui.displayOnlyPage = v
    render()
  })
  const list = h('div')
  root.append(
    h('div', { class: 'row', style: { borderTop: 0 } }, search),
    row(`Nur Relevantes für ${PAGE_LABEL[app.nav.page] || app.nav.page}`, onlyPage, { note: 'Zahlen zeigen Treffer auf der aktuellen Seite' }),
    list
  )
  search.addEventListener('input', () => {
    app.ui.displaySearch = search.value
    render()
  })

  function render() {
    list.replaceChildren()
    const q = search.value.trim().toLowerCase()
    for (const group of site.GROUPS) {
      const items = site.targets.filter((t) => t.group === group).filter((t) => !q || `${t.label} ${t.id} ${t.note || ''}`.toLowerCase().includes(q)).filter((t) => !app.ui.displayOnlyPage || !t.pages || t.pages.includes(app.nav.page))
      if (!items.length) continue
      const active = items.filter((t) => cfg.display[t.id]).length
      const det = h('details', { open: q || app.ui.openGroups?.has(group) }, h('summary', null, group, h('span', { class: 'count', text: active ? `${active} aktiv` : '' })))
      det.addEventListener('toggle', () => {
        app.ui.openGroups ||= new Set()
        if (det.open) app.ui.openGroups.add(group)
        else app.ui.openGroups.delete(group)
      })
      const body = h('div', { class: 'body' })
      for (const t of items) {
        const relevant = !t.pages || t.pages.includes(app.nav.page)
        const hits = relevant ? countMatches(t.id) : null
        const badges = []
        if (t.radical) badges.push(badge('radikal', 'radical'))
        if (hits !== null) badges.push(badge(String(hits), `hits ${hits ? '' : 'zero'}`))
        const seg = segmented(
          t.modes.map((m) => [m, MODE_LABELS[m]]),
          cfg.display[t.id] || 'show',
          (mode) => app.store.update((c) => {
            if (mode === 'show') delete c.display[t.id]
            else c.display[t.id] = mode
          }, 'panel')
        )
        body.append(row(t.label, seg, { note: t.note, badges }))
      }
      det.append(body)
      list.append(det)
    }
  }
  render()
  root.refreshCounts = render
  return root
}

// ---------- look ----------

export function lookTab(app) {
  const cfg = app.store.config
  const root = h('div')
  const update = (fn) => app.store.update(fn, 'panel')
  const { themes, colorControls, controls, LOOK_GROUPS } = site.look
  const theme = themes.find((t) => t.id === cfg.vars.theme) || themes[0]

  root.append(h('h3', { text: 'Theme' }))
  root.append(
    row('Farbschema', select(themes.map((t) => [t.id, t.label]), cfg.vars.theme, (v) => {
      update((c) => (c.vars.theme = v))
      app.rerender()
    }), { note: `Einzelne Farben unten überschreiben das Schema. Gedacht für den dunklen Modus von ${site.label}` })
  )
  const colorsBody = h('div')
  for (const c of colorControls) {
    colorsBody.append(row(c.label, color(cfg.vars[c.id], theme.values[c.id] || '#000000', (v) => update((x) => (v ? (x.vars[c.id] = v) : delete x.vars[c.id])))))
  }
  root.append(colorsBody)

  for (const group of LOOK_GROUPS.filter((g) => g !== 'Farben')) {
    const items = controls.filter((c) => c.group === group)
    if (!items.length) continue
    root.append(h('h3', { text: group }))
    for (const c of items) {
      let ctl
      const set = (v) => update((x) => (v === null || v === '' ? delete x.vars[c.id] : (x.vars[c.id] = v)))
      if (c.type === 'range') ctl = range(c, cfg.vars[c.id], set)
      else if (c.type === 'select') ctl = select(c.options, cfg.vars[c.id] ?? '', set)
      root.append(row(c.label, ctl))
    }
  }
  root.append(h('div', { class: 'btns' }, btn('Look komplett zurücksetzen', () => {
    update((c) => (c.vars = { theme: '' }))
    app.rerender()
  }, 'danger')))
  return root
}

// ---------- layout ----------

export function layoutTab(app) {
  const cfg = app.store.config
  const root = h('div')
  const update = (fn) => app.store.update(fn, 'panel')
  const { layoutPresets, LAYOUT_PAGES, orderGroups, topbarModes } = site.presets

  root.append(h('h3', { text: 'Presets pro Seite' }))
  for (const [page, label] of LAYOUT_PAGES) {
    const opts = [['', 'Standard'], ...layoutPresets.filter((p) => p.pages.includes(page)).map((p) => [p.id, p.label])]
    root.append(row(label, select(opts, cfg.layout.presets[page] || '', (v) => update((c) => (v ? (c.layout.presets[page] = v) : delete c.layout.presets[page])))))
  }

  root.append(h('h3', { text: 'Kopfzeile' }))
  root.append(row('Verhalten beim Scrollen', select(topbarModes, cfg.layout.topbar, (v) => update((c) => (c.layout.topbar = v)))))

  for (const [gid, g] of Object.entries(orderGroups)) {
    root.append(h('h3', { text: `Reihenfolge: ${g.label}` }))
    const current = cfg.layout.order[gid] || []
    const enabled = current.length > 0
    let list = enabled ? current.slice() : g.items.map(([id]) => id)
    const labels = Object.fromEntries(g.items)
    for (const [id] of g.items) if (!list.includes(id)) list.push(id)
    const box = h('div', { class: 'orderlist' })
    const save = () => update((c) => (c.layout.order[gid] = list.slice()))
    const draw = () => {
      box.replaceChildren()
      list.forEach((id, i) => {
        const up = btn('↑', () => {
          if (i === 0) return
          ;[list[i - 1], list[i]] = [list[i], list[i - 1]]
          save()
          draw()
        }, 'tiny')
        const down = btn('↓', () => {
          if (i === list.length - 1) return
          ;[list[i + 1], list[i]] = [list[i], list[i + 1]]
          save()
          draw()
        }, 'tiny')
        box.append(h('div', { class: 'item' }, h('span', { text: labels[id] || id }), up, down))
      })
    }
    draw()
    root.append(
      row('Eigene Reihenfolge', toggle(enabled, (v) => {
        update((c) => (v ? (c.layout.order[gid] = list.slice()) : delete c.layout.order[gid]))
        app.rerender()
      }), { note: 'Buttons, die YouTube ins ⋯-Menü schiebt, erscheinen nicht' }),
      enabled ? box : h('div')
    )
  }

  if (site.id !== 'youtube') return root
  root.append(h('h3', { text: 'Freie Zonen' }))
  root.append(h('p', { class: 'hint', text: 'Nicht umgesetzt: Freies Umhängen von Bereichen per display: contents stört YouTubes JavaScript-Playergröße und das automatische Umsortieren bei schmalen Fenstern. Stattdessen gibt es die festen Presets „Kino“ und „Fokus“ für die Videoseite.' }))
  return root
}

// ---------- verhalten ----------

export function behaviorTab(app) {
  const cfg = app.store.config
  const root = h('div')
  const update = (fn) => app.store.update(fn, 'panel')
  for (const b of site.behaviors) {
    const value = cfg.behavior[b.id] ?? b.default
    const set = (v) => update((c) => (c.behavior[b.id] = v))
    const badges = b.radical ? [badge('radikal', 'radical')] : []
    if (b.type === 'toggle') root.append(row(b.label, toggle(value, set), { note: b.description, badges }))
    else if (b.type === 'select') root.append(row(b.label, select(b.options, value, set), { note: b.description, badges }))
    else if (b.type === 'textarea') root.append(row(b.label, textarea(value, set, 'kevlar_example_flag=true'), { note: b.description, badges, stack: true }))
  }
  return root
}

// ---------- filter ----------

export function filterTab(app) {
  const cfg = app.store.config
  const f = cfg.filters
  const root = h('div')
  const update = (fn) => app.store.update(fn, 'panel')

  root.append(
    row('Filter aktiv', toggle(f.enabled, (v) => update((c) => (c.filters.enabled = v)))),
    row('Darstellung', segmented([['dim', 'Dimmen'], ['collapse', 'Einklappen'], ['hide', 'Aus']], f.mode, (v) => update((c) => (c.filters.mode = v))), { note: 'Tipp: neue Regeln erst dimmen, dann ausblenden' }),
    row('Seiten', chips(site.filters.pages, f.pages, (v) => update((c) => (c.filters.pages = v))), { stack: true })
  )
  const onPage = f.enabled && f.pages.includes(app.nav.page)
  const reasons = Object.entries(filterStats.reasons).map(([k, v]) => `${k}: ${v}`).join(', ')
  root.append(h('p', { class: 'hint', text: onPage ? `Diese Seite: ${filterStats.checked} Kacheln geprüft, ${filterStats.hits} gefiltert${reasons ? ` (${reasons})` : ''}` : 'Auf dieser Seite nicht aktiv' }))

  root.append(h('h3', { text: 'Typen' }))
  root.append(
    row('Shorts', toggle(f.shorts, (v) => update((c) => (c.filters.shorts = v)))),
    row('Livestreams', toggle(f.live, (v) => update((c) => (c.filters.live = v))))
  )

  root.append(h('h3', { text: 'Kanäle' }))
  root.append(
    row('Blockieren', lines(f.channels.block, (v) => update((c) => (c.filters.channels.block = v)), '@handle\nUCxxxxxxxxxxxxxxxxxxxxxx\nKanalname'), { stack: true, note: 'Eine Zeile pro Kanal: @handle, Kanal-ID oder exakter Name' }),
    row('Nur diese erlauben', lines(f.channels.allowOnly, (v) => update((c) => (c.filters.channels.allowOnly = v)), 'leer = aus'), { stack: true, note: 'Positivliste: alles andere wird gefiltert' })
  )

  root.append(h('h3', { text: 'Titel' }))
  const regexErr = h('div', { class: 'err' })
  const showErr = (list) => {
    const errs = compileRules({ ...f, title: { ...f.title, regex: list } }).errors
    regexErr.textContent = errs.join(' · ')
  }
  root.append(
    row('Stichwörter', lines(f.title.keywords, (v) => update((c) => (c.filters.title.keywords = v)), 'reaction\ngone wrong'), { stack: true, note: 'Enthält-Suche, eine Zeile pro Stichwort' }),
    row('Reguläre Ausdrücke', h('div', null, lines(f.title.regex, (v) => {
      showErr(v)
      update((c) => (c.filters.title.regex = v))
    }, '^\\[?(SHOCKING|INSANE)'), regexErr), { stack: true }),
    row('Groß/klein beachten', toggle(f.title.caseSensitive, (v) => update((c) => (c.filters.title.caseSensitive = v))))
  )
  showErr(f.title.regex)

  root.append(h('h3', { text: 'Dauer, Alter, Gesehen' }))
  root.append(
    row('Kürzer als (Sekunden)', number(f.duration.minSec, (v) => update((c) => (c.filters.duration.minSec = v)), { min: 0, placeholder: 'aus' }), { note: '61 filtert alles bis 1 Minute' }),
    row('Länger als (Minuten)', number(f.duration.maxSec != null ? f.duration.maxSec / 60 : null, (v) => update((c) => (c.filters.duration.maxSec = v == null ? null : v * 60)), { min: 0, placeholder: 'aus' })),
    row('Älter als (Tage)', number(f.age.maxDays, (v) => update((c) => (c.filters.age.maxDays = v)), { min: 0, placeholder: 'aus' }), { note: 'Liest „vor 3 Jahren“ – nur Deutsch und Englisch' }),
    row('Gesehene filtern', toggle(f.watched.hide, (v) => update((c) => (c.filters.watched.hide = v))), { note: 'Braucht Anmeldung' }),
    row('Gilt als gesehen ab %', number(f.watched.minPercent, (v) => update((c) => (c.filters.watched.minPercent = v ?? 90)), { min: 1, max: 100 }))
  )
  return root
}

// ---------- features ----------

export function featuresTab(app) {
  const cfg = app.store.config
  const root = h('div')
  const results = runChecks().filter((r) => r.id.startsWith('feature.'))
  for (const m of app.features) {
    const st = cfg.features[m.id]
    const health = results.find((r) => r.id === `feature.${m.id}`)
    const settings = h('div', { class: 'settings' })
    const draw = () => {
      settings.replaceChildren()
      if (!app.store.config.features[m.id].enabled) return
      for (const [key, def] of Object.entries(m.settings || {})) {
        const value = app.store.config.features[m.id][key]
        settings.append(row(def.label, settingControl(def, value, (v) => app.store.update((c) => (c.features[m.id][key] = v), 'panel')), { stack: def.type === 'multi' }))
      }
    }
    const head = h(
      'div',
      { class: 'head' },
      health ? h('span', { class: `dot ${health.status}`, title: health.detail }) : h('span', { class: 'dot' }),
      h('span', { class: 'title', text: m.label }),
      badge(m.stability),
      toggle(st.enabled, (v) => {
        app.store.update((c) => (c.features[m.id].enabled = v), 'panel')
        draw()
      })
    )
    const card = h('div', { class: 'card' }, head, h('div', { class: 'desc' }, m.description, health && h('div', { class: 'hint', text: health.detail })), settings)
    draw()
    root.append(card)
  }
  return root
}

// ---------- profile & tasten ----------

export function profilesTab(app) {
  const root = h('div', { class: 'profiles' })
  const st = app.store
  root.append(h('h3', { text: 'Profile' }))
  for (const p of st.profiles()) {
    const t = templateById[p.template]
    const actions = h(
      'div',
      { class: 'btns', style: { margin: 0 } },
      p.active ? badge('aktiv') : btn('Aktivieren', () => st.setActive(p.id), 'tiny primary'),
      btn('Umbenennen', () => {
        const input = h('input', { type: 'text', value: p.name })
        const r = rowEl.querySelector('.label b')
        r.replaceWith(input)
        input.focus()
        input.select()
        const done = () => {
          st.renameProfile(p.id, input.value)
          app.rerender()
        }
        input.addEventListener('keydown', (e) => e.key === 'Enter' && done())
        input.addEventListener('blur', done)
      }, 'tiny'),
      t && btn('Zurücksetzen', () => confirmInline(actions, `${site.label}-Teil des Profils auf die Vorlage zurücksetzen?`, () => st.resetProfile(p.id)), 'tiny'),
      btn('Löschen', () => confirmInline(actions, `„${p.name}“ löschen?`, () => {
        if (!st.deleteProfile(p.id)) app.flash('Das letzte Profil kann nicht gelöscht werden')
        app.rerender()
      }), 'tiny danger')
    )
    const rowEl = row(h('b', { text: p.name }), actions, { note: t?.description, stack: true })
    root.append(rowEl)
  }
  const nameInput = h('input', { type: 'text', placeholder: 'Name für neues Profil' })
  root.append(
    h('div', { class: 'row', style: { gap: '6px' } }, nameInput, btn('Kopie des aktiven anlegen', () => {
      st.createProfile(nameInput.value || `${st.data.profiles[st.activeId].name} Kopie`)
      app.rerender()
    }))
  )

  root.append(h('h3', { text: 'Tastenkürzel' }))
  for (const a of listActions()) {
    const b = btn(keyFor(a.id) || '—', () => {
      b.textContent = 'Taste drücken …'
      b.classList.add('rec')
      const onKey = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const combo = comboFromEvent(e)
        if (['Ctrl', 'Alt', 'Shift', 'Meta'].includes(combo)) return
        window.removeEventListener('keydown', onKey, true)
        b.classList.remove('rec')
        const value = e.key === 'Escape' ? '' : e.key === 'Backspace' ? '' : combo
        st.updateSettings((s) => {
          s.hotkeys ||= {}
          s.hotkeys[a.id] = value
        })
        app.applyHotkeys()
        b.textContent = value || '—'
      }
      window.addEventListener('keydown', onKey, true)
    }, 'kbd')
    root.append(row(a.label, b, { note: a.id === 'panel.toggle' ? 'Esc/Backspace entfernt ein Kürzel' : undefined }))
  }
  root.append(row('ytx-Button in der Kopfzeile', toggle(st.settings.panelButton !== false, (v) => st.updateSettings((s) => (s.panelButton = v)))))

  root.append(h('h3', { text: 'Export / Import' }))
  const out = h('textarea', { readonly: true, style: { minHeight: '90px' } })
  let all = false
  const fill = () => (out.value = st.exportJson(all))
  fill()
  const inp = h('textarea', { placeholder: 'JSON hier einfügen', style: { minHeight: '70px' } })
  root.append(
    row('Alle Profile exportieren', toggle(false, (v) => {
      all = v
      fill()
    })),
    out,
    h('div', { class: 'btns' }, btn('Export kopieren', async () => app.flash((await app.copyText(out.value)) ? 'Kopiert' : 'Kopieren fehlgeschlagen'))),
    inp,
    h('div', { class: 'btns' },
      btn('Importieren', () => {
        try {
          app.flash(st.importJson(inp.value))
          app.rerender()
        } catch (e) {
          app.flash(`Import fehlgeschlagen: ${e.message}`)
        }
      }, 'primary'),
      btn('Alles zurücksetzen', () => confirmInline(root.lastChild, 'Alle Profile und Einstellungen löschen?', () => {
        st.resetAll()
        app.rerender()
      }), 'danger')
    )
  )
  return root
}

function confirmInline(container, text, yes) {
  const box = h('div', { class: 'btns', style: { width: '100%' } }, h('span', { class: 'muted', text }), btn('Ja', () => {
    box.remove()
    yes()
  }, 'tiny danger'), btn('Nein', () => box.remove(), 'tiny'))
  container.after(box)
}

// ---------- diagnose ----------

export function diagnoseTab(app) {
  const root = h('div')
  const body = h('div')
  let onlyProblems = app.ui.onlyProblems ?? true
  const draw = () => {
    body.replaceChildren()
    const results = runChecks()
    const sum = summarize(results)
    body.append(h('div', { class: 'summary' }, ...['ok', 'warn', 'fail', 'skip'].map((k) => h('span', null, h('span', { class: `dot ${k}`, style: { display: 'inline-block', marginRight: '4px' } }), h('b', { text: String(sum[k] || 0) }), { ok: 'ok', warn: 'Warnung', fail: 'Fehler', skip: 'n/a' }[k]))))
    let group = null
    let box = null
    for (const r of results) {
      if (onlyProblems && (r.status === 'ok' || r.status === 'skip')) continue
      if (r.group !== group) {
        group = r.group
        box = h('div')
        body.append(h('h3', { text: group }), box)
      }
      box.append(h('div', { class: 'status' }, h('span', { class: `dot ${r.status}` }), h('div', { class: 'txt' }, r.label, h('small', { text: r.detail }))))
    }
    if (onlyProblems && !sum.warn && !sum.fail) body.append(h('p', { class: 'muted', text: 'Keine Probleme auf dieser Seite.' }))
    const errs = log.entries().filter((e) => e.level !== 'info')
    if (errs.length) {
      body.append(h('h3', { text: 'Log' }), h('div', { class: 'log', text: errs.slice(-25).map((e) => `${new Date(e.t).toLocaleTimeString('de-DE')} ${e.level} ${e.msg}${e.n > 1 ? ` ×${e.n}` : ''}`).join('\n') }))
    }
  }
  const meta = () => ({ version: app.version, site: site.id, seite: app.nav.page, url: location.href, profil: app.store.activeId, ...capabilities(), sweeps: `${sweepStats.runs} (${sweepStats.lastMs} ms)`, css: JSON.stringify(cssStats()), events: Array.from(app.nav.eventsSeen).join(',') })
  root.append(
    h('div', { class: 'btns' },
      btn('Neu prüfen', draw, 'primary'),
      btn('Bericht kopieren', async () => app.flash((await app.copyText(reportText(runChecks(), meta()))) ? 'Bericht kopiert' : 'Kopieren fehlgeschlagen'))
    ),
    row('Nur Probleme zeigen', toggle(onlyProblems, (v) => {
      onlyProblems = app.ui.onlyProblems = v
      draw()
    })),
    body
  )
  draw()
  root.refreshCounts = draw
  return root
}

export function registerCoreChecks(registerCheck, app) {
  registerCheck('core', 'Grundlagen', 'Grundlagen', () => {
    const c = capabilities()
    return [
      { id: 'core.polymer', label: `Polymer-Daten lesbar (${site.appHost})`, status: c.appFound ? (c.polymerData ? 'ok' : 'fail') : 'skip', detail: c.polymerData ? 'ok' : 'Script läuft vermutlich in isolierter Welt – @sandbox / @inject-into prüfen' },
      { id: 'core.player', label: 'Player-API', status: document.querySelector('#movie_player') ? (c.playerApi ? 'ok' : 'fail') : 'skip', detail: c.playerApi ? 'getPlayerResponse verfügbar' : 'Kein Player auf dieser Seite' },
      { id: 'core.storage', label: 'Speicher', status: 'ok', detail: c.gmStorage ? 'GM_setValue' : 'localStorage (Fallback, pro Browser-Profil)' },
      { id: 'core.nav', label: 'Navigations-Events', status: app.nav.eventsSeen.size ? 'ok' : 'skip', detail: app.nav.eventsSeen.size ? Array.from(app.nav.eventsSeen).join(', ') : 'Noch keine yt-navigate Events gesehen (normal direkt nach dem Laden)' },
      { id: 'core.sweep', label: 'Observer', status: sweepStats.lastMs > 80 ? 'warn' : 'ok', detail: `${sweepStats.runs} Durchläufe · letzter ${sweepStats.lastMs} ms` }
    ]
  })
  registerCheck('anchors', 'Anker', 'Anker', () =>
    mountStatus().map((m) => {
      const a = [].concat(m.anchor).map((id) => getAnchorStatus().get(id)).find(Boolean)
      return { id: `mount.${m.id}`, label: `${m.id} → ${[].concat(m.anchor).join(' | ')}`, status: m.ok ? 'ok' : 'skip', detail: m.ok ? `eingefügt (${a?.sel || ''})` : 'nicht eingefügt (Anker fehlt oder auf dieser Seite nicht nötig)' }
    })
  )
}
