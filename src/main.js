import pkg from '../package.json'
import { pageWindow } from './core/bridge.js'
import { disposeAll, onDispose } from './core/lifecycle.js'
import { log } from './core/log.js'
import { initNav, nav, checkNav } from './core/nav.js'
import { store } from './core/store.js'
import { setCss, removeCss, ensureCss } from './core/css.js'
import { onSweep, requestSweep, startObserver, sweepNow } from './core/observer.js'
import { mount } from './core/mount.js'
import { copyText } from './core/clipboard.js'
import { registerCheck, runChecks } from './core/diagnose.js'
import { initHotkeys, registerAction, setBindings } from './core/hotkeys.js'
import { whenBody } from './core/dom.js'
import { initDisplay, applyDisplay } from './appliers/display.js'
import { applyVars } from './appliers/vars.js'
import { initLayout, applyLayout } from './appliers/layout.js'
import { initBehavior, applyBehavior } from './appliers/behavior.js'
import { initTagger } from './appliers/tagger.js'
import { initFilters, applyFilters } from './appliers/filters.js'
import { initFeatures, applyFeatures, featureInstance } from './appliers/features.js'
import { site } from './sites/index.js'
import { initUiCss, initMenuDismiss, toast } from './features/ui.js'
import { createPanel, mastheadButton } from './panel/index.js'
import { registerCoreChecks } from './panel/tabs.js'

const VERSION = pkg.version

function boot() {
  // dev neu injizieren ersetzt die alte instanz sauber
  if (pageWindow.__ytx?.destroy) pageWindow.__ytx.destroy()

  const api = {
    version: VERSION,
    site: site.id,
    debug: site.debug,
    store,
    nav,
    panel: null,
    sweep: sweepNow,
    feature: featureInstance,
    log: () => log.entries(),
    diagnose: () => runChecks(),
    destroy() {
      disposeAll()
      if (pageWindow.__ytx === api) delete pageWindow.__ytx
    }
  }
  pageWindow.__ytx = api

  initNav()
  site.boot?.()
  store.init()
  const cfg = store.config

  // alles was flackern koennte zuerst und synchron
  initDisplay()
  applyDisplay(cfg)
  applyVars(cfg)
  initLayout(() => store.config)
  applyLayout(cfg)
  initUiCss()

  let sweepIds = 0
  const sweepHook = (fn) => onSweep(`hook${++sweepIds}`, fn)

  initBehavior({ nav, state: store.state, onSweep: sweepHook })
  applyBehavior(cfg)

  initTagger()
  if (site.filters) {
    initFilters()
    applyFilters(cfg)
  }

  initFeatures(site.features, (m, settings) => {
    const cleanups = []
    return {
      settings,
      nav,
      mount,
      copyText,
      log,
      state: store.state,
      onSweep: (fn) => {
        const off = sweepHook(fn)
        cleanups.push(off)
        return off
      },
      css: (text) => (text ? setCss(`feature.${m.id}`, text) : removeCss(`feature.${m.id}`)),
      action: (id, fn) => {
        const hk = (m.hotkeys || []).find((x) => x[0] === id)
        cleanups.push(registerAction(id, hk?.[1] || id, fn, hk?.[2] || ''))
      },
      cleanup: () => {
        for (const fn of cleanups.splice(0)) fn()
        removeCss(`feature.${m.id}`)
      }
    }
  })
  applyFeatures(cfg)

  store.subscribe((c, reason) => {
    if (reason === 'settings' || reason.startsWith('bucket:')) {
      setBindings(store.settings.hotkeys)
      requestSweep()
      return
    }
    applyDisplay(c)
    applyVars(c)
    applyLayout(c)
    applyBehavior(c)
    if (site.filters) applyFilters(c)
    applyFeatures(c)
    requestSweep()
  })

  initHotkeys()
  setBindings(store.settings.hotkeys)
  initMenuDismiss()
  onSweep('css', ensureCss)
  onSweep('nav', checkNav)

  const app = {
    version: VERSION,
    store,
    nav,
    site,
    features: site.features,
    ui: {},
    log,
    mount,
    copyText,
    applyHotkeys: () => setBindings(store.settings.hotkeys),
    rerender: () => {},
    flash: () => {}
  }
  registerCoreChecks(registerCheck, app)
  startObserver()

  whenBody(() => {
    const panel = createPanel(app)
    api.panel = panel
    const btn = mastheadButton(app, panel)
    onDispose(() => btn.destroy())
    registerAction('panel.toggle', 'ytx-Panel öffnen/schließen', () => panel.toggle(), 'Alt+Y')
    registerAction('profile.cycle', 'Nächstes Profil', () => toast(`Profil: ${store.cycleProfile()}`), 'Alt+P')
    sweepNow()
  })

  log.info(`ytx ${VERSION} gestartet auf ${site.label} · ${nav.page}`)
}

try {
  if (window.top === window.self) boot()
} catch (e) {
  console.error('[ytx] start fehlgeschlagen', e)
}
