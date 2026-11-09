import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissSafariNote, requestPersistence, shouldShowSafariNote } from '../../src/storage/persist'

const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function env(userAgent: string, standalone = false, store: Record<string, string> = {}, storageBroken = false) {
  vi.stubGlobal('navigator', { userAgent })
  vi.stubGlobal('matchMedia', () => ({ matches: standalone }))
  vi.stubGlobal(
    'localStorage',
    storageBroken
      ? new Proxy({}, { get() { throw new Error('blocked') } })
      : { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) },
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('shouldShowSafariNote', () => {
  it('is true in Safari, not installed, not dismissed', () => {
    env(SAFARI)
    expect(shouldShowSafariNote()).toBe(true)
  })
  it('is false in Chrome', () => {
    env(CHROME)
    expect(shouldShowSafariNote()).toBe(false)
  })
  it('is false when installed', () => {
    env(SAFARI, true)
    expect(shouldShowSafariNote()).toBe(false)
  })
  it('is false once dismissed', () => {
    env(SAFARI)
    dismissSafariNote()
    expect(shouldShowSafariNote()).toBe(false)
  })
  it('survives blocked storage', () => {
    env(SAFARI, false, {}, true)
    expect(() => dismissSafariNote()).not.toThrow()
    expect(shouldShowSafariNote()).toBe(true)
  })
})

describe('requestPersistence', () => {
  it('resolves to the browser answer', async () => {
    vi.stubGlobal('navigator', { storage: { persist: async () => true } })
    expect(await requestPersistence()).toBe(true)
  })
  it('resolves to false when unsupported or failing', async () => {
    vi.stubGlobal('navigator', {})
    expect(await requestPersistence()).toBe(false)
    vi.stubGlobal('navigator', { storage: { persist: async () => { throw new Error('no') } } })
    expect(await requestPersistence()).toBe(false)
  })
})
