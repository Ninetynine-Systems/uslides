import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBlocked, readAskFirst, writeAskFirst } from '../../src/app/privacy'

afterEach(() => vi.unstubAllGlobals())

describe('isBlocked', () => {
  it.each([
    [undefined, false, false, false],
    [undefined, true, false, true],
    ['blocked', false, false, true],
    ['blocked', false, true, false],
    ['allowed', true, false, false],
  ])('isBlocked(%s, ask=%s, once=%s) is %s', (p, ask, once, want) => {
    expect(isBlocked(p as never, ask, once)).toBe(want)
  })
})

describe('ask before loading from other websites', () => {
  it('defaults to off and remembers both choices', () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => void (store[key] = value),
    })
    expect(readAskFirst()).toBe(false)
    writeAskFirst(true)
    expect(readAskFirst()).toBe(true)
    writeAskFirst(false)
    expect(readAskFirst()).toBe(false)
  })

  it('uses the exact setting key', () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => void (store[key] = value),
    })
    writeAskFirst(true)
    expect(store['uslides.askBeforeExternal']).toBeDefined()
  })

  it('defaults to off and does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', new Proxy({}, { get() { throw new Error('blocked') } }))
    expect(readAskFirst()).toBe(false)
    expect(() => writeAskFirst(true)).not.toThrow()
  })
})
