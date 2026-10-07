/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão da spec 233 (M4): a lista de clientes abre já filtrada pelo nome que "Ver cliente" deixou no
 * `sessionStorage`, consome o recado uma vez e não o lê da URL.
 */
import { afterEach, describe, expect, it } from 'bun:test'

import { DELIVERY_CLIENT_SEARCH_STORAGE_KEY } from '@/modules/delivery-clients/shared/deliveryClientLink.service'

import { renderHook } from './renderHook.helper'

const { useDeliveryClients } = await import(
  '@/modules/delivery-clients/hooks/useDeliveryClients.hook'
)

describe('a lista de clientes abre filtrada pelo recado de "Ver cliente" (revisão 233 M4)', () => {
  afterEach(() => {
    sessionStorage.removeItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY)
    window.history.replaceState(null, '', '/')
  })

  it('usa o nome guardado e o consome: a próxima abertura vem sem filtro', async () => {
    sessionStorage.setItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY, 'Mercado Central')

    const first = await renderHook(() => useDeliveryClients({ permissions: [] }))
    expect(first.result().filters.nameContains).toBe('Mercado Central')
    expect(sessionStorage.getItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY)).toBeNull()
    first.unmount()

    const second = await renderHook(() => useDeliveryClients({ permissions: [] }))
    expect(second.result().filters.nameContains).toBe('')
    second.unmount()
  })

  it('o nome na URL é ignorado: dado pessoal não entra por query string', async () => {
    window.history.replaceState(null, '', '/clientes?name=Maria')

    const rendered = await renderHook(() => useDeliveryClients({ permissions: [] }))

    expect(rendered.result().filters.nameContains).toBe('')
    rendered.unmount()
  })
})
