import { test } from 'node:test'
import assert from 'node:assert/strict'
import { watchDeadline, secondsLeft, isLoader } from '../src/behaviors/adWait.js'

const loader = (proto) => Object.assign(Object.create(proto), { loader: {}, policy: {}, audioTrack: {}, videoTrack: {} })

test('Frist des Laders wird gemeldet und bleibt unverändert', () => {
  const proto = {}
  const seen = []
  const off = watchDeadline(proto, (d) => seen.push(d))
  const l = loader(proto)
  l.D = 17000
  assert.equal(l.D, 17000)
  l.D = undefined
  assert.equal(l.D, undefined)
  l.D = 5000
  assert.equal(l.D, 5000)
  assert.deepEqual(seen, [17000, 5000])
  off()
})

test('Andere Objekte behalten ihr Feld', () => {
  const proto = {}
  const off = watchDeadline(proto, () => assert.fail('kein Lader'))
  const o = Object.create(proto)
  o.D = 99999
  assert.deepEqual(Object.getOwnPropertyDescriptor(o, 'D'), { value: 99999, writable: true, enumerable: true, configurable: true })
  const frozen = Object.freeze(Object.create(proto))
  assert.doesNotThrow(() => { frozen.D = 1 })
  off()
  assert.equal('D' in proto, false)
})

test('Restzeit und Lader-Erkennung', () => {
  assert.equal(secondsLeft(16000, 1000), 15)
  assert.equal(secondsLeft(1500, 1000), 1)
  assert.equal(secondsLeft(500, 1000), 0)
  assert.equal(isLoader({ loader: 1, policy: 1, audioTrack: {}, videoTrack: {} }), true)
  assert.equal(isLoader({ loader: 1, policy: 1, audioTrack: {} }), false)
  assert.equal(isLoader({ loader: 1, policy: 1 }), false)
})
