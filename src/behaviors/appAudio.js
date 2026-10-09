// nur in der ytx-app: was passiert, wenn eine andere app ton abspielt
export const audioFocus = {
  id: 'appAudioFocus',
  label: 'Wenn eine andere App Ton abspielt (App)',
  description: 'Weiterspielen: ytx läuft weiter, bis du selbst stoppst. Pausieren: wie bei normalen Musik-Apps, eine andere Wiedergabe (Spotify, Anruf, Sprachnachricht) pausiert ytx, nach kurzen Unterbrechungen geht es weiter',
  type: 'select',
  options: [
    ['', 'Weiterspielen, bis ich stoppe'],
    ['pause', 'Pausieren, wenn etwas anderes spielt']
  ],
  default: '',
  start(ctx, mode) {
    window.__ytxNative?.({ a: mode === 'pause' ? 'af1' : 'af0' })
    return () => window.__ytxNative?.({ a: 'af0' })
  }
}
