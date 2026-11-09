import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { importFiles } from '../../src/files/importFiles'
import { _resetForTests, getDeck } from '../../src/storage/db'

beforeEach(async () => {
  await _resetForTests()
  globalThis.indexedDB = new IDBFactory()
})

describe('importFiles privacy', () => {
  it('a Markdown file makes a blocked deck', async () => {
    const id = await importFiles([new File(['# Imported'], 'talk.md', { type: 'text/markdown' })])
    expect((await getDeck(id))?.privacy).toBe('blocked')
  })
})
