import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from '../../src/storage/backup'
import { _resetForTests, createDeck, getDeck, getImages, listDecks, putImage } from '../../src/storage/db'

beforeEach(async () => {
  await _resetForTests()
  globalThis.indexedDB = new IDBFactory()
})

const bytesOf = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())]

describe('backup', () => {
  it('round-trips sources and images', async () => {
    const a = await createDeck('# Alpha')
    await putImage(a.id, 'img/dot.png', new Blob([new Uint8Array([0, 1, 2, 250, 255])], { type: 'image/png' }))
    await createDeck('# Beta')
    const blob = await exportBackup()
    const parsed = JSON.parse(await blob.text())
    expect(parsed.app).toBe('uslides')
    expect(parsed.version).toBe(1)
    expect(parsed.decks).toHaveLength(2)

    await _resetForTests()
    globalThis.indexedDB = new IDBFactory()
    expect(await importBackup(blob)).toBe(2)
    const names = (await listDecks()).map((d) => d.name).sort()
    expect(names).toEqual(['Alpha', 'Beta'])
    const restoredId = (await listDecks()).find((d) => d.name === 'Alpha')!.id
    expect((await getDeck(restoredId))?.source).toBe('# Alpha')
    const images = await getImages(restoredId)
    const img = images.get('img/dot.png')!
    expect(img.type).toBe('image/png')
    expect(await bytesOf(img)).toEqual([0, 1, 2, 250, 255])
  })

  it('adds to existing decks and never replaces any', async () => {
    const mine = await createDeck('# Mine')
    const blob = await exportBackup()
    expect(await importBackup(blob)).toBe(1)
    expect(await importBackup(blob)).toBe(1)
    const all = await listDecks()
    expect(all).toHaveLength(3)
    expect(all.some((d) => d.id === mine.id)).toBe(true)
    expect(new Set(all.map((d) => d.id)).size).toBe(3)
  })

  it('keeps the original dates', async () => {
    const a = await createDeck('# Dated')
    const blob = await exportBackup()
    await importBackup(blob)
    const copy = (await listDecks()).find((d) => d.id !== a.id)!
    expect((await getDeck(copy.id))?.createdAt).toBe(a.createdAt)
    expect(copy.updatedAt).toBe(a.updatedAt)
  })

  it.each([
    ['not json', 'nope'],
    ['wrong app', JSON.stringify({ app: 'other', version: 1, decks: [] })],
    ['wrong version', JSON.stringify({ app: 'uslides', version: 2, decks: [] })],
    ['no decks array', JSON.stringify({ app: 'uslides', version: 1 })],
    ['null', 'null'],
  ])('rejects a bad file: %s', async (_name, text) => {
    await expect(importBackup(new Blob([text]))).rejects.toThrow('This is not a uslides backup')
    expect(await listDecks()).toHaveLength(0)
  })
})

describe('all or nothing', () => {
  const good = { source: '# Good', createdAt: 1, updatedAt: 2, images: [] as unknown[] }
  const file = (...decks: unknown[]) => new Blob([JSON.stringify({ app: 'uslides', version: 1, decks })])
  const image = (over: Record<string, string>) => ({ path: 'a.png', type: 'image/png', base64: 'AAEC', ...over })

  it.each([
    ['bad base64', { ...good, source: '# Bad', images: [image({ base64: '***not base64***' })] }],
    ['bad path', { ...good, source: '# Bad', images: [image({ path: '../x.png' })] }],
    ['disallowed image type', { ...good, source: '# Bad', images: [image({ type: 'text/html' })] }],
  ])('a deck with %s as the second deck adds nothing', async (_n, bad) => {
    await createDeck('# Existing')
    await expect(importBackup(file(good, bad))).rejects.toThrow(/^This backup file is damaged: /)
    expect(await listDecks()).toHaveLength(1)
  })

  it('a second deck of the wrong shape adds nothing', async () => {
    await expect(importBackup(file(good, { source: 5 }))).rejects.toThrow(/^This backup file is damaged: /)
    expect(await listDecks()).toHaveLength(0)
  })

  it('refuses a file over 200 MB', async () => {
    const big = { size: 200 * 1024 * 1024 + 1, text: async () => '' } as unknown as Blob
    await expect(importBackup(big)).rejects.toThrow('This backup file is too large to restore (over 200 MB).')
  })
})
