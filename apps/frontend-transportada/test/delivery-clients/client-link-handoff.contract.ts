/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão da spec 233 (M4): "Ver cliente" levava o NOME do destinatário na query string
 * (`/clientes?name=`) — e o destinatário pode ser pessoa física (security.md §8: nenhum dado pessoal em
 * URL). O nome agora vai por `sessionStorage`, lido e removido uma vez pela lista; o endereço é `/clientes`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  buildDeliveryClientSearchRoute,
  consumeDeliveryClientSearch,
  DELIVERY_CLIENT_SEARCH_STORAGE_KEY,
  navigateToDeliveryClientSearch,
} from '@/modules/delivery-clients/shared/deliveryClientLink.service'
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

const CLIENT_NAME = 'Maria da Silva Souza'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

function createNavigator(calls: string[]): WorkspaceNavigator {
  return {
    dispatchPopState: () => void calls.push('popstate'),
    pushPath: (path) => void calls.push(`push:${path}`),
    rememberWorkspace: (workspace) => void calls.push(`remember:${workspace}`),
  }
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')

beforeEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: createMemoryStorage(),
  })
})

afterEach(() => {
  if (originalStorage === undefined) Reflect.deleteProperty(globalThis, 'sessionStorage')
  else Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
})

describe('Ver cliente: o nome não viaja na URL (revisão 233 M4)', () => {
  it('o endereço é só /clientes, sem query', () => {
    expect(buildDeliveryClientSearchRoute()).toBe('/clientes')
  })

  it('navegar grava o nome no sessionStorage e empurra /clientes sem o nome', () => {
    const calls: string[] = []

    navigateToDeliveryClientSearch({ clientName: CLIENT_NAME, navigator: createNavigator(calls) })

    expect(sessionStorage.getItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY)).toBe(CLIENT_NAME)
    expect(calls).toEqual(['push:/clientes', 'remember:delivery-clients', 'popstate'])
    expect(calls.join(' ')).not.toContain('Maria')
  })

  it('a lista lê o nome uma vez só: a segunda leitura volta vazia', () => {
    sessionStorage.setItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY, CLIENT_NAME)

    expect(consumeDeliveryClientSearch()).toBe(CLIENT_NAME)
    expect(consumeDeliveryClientSearch()).toBe('')
    expect(sessionStorage.getItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY)).toBeNull()
  })

  it('sem nada guardado a busca é vazia', () => {
    expect(consumeDeliveryClientSearch()).toBe('')
  })

  it('storage indisponível não derruba o clique nem a lista', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    const calls: string[] = []

    expect(() =>
      navigateToDeliveryClientSearch({
        clientName: CLIENT_NAME,
        navigator: createNavigator(calls),
      }),
    ).not.toThrow()
    expect(calls).toContain('push:/clientes')
    expect(consumeDeliveryClientSearch()).toBe('')
  })
})
