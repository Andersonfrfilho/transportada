/* Copyright (c) 2026 Ada Technology. MIT License. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'bun:test'

import { CHECK_BATCH_WINDOW_MS } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import { useAccessKeyImport } from '../../src/modules/nfe-workspace/hooks/useAccessKeyImport.hook'
import { createFakeClient, createFakeScheduler, KEY_ONE, KEY_TWO } from './lookup.fixture'

function mount() {
  const client = createFakeClient()
  const scheduler = createFakeScheduler()
  const latest: { current?: ReturnType<typeof useAccessKeyImport> } = {}
  let refocusCount = 0
  function Probe() {
    latest.current = useAccessKeyImport({
      lookup: { client, scheduler },
      refocusReader: () => {
        refocusCount += 1
      },
    })
    return null
  }
  const root = createRoot(document.createElement('div'))
  act(() => root.render(createElement(Probe)))
  return { client, latest, refocusCount: () => refocusCount, root, scheduler }
}

function installMemoryStorage(): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map<string, string>()
  const memory = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  }
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memory })
  return () => {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'sessionStorage')
    else Object.defineProperty(globalThis, 'sessionStorage', original)
  }
}

describe('hook de importar por bip', () => {
  it('conta ilegível e repetida, guarda só chaves e ids e limpa só a lista', async () => {
    const restoreStorage = installMemoryStorage()
    const { client, latest, refocusCount, root, scheduler } = mount()
    client.documents.set(KEY_ONE, 'doc-1')
    act(() => {
      latest.current?.read(KEY_ONE)
      latest.current?.read(KEY_ONE)
      latest.current?.readUnreadable()
      latest.current?.read(KEY_TWO)
    })
    await act(async () => {
      await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    })

    expect(latest.current?.summary).toMatchObject({ alreadyInSystem: 1, scanned: 3, unreadable: 1 })
    expect(refocusCount()).toBe(4)
    const stored = globalThis.sessionStorage.getItem('nfe-workspace.access-key-import') ?? ''
    expect(stored).not.toContain('doc-1')
    expect(JSON.parse(stored)).toHaveLength(2)
    act(() => root.unmount())

    const remounted = mount()
    expect(remounted.latest.current?.summary.scanned).toBe(2)
    act(() => remounted.latest.current?.clearList())
    expect(remounted.latest.current?.summary.scanned).toBe(0)
    expect(globalThis.sessionStorage.getItem('nfe-workspace.access-key-import')).toBeNull()
    act(() => remounted.root.unmount())
    restoreStorage()
  })
})
