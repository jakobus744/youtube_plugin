import { music } from './runtime.js'
import { checkReleases, releaseCheckRunning } from './engine.js'
import { toast } from '../ui.js'

// prueft im hintergrund selten und gedrosselt ob favoriten neues veroeffentlicht haben

export const releasesFeature = {
  id: 'm.releases',
  site: 'music',
  label: 'Neue Songs deiner Künstler',
  group: 'Entdecken',
  description: 'Schaut höchstens einmal pro Intervall auf die Künstlerseiten deiner Favoriten und meistgehörten Künstler. Neues erscheint im Mix-Fenster unter „Neu“ und als Zahl am Mix-Button',
  stability: 'mittel',
  settings: {
    notify: { type: 'toggle', label: 'Hinweis bei neuen Veröffentlichungen', default: true }
  },
  setup(ctx) {
    let s = ctx.settings
    let last = null
    let timer = null
    let stopped = false

    const run = async (force = false) => {
      const p = music.prefs()
      if (!p.releases.enabled && !force) return null
      if (releaseCheckRunning()) return null
      try {
        const res = await checkReleases({ force })
        last = res
        if (res.fresh && s.notify) toast(`${res.fresh} neue Veröffentlichung${res.fresh === 1 ? '' : 'en'} deiner Künstler`)
        return res
      } catch (e) {
        ctx.log.warn('music releases', e)
        last = { at: Date.now(), error: e.message }
        return last
      }
    }

    // erst wenn die seite ruhig ist, danach stuendlich pruefen ob faellig
    const first = setTimeout(() => !stopped && run(false), 25 * 1000)
    timer = setInterval(() => !stopped && !document.hidden && run(false), 60 * 60 * 1000)
    music.getMeta('lastReleaseCheck').then((v) => (last ||= v)).catch(() => {})

    return {
      run,
      get last() {
        return last
      },
      update(next) {
        s = next
      },
      dispose() {
        stopped = true
        clearTimeout(first)
        clearInterval(timer)
      },
      health() {
        const p = music.prefs()
        if (!p.releases.enabled) return { status: 'skip', detail: 'Hintergrundprüfung im Tab „Musik“ ausgeschaltet' }
        if (releaseCheckRunning()) return { status: 'ok', detail: 'prüft gerade …' }
        if (!last) return { status: 'skip', detail: 'noch nicht geprüft (startet ~25 s nach dem Laden)' }
        if (last.error) return { status: 'warn', detail: last.error }
        const when = new Date(last.at).toLocaleString('de-DE')
        return { status: last.errors?.length ? 'warn' : 'ok', detail: `zuletzt ${when} · ${last.checked}/${last.artists} Künstler geprüft · ${last.fresh} neu${last.errors?.length ? ` · Fehler: ${last.errors.slice(0, 2).join('; ')}` : ''}` }
      }
    }
  }
}
