import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetForTests, createDeck, deleteDeck, duplicateDeck, getDeck, getImages,
  listDecks, putImage, renameDeck, saveDeck, updateDeckMeta,
} from '../../src/storage/db'

beforeEach(async () => {
  await _resetForTests()
  globalThis.indexedDB = new IDBFactory()
})

const png = (s: string) => new Blob([s], { type: 'image/png' })

describe('decks', () => {
  it('create then get round-trips the source', async () => {
    const d = await createDeck('# Hello')
    expect(d.revision).toBe(1)
    expect((await getDeck(d.id))?.source).toBe('# Hello')
    expect(await getDeck('nope')).toBeUndefined()
  })

  it('lists newest first using deckName', async () => {
    const a = await createDeck('# Alpha')
    await new Promise((r) => setTimeout(r, 5))
    const b = await createDeck('---\ntitle: Beta\n---\n\n# x')
    await new Promise((r) => setTimeout(r, 5))
    await saveDeck(a.id, '# Alpha2', 1)
    const list = await listDecks()
    expect(list.map((x) => x.name)).toEqual(['Alpha2', 'Beta'])
    expect(list[1]!.id).toBe(b.id)
  })

  it('saveDeck bumps revision, and rejects a stale revision', async () => {
    const d = await createDeck('# A')
    const r = await saveDeck(d.id, '# B', 1)
    expect(r).toEqual({ ok: true, revision: 2 })
    const stale = await saveDeck(d.id, '# C', 1)
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.current.source).toBe('# B')
    expect((await getDeck(d.id))?.source).toBe('# B')
  })

  it('two concurrent saves with the same revision: only one wins', async () => {
    const d = await createDeck('# A')
    const [x, y] = await Promise.all([saveDeck(d.id, '# X', 1), saveDeck(d.id, '# Y', 1)])
    expect([x.ok, y.ok].sort()).toEqual([false, true])
  })

  it('renameDeck writes the title and bumps the revision', async () => {
    const d = await createDeck('# A')
    const r = await renameDeck(d.id, 'Q3')
    expect(r.source).toContain('title: Q3')
    expect(r.revision).toBe(2)
    expect((await getDeck(d.id))?.source).toContain('title: Q3')
  })

  it('updateDeckMeta keeps revision and updatedAt', async () => {
    const d = await createDeck('# A')
    await updateDeckMeta(d.id, { lastSyncedSource: '# A', lastSyncedModified: 5 })
    const got = await getDeck(d.id)
    expect(got).toMatchObject({ revision: 1, updatedAt: d.updatedAt, lastSyncedModified: 5 })
  })

  it('duplicateDeck copies images, new id, no handles or sync fields', async () => {
    const d = await createDeck('# A', { lastSyncedSource: 's', lastSyncedModified: 1 })
    await putImage(d.id, 'a.png', png('one'))
    const c = await duplicateDeck(d.id)
    expect(c.id).not.toBe(d.id)
    expect(c.revision).toBe(1)
    expect(c.source).toBe('# A')
    expect('file' in c).toBe(false)
    expect('lastSyncedSource' in c).toBe(false)
    const imgs = await getImages(c.id)
    expect(await imgs.get('a.png')!.text()).toBe('one')
    expect(imgs.get('a.png')!.type).toBe('image/png')
  })

  it('deleteDeck removes the deck and its images only', async () => {
    const d = await createDeck('# A')
    const o = await createDeck('# O')
    await putImage(d.id, 'a.png', png('x'))
    await putImage(o.id, 'a.png', png('y'))
    await deleteDeck(d.id)
    expect(await getDeck(d.id)).toBeUndefined()
    expect((await getImages(d.id)).size).toBe(0)
    expect((await getImages(o.id)).size).toBe(1)
  })
})

describe('images', () => {
  it('normalizes paths to one key', async () => {
    const d = await createDeck('# A')
    await putImage(d.id, './img/a.png', png('first'))
    await putImage(d.id, 'img//a.png', png('second'))
    const imgs = await getImages(d.id)
    expect([...imgs.keys()]).toEqual(['img/a.png'])
    expect(await imgs.get('img/a.png')!.text()).toBe('second')
  })

  it('rejects .. segments and absolute paths', async () => {
    const d = await createDeck('# A')
    await expect(putImage(d.id, '../a.png', png('x'))).rejects.toThrow()
    await expect(putImage(d.id, 'a/../b.png', png('x'))).rejects.toThrow()
    await expect(putImage(d.id, '/a.png', png('x'))).rejects.toThrow()
  })
})
