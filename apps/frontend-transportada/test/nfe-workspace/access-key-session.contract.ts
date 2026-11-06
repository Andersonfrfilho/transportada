/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  clearAccessKeyImportSession,
  loadAccessKeyImportSession,
  saveAccessKeyImportSession,
} from '../../src/modules/nfe-workspace/shared/accessKeyImportSession.service'

const VALID_KEY = '35260712001234560001550010000000011000000018'
const STORAGE_KEY = 'nfe-workspace.access-key-import'

let store: Map<string, string>
let original: unknown

beforeEach(() => {
  store = new Map()
  original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  })
})

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(globalThis, 'sessionStorage')
  else Object.defineProperty(globalThis, 'sessionStorage', original as PropertyDescriptor)
})

describe('lista guardada da importação por bip', () => {
  it('só restaura chave de 44 caracteres e id de busca com até 64 caracteres', () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify([
        { accessKey: VALID_KEY, lookupId: 'lookup-1', wasRegistered: false },
        { accessKey: 'curta', lookupId: null, wasRegistered: false },
        { accessKey: `${VALID_KEY}9`, lookupId: null, wasRegistered: false },
        { accessKey: VALID_KEY.replace('1', 'a'), lookupId: null, wasRegistered: false },
        { accessKey: VALID_KEY, lookupId: 'x'.repeat(65), wasRegistered: false },
        { accessKey: VALID_KEY, lookupId: 'x'.repeat(64), wasRegistered: true },
      ]),
    )

    const restored = loadAccessKeyImportSession()

    expect(restored.map((entry) => entry.lookupId)).toEqual(['lookup-1', 'x'.repeat(64)])
  })

  it('guarda e devolve a lista; clearAccessKeyImportSession esquece tudo', () => {
    saveAccessKeyImportSession([
      { accessKey: VALID_KEY, lookupId: null, state: { kind: 'checking' } },
    ])
    expect(loadAccessKeyImportSession()).toHaveLength(1)

    clearAccessKeyImportSession()

    expect(store.has(STORAGE_KEY)).toBe(false)
    expect(loadAccessKeyImportSession()).toEqual([])
  })

  it('sem armazenamento da sessão a limpeza não quebra', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('denied')
      },
    })

    expect(() => clearAccessKeyImportSession()).not.toThrow()
  })
})
