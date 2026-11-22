import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractFeedback } from '../src/behaviors/notInterested.js'

const item = (img, token, undo) => ({ listItemViewModel: { title: { content: 'x' }, leadingImage: { sources: [{ clientResource: { imageName: img } }] }, rendererContext: { commandContext: { onTap: { innertubeCommand: { feedbackEndpoint: { feedbackToken: token, actions: [{ replaceEnclosingAction: { item: { b: { command: { undoFeedbackEndpoint: { undoToken: undo } } } } } }] } } } } } } })
const sheet = (items) => ({ menuButton: { buttonViewModel: { onTap: { innertubeCommand: { showSheetCommand: { panelLoadingStrategy: { inlineContent: { sheetViewModel: { content: { listViewModel: { listItems: items } } } } } } } } } } })

test('Schlüssel je Video, erkannt am Symbol', () => {
  const json = { contents: [
    { richItemRenderer: { content: { lockupViewModel: { contentId: 'aaaaaaaaaaa', metadata: sheet([item('ADD_TO_WATCH_LATER', 'w', null), item('HIDE', 't1', 'u1'), item('REMOVE', 't2', 'u2')]) } } } },
    { shortsLockupViewModel: { onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'bbbbbbbbbbb' } } }, menuOnTap: sheet([item('HIDE', 't3', null)]) } }
  ] }
  const m = extractFeedback(json)
  assert.deepEqual(m.get('aaaaaaaaaaa'), { hide: { token: 't1', undo: 'u1' }, channel: { token: 't2', undo: 'u2' } })
  assert.deepEqual(m.get('bbbbbbbbbbb'), { hide: { token: 't3', undo: null } })
  assert.equal(m.size, 2)
})
