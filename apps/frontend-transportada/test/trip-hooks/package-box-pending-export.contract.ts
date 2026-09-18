/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A exportação do que falta medir busca **só no clique**: abrir a aba não gasta o teto de 10 a cada
 * 5 min da API nem baixa a empresa inteira, e cada clique lê a fila de agora — nunca a de antes da
 * última medida.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { act } from 'react'

import {
  PackageBoxRequestError,
  type PackageBox,
  type PackageBoxPendingExport,
} from '@/modules/nfe-workspace/shared/packageBoxClient.service'

import { createDeferred } from '../fixtures/tripAssemblyHooks.fixture'
import { renderHook, settle, waitFor, type RenderedHook } from './renderHook.helper'

const { usePackageBoxPendingExport } = await import(
  '@/modules/nfe-workspace/hooks/usePackageBoxPendingExport.hook'
)

const BOX = { id: 'box-1', productCode: 'P1' } as unknown as PackageBox

describe('exportação das caixas pendentes no hook', () => {
  let hook: RenderedHook<ReturnType<typeof usePackageBoxPendingExport>> | undefined

  afterEach(() => {
    hook?.unmount()
    hook = undefined
  })

  test('abrir a aba não busca nada, e os botões nascem livres', async () => {
    let calls = 0
    hook = await renderHook(() =>
      usePackageBoxPendingExport({
        loadPendingExport: () => {
          calls += 1
          return Promise.resolve({ items: [BOX], truncated: false })
        },
      }),
    )
    await settle()

    expect(calls).toBe(0)
    expect(hook.result().preparingFormat).toBeUndefined()
    expect(hook.result().feedback).toEqual({ kind: 'idle' })
  })

  test('o clique busca, mostra qual formato está sendo preparado e entrega as caixas', async () => {
    const deferred = createDeferred<PackageBoxPendingExport>()
    hook = await renderHook(() =>
      usePackageBoxPendingExport({ loadPendingExport: () => deferred.promise }),
    )

    let prepared: Promise<readonly PackageBox[] | undefined> = Promise.resolve(undefined)
    await act(async () => {
      prepared = hook!.result().prepare('csv')
      await Promise.resolve()
    })
    await waitFor(() => expect(hook!.result().preparingFormat).toBe('csv'))
    expect(hook.result().feedback).toEqual({ kind: 'preparing' })

    await act(async () => {
      deferred.resolve({ items: [BOX], truncated: true })
      await Promise.resolve()
    })

    expect(await prepared).toEqual([BOX])
    await waitFor(() => expect(hook!.result().feedback).toEqual({ kind: 'truncated', total: 1 }))
    expect(hook.result().preparingFormat).toBeUndefined()
  })

  test('429 vira aviso de exportações seguidas, e nada é baixado', async () => {
    hook = await renderHook(() =>
      usePackageBoxPendingExport({
        loadPendingExport: () =>
          Promise.reject(new PackageBoxRequestError({ code: 'TOO_MANY_REQUESTS', status: 429 })),
      }),
    )

    let prepared: readonly PackageBox[] | undefined = [BOX]
    await act(async () => {
      prepared = await hook!.result().prepare('xlsx')
    })

    expect(prepared).toBeUndefined()
    await waitFor(() => expect(hook!.result().feedback).toEqual({ kind: 'rateLimited' }))
  })

  test('cada clique lê de novo — a exportação nunca é a da fila antes da última medida', async () => {
    let calls = 0
    hook = await renderHook(() =>
      usePackageBoxPendingExport({
        loadPendingExport: () => {
          calls += 1
          return Promise.resolve({ items: calls === 1 ? [BOX] : [], truncated: false })
        },
      }),
    )

    let first: readonly PackageBox[] | undefined
    let second: readonly PackageBox[] | undefined = [BOX]
    await act(async () => {
      first = await hook!.result().prepare('csv')
    })
    await act(async () => {
      second = await hook!.result().prepare('csv')
    })

    expect(calls).toBe(2)
    expect(first).toEqual([BOX])
    // Lista vazia não baixa arquivo vazio: diz que não há o que exportar.
    expect(second).toBeUndefined()
    await waitFor(() => expect(hook!.result().feedback).toEqual({ kind: 'empty' }))
  })
})
