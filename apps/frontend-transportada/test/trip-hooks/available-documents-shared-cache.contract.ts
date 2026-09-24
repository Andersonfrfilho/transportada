/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As duas montagens de viagem convivem na mesma tela e leem a mesma lista de notas livres. Este é
 * o contrato que os testes de fonte não alcançam: quantas vezes a base é varrida de verdade.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { TripCandidateDocument } from '@/modules/trip/shared/trip.types'

import {
  buildCandidateDocument,
  createRecordingStorage,
  installSessionStorage,
} from '../fixtures/tripAssemblyHooks.fixture'
import { renderHook, settle, waitFor, type RenderedHook } from './renderHook.helper'
import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'

const SCOPE = { companyId: 'company-1', userId: 'user-1' } as const
const VEHICLE_ID = 'vehicle-1'
const DOCUMENT = buildCandidateDocument('document-1')

const { useTripQuickCreate } = await import('@/modules/trip/hooks/useTripQuickCreate.hook')
const { useTripRouteAssembly } = await import('@/modules/trip/hooks/useTripRouteAssembly.hook')

type Workspace = Readonly<{
  quickCreate: ReturnType<typeof useTripQuickCreate>
}>

/** As duas montagens como a página as monta: lado a lado, sob o mesmo cliente de consulta. */
function renderWorkspace(): Promise<RenderedHook<Workspace>> {
  return renderHook(() => {
    useTripRouteAssembly({
      canManageTrips: true,
      draftScope: SCOPE,
      onCreated: () => undefined,
      selectableDriverIds: [],
      selectableVehicleIds: [VEHICLE_ID],
    })
    return {
      quickCreate: useTripQuickCreate({
        draftScope: SCOPE,
        onCreated: () => undefined,
        permissions: [],
        selectableDriverIds: [],
        selectableVehicleIds: [VEHICLE_ID],
      }),
    }
  })
}

describe('as notas livres são varridas uma vez por tela de viagens', () => {
  let loads = 0
  let rendered: RenderedHook<Workspace> | undefined

  beforeEach(() => {
    installSessionStorage(createRecordingStorage())
    resetTripHookFakes([DOCUMENT])
    loads = 0
    const documents: readonly TripCandidateDocument[] = [DOCUMENT]
    fakes.loadDocuments = () => {
      loads += 1
      return Promise.resolve(documents)
    }
  })

  afterEach(() => {
    rendered?.unmount()
    rendered = undefined
  })

  /**
   * ⚠️ Aqui estava o desperdício: cada montagem tinha chave própria sobre o mesmo carregador, e
   * a tela varria a base paginada duas vezes para guardar duas cópias do mesmo recorte.
   */
  test('montar a tela busca as notas uma vez, não uma por montagem', async () => {
    rendered = await renderWorkspace()

    await waitFor(() => {
      expect(loads).toBe(1)
    })
    await settle()

    expect(loads).toBe(1)
  })

  /** E o diálogo que abre depois encontra a lista pronta, em vez de começar a espera no clique. */
  test('abrir "Nova viagem" não dispara busca nova nem mostra carregamento', async () => {
    rendered = await renderWorkspace()
    await waitFor(() => {
      expect(loads).toBe(1)
    })

    rendered.result().quickCreate.open()
    await settle()

    expect(loads).toBe(1)
    expect(rendered.result().quickCreate.documentsQuery.isLoading).toBe(false)
    expect(rendered.result().quickCreate.availableDocuments).toHaveLength(1)
  })
})
