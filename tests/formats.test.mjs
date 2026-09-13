import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseJson3, cleanSegments, toParagraphs, render, stats } from '../src/features/transcript/formats.js'

const manual = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: '[Music]' }] },
    { tStartMs: 4220, dDurationMs: 1180, segs: [{ utf8: 'This is a 3.' }] },
    { tStartMs: 6060, dDurationMs: 4653, segs: [{ utf8: "It's sloppily written," }] },
    { tStartMs: 10713, dDurationMs: 3007, segs: [{ utf8: 'but your brain\nhas no trouble.' }] },
    { tStartMs: 20000, dDurationMs: 2000, segs: [{ utf8: '>> Second speaker here.' }] },
    { tStartMs: 70000, dDurationMs: 2000, segs: [{ utf8: 'Chapter two starts.' }] }
  ]
}

// automatische spuren haben wort segmente, fensterevents ohne segs und zeilenumbrueche
const asr = {
  events: [
    { tStartMs: 0, dDurationMs: 100000, id: 1, wpWinPosId: 1 },
    { tStartMs: 4400, dDurationMs: 4159, wWinId: 1, segs: [{ utf8: 'This' }, { utf8: ' is', tOffsetMs: 399 }, { utf8: ' a three.' }] },
    { tStartMs: 4390, aAppend: 1, wWinId: 1, segs: [{ utf8: '\n' }] },
    { tStartMs: 6000, dDurationMs: 4000, wWinId: 1, segs: [{ utf8: 'It is' }, { utf8: ' sloppy' }] }
  ]
}

const meta = { videoId: 'abc123', title: 'Test Video', author: 'Kanal', channelUrl: 'https://www.youtube.com/channel/UC1', publishDate: '2017-10-05T08:11:25-07:00', durationSec: 1120, trackLabel: 'Englisch' }

test('parseJson3 ignoriert leere events und kappt ueberlappungen', () => {
  const segs = parseJson3(asr)
  assert.equal(segs.length, 2)
  assert.equal(segs[0].text, 'This is a three.')
  assert.ok(segs[0].endMs <= segs[1].startMs)
})

test('cleanSegments entfernt tags und erkennt sprecher', () => {
  const segs = cleanSegments(parseJson3(manual), { stripTags: true, speakerHeuristic: true })
  assert.equal(segs[0].text, 'This is a 3.')
  assert.equal(segs.find((s) => s.speaker).text, 'Second speaker here.')
  assert.ok(!segs.some((s) => s.text.includes('[Music]')))
})

test('absaetze nach pausen und kapiteln', () => {
  const segs = cleanSegments(parseJson3(manual), {})
  const byPause = toParagraphs(segs, { mode: 'pause', pauseMs: 3000 })
  assert.ok(byPause.length >= 3)
  const byChapter = toParagraphs(segs, { mode: 'chapters', pauseMs: 99999, chapters: [{ title: 'Intro', startSec: 0 }, { title: 'Teil 2', startSec: 60 }] })
  assert.deepEqual(byChapter.filter((p) => p.title).map((p) => p.title), ['Intro', 'Teil 2'])
  const none = toParagraphs(segs, { mode: 'none' })
  assert.equal(none.filter((p) => !p.segs.some((s) => s.speaker)).length >= 1, true)
})

test('markdown hat kopf, kapitel und zeitlinks', () => {
  const segs = cleanSegments(parseJson3(manual), {})
  const paras = toParagraphs(segs, { mode: 'chapters', chapters: [{ title: 'Intro', startSec: 0 }, { title: 'Teil 2', startSec: 60 }] })
  const md = render('markdown', { meta, segs, paras }, { header: true, timestampEvery: 'paragraph' })
  assert.match(md, /^# Test Video/)
  assert.match(md, /- \*\*Kanal:\*\* \[Kanal\]\(https:\/\/www\.youtube\.com\/channel\/UC1\)/)
  assert.match(md, /## \[Teil 2\]\(https:\/\/www\.youtube\.com\/watch\?v=abc123&t=70s\)/)
  assert.match(md, /\[00:04\]\(https:\/\/www\.youtube\.com\/watch\?v=abc123&t=4s\) This is a 3\./)
})

test('plain ohne zeitstempel und ohne kopf', () => {
  const segs = cleanSegments(parseJson3(manual), {})
  const paras = toParagraphs(segs, { mode: 'pause', pauseMs: 3000 })
  const txt = render('plain', { meta, segs, paras }, { header: false })
  assert.ok(!/\[\d\d:\d\d\]/.test(txt))
  assert.match(txt, /This is a 3\. It's sloppily written, but your brain has no trouble\./)
})

test('timestamps pro segment', () => {
  const segs = cleanSegments(parseJson3(manual), {})
  const paras = toParagraphs(segs, { mode: 'none' })
  const txt = render('timestamps', { meta, segs, paras }, { header: false, timestampEvery: 'segment' })
  assert.match(txt, /^\[00:04\] This is a 3\.$/m)
  assert.match(txt, /^\[01:10\] Chapter two starts\.$/m)
})

test('srt und vtt zeiten', () => {
  const segs = cleanSegments(parseJson3(manual), {})
  const srt = render('srt', { meta, segs, paras: [] })
  assert.match(srt, /^1\n00:00:04,220 --> 00:00:05,400\nThis is a 3\./)
  const vtt = render('vtt', { meta, segs, paras: [] })
  assert.match(vtt, /^WEBVTT\n\n00:00:04\.220 --> 00:00:05\.400/)
})

test('stats zaehlt woerter', () => {
  const s = stats([{ text: 'eins zwei drei' }, { text: 'vier' }])
  assert.equal(s.words, 4)
  assert.equal(s.readingMin, 1)
})
