import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractHeatmap, heatmapPath } from '../src/behaviors/heatmap.js'

const marker = (t, v) => ({ heatMarkerRenderer: { timeRangeStartMillis: t, markerDurationMillis: 1000, heatMarkerIntensityScoreNormalized: v } })

test('Graph aus den Seitendaten', () => {
  const json = {
    currentVideoEndpoint: { watchEndpoint: { videoId: 'abcdefghijk' } },
    playerOverlays: { x: { markersMap: [{ key: 'HEATSEEKER', value: { heatmap: { heatmapRenderer: { heatMarkers: [marker(2000, 0.5), marker(0, 1), marker(1000, 2)] } } } }] } }
  }
  assert.deepEqual(extractHeatmap(json), { id: 'abcdefghijk', points: [1, 1, 0.5] })
})

test('Ohne Graph', () => {
  assert.equal(extractHeatmap({ a: [{ b: 1 }] }), null)
  assert.equal(extractHeatmap({ heatMarkers: [marker(0, 1)] }), null)
  assert.equal(extractHeatmap(null), null)
})

test('Pfad bleibt in der Fläche', () => {
  const d = heatmapPath([0, 1, 0.5], 100, 20)
  assert.ok(d.startsWith('M0,20 L0,18.8'))
  assert.ok(d.endsWith('L100,20 Z'))
  assert.ok(!/NaN|-\d/.test(d))
})

test('Flache Werte werden gestreckt', () => {
  const d = heatmapPath([0.6, 0.7, 0.65], 100, 20)
  assert.ok(d.startsWith('M0,20 L0,18.8'))
  assert.ok(d.includes(' 50.0,0.0 '))
})

test('Graph aus der Markerliste', () => {
  const json = { frameworkUpdates: { entityBatchUpdate: { mutations: [{ payload: { macroMarkersListEntity: { markersList: { markerType: 'MARKER_TYPE_HEATMAP', markers: [{ startMillis: '0', durationMillis: '1000', intensityScoreNormalized: 0.25 }, { startMillis: '1000', durationMillis: '1000', intensityScoreNormalized: 1 }] } } } }] } } }
  assert.deepEqual(extractHeatmap(json), { id: null, points: [0.25, 1] })
})
