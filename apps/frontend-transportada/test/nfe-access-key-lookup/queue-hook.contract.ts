/* Copyright (c) 2026 Ada Technology. MIT License. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'bun:test'

import { CHECK_BATCH_WINDOW_MS } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import { useAccessKeyLookup } from '../../src/modules/nfe-access-key-lookup/hooks/useAccessKeyLookup.hook'
import {
  useAccessKeyLookupQueue,
  type AccessKeyLookupQueueController,
} from '../../src/modules/nfe-access-key-lookup/hooks/useAccessKeyLookupQueue.hook'
import { createFakeClient, createFakeScheduler, KEY_ONE, KEY_TWO } from './lookup.fixture'

function mountQueue() {
  const client = createFakeClient()
  const scheduler = createFakeScheduler()
  const latest: { current?: AccessKeyLookupQueueController } = {}
  function Probe() {
    latest.current = useAccessKeyLookupQueue({ client, scheduler })
    return null
  }
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(createElement(Probe)))
  return { client, latest, root, scheduler }
}

describe('hooks da busca por chave', () => {
  it('a fila reage às leituras e agrupa a conferência', async () => {
    const { client, latest, root, scheduler } = mountQueue()
    client.documents.set(KEY_ONE, 'doc-1')
    act(() => {
      latest.current?.add(KEY_ONE)
      latest.current?.add(KEY_TWO)
    })
    expect(latest.current?.rows.map((row) => row.state.kind)).toEqual(['checking', 'checking'])

    await act(async () => {
      await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    })

    expect(client.calls.checks).toEqual([[KEY_ONE, KEY_TWO]])
    expect(latest.current?.rows.map((row) => row.state.kind)).toEqual(['ready', 'searching'])
    act(() => root.unmount())
  })

  it('desmontar a tela cancela os relógios da busca', async () => {
    const { latest, root, scheduler } = mountQueue()
    act(() => {
      latest.current?.add(KEY_ONE)
    })
    await act(async () => {
      await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    })
    expect(scheduler.pendingCount()).toBe(1)

    act(() => root.unmount())

    expect(scheduler.pendingCount()).toBe(0)
  })

  it('useAccessKeyLookup acompanha uma chave só', async () => {
    const client = createFakeClient()
    const scheduler = createFakeScheduler()
    client.documents.set(KEY_ONE, 'doc-1')
    const latest: { current?: ReturnType<typeof useAccessKeyLookup> } = {}
    function Probe() {
      latest.current = useAccessKeyLookup(KEY_ONE, { client, scheduler })
      return null
    }
    const root = createRoot(document.createElement('div'))
    act(() => root.render(createElement(Probe)))
    await act(async () => {
      await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    })

    expect(latest.current?.row?.state).toEqual({ documentId: 'doc-1', kind: 'ready' })
    act(() => root.unmount())
  })
})
