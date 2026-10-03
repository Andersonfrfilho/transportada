/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9): as rotas de `/recebimento` e a permissão que as abre. Leitura é `fleet.read` e
 * escrita é `trip.manage` — as mesmas que a API exige (`cargo-arrival-http.support.ts`). O menu e a
 * parede decidem pelo mesmo mapa de permissão (spec 221), nunca por papel.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildCargoArrivalDetailRoute,
  buildCargoArrivalRegisterRoute,
  buildCargoArrivalSeparationRoute,
  CARGO_RECEIVING_ROUTE,
  parseCargoReceivingRoute,
} from '@/modules/cargo-receiving/shared/cargoReceivingRoute.service'
import {
  canOpenWorkspace,
  resolveVisibleNavigationGroups,
  visibleWorkspaceKeys,
} from '@/modules/shared/workspaceAccess.service'
import { isWorkspaceForbidden } from '@/modules/shared/workspaceWall.service'

import { ARRIVAL_ID } from '../fixtures/cargoReceiving.fixture'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

/** `authorization.policy.ts`: o separador tem `fleet.read` e `trip.manage`; o motorista, não. */
const SEPARATOR = ['invoices.read', 'fleet.read', 'trip.read', 'trip.manage', 'cargo.measure']
const DRIVER = ['trip.read', 'trip.report']
const HELPER = ['trip.read', 'trip.report']

describe('as rotas de recebimento (spec 237 T2.4)', () => {
  test('o caminho base é /recebimento e as rotas se montam e se leem de volta', () => {
    expect(CARGO_RECEIVING_ROUTE).toBe('/recebimento')
    expect(buildCargoArrivalRegisterRoute()).toBe('/recebimento/nova')
    expect(buildCargoArrivalSeparationRoute(ARRIVAL_ID)).toBe(`/recebimento/${ARRIVAL_ID}`)
    expect(buildCargoArrivalDetailRoute(ARRIVAL_ID)).toBe(`/recebimento/${ARRIVAL_ID}/detalhe`)

    expect(parseCargoReceivingRoute('/recebimento')).toEqual({ kind: 'list' })
    expect(parseCargoReceivingRoute('/recebimento/')).toEqual({ kind: 'list' })
    expect(parseCargoReceivingRoute('/recebimento/nova')).toEqual({ kind: 'register' })
    expect(parseCargoReceivingRoute(`/recebimento/${ARRIVAL_ID}`)).toEqual({
      arrivalId: ARRIVAL_ID,
      kind: 'separation',
    })
    expect(parseCargoReceivingRoute(`/recebimento/${ARRIVAL_ID}/`)).toEqual({
      arrivalId: ARRIVAL_ID,
      kind: 'separation',
    })
    expect(parseCargoReceivingRoute(`/recebimento/${ARRIVAL_ID}/detalhe`)).toEqual({
      arrivalId: ARRIVAL_ID,
      kind: 'detail',
    })
  })

  test('caminho de outro módulo não é desta rota', () => {
    expect(parseCargoReceivingRoute('/trips')).toBeNull()
    expect(parseCargoReceivingRoute('/recebimentos')).toBeNull()
    expect(parseCargoReceivingRoute('/')).toBeNull()
  })

  test('subcaminho desconhecido cai na lista, e id que não é UUID também', () => {
    expect(parseCargoReceivingRoute('/recebimento/qualquer-coisa')).toEqual({ kind: 'list' })
    expect(parseCargoReceivingRoute(`/recebimento/${ARRIVAL_ID}/outra`)).toEqual({ kind: 'list' })
  })
})

describe('a permissão do recebimento', () => {
  test('o separador abre; motorista e ajudante não', () => {
    expect(canOpenWorkspace({ permissions: SEPARATOR, workspace: 'cargo-receiving' })).toBe(true)
    expect(canOpenWorkspace({ permissions: DRIVER, workspace: 'cargo-receiving' })).toBe(false)
    expect(canOpenWorkspace({ permissions: HELPER, workspace: 'cargo-receiving' })).toBe(false)
  })

  test('abre com fleet.read, a leitura que a API exige', () => {
    expect(canOpenWorkspace({ permissions: ['fleet.read'], workspace: 'cargo-receiving' })).toBe(true)
    expect(canOpenWorkspace({ permissions: ['trip.manage'], workspace: 'cargo-receiving' })).toBe(false)
  })

  test('o item de menu só aparece para quem pode abrir, no grupo de operações', () => {
    expect(visibleWorkspaceKeys(SEPARATOR)).toContain('cargo-receiving')
    expect(visibleWorkspaceKeys(DRIVER)).not.toContain('cargo-receiving')

    const operations = resolveVisibleNavigationGroups(SEPARATOR).find(
      (group) => group.key === 'operations',
    )
    expect(operations?.items.map((item) => item.href)).toContain('/recebimento')
    expect(
      resolveVisibleNavigationGroups(DRIVER).flatMap((group) => group.items.map((item) => item.key)),
    ).not.toContain('cargo-receiving')
  })

  test('a parede da página decide pelo mesmo mapa: sem permissão ou sem empresa, barrada', () => {
    const wall = (permissions: readonly string[], companyId: string | undefined = COMPANY_ID) =>
      isWorkspaceForbidden({ companyId, permissions, workspace: 'cargo-receiving' })

    expect(wall(SEPARATOR)).toBe(false)
    expect(wall(DRIVER)).toBe(true)
    expect(wall(SEPARATOR, undefined)).toBe(true)
  })
})
