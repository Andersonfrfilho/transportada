/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * B1 (revisão spec 161): sem reset entre registros, `occurrencePhotoOccurrenceIdRef` (fechado
 * dentro de `useTripWorkspace`) sobrevivia à ocorrência anterior — a segunda ocorrência da mesma
 * sessão nunca chamava `registerTripOccurrence` de novo, e as fotos dela eram anexadas (via
 * `attachOccurrencePhoto`) à primeira ocorrência, em silêncio. `resetSeparationOccurrencePhotoSend`
 * já existia mas não tinha consumidor algum (grep confirmado) — este teste prova o hook por fora,
 * chamando reset entre dois registros, exatamente como a UI corrigida (`TripOccurrences.component`)
 * agora faz ao abrir/fechar o formulário e no início de cada novo registro.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_MANAGE_PERMISSION } from '@/modules/trip/shared/trip.constant'
import type { RegisteredOccurrence } from '@/modules/trip/shared/trip.types'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook } from './renderHook.helper'

const { useTripWorkspace } = await import('@/modules/trip/hooks/useTripWorkspace.hook')

function buildRegistered(id: string): RegisteredOccurrence {
  return {
    createdAt: '2026-09-22T12:00:00.000Z',
    email: null,
    id,
    note: '',
    occurrenceTypeId: 'type-1',
    productCode: '',
    stage: 'separation',
    typeName: 'Avaria',
  }
}

function renderWorkspace() {
  return renderHook(() =>
    useTripWorkspace({
      companyId: 'company-1',
      permissions: [TRIP_MANAGE_PERMISSION],
    }),
  )
}

describe('sessão de fotos de ocorrência de separação entre dois registros (B1)', () => {
  test('sem reset, a segunda ocorrência reusa o id da primeira e nunca chama registerTripOccurrence de novo', async () => {
    resetTripHookFakes([])
    const registerCalls: string[] = []
    fakes.tripClient = {
      ...fakes.tripClient,
      attachOccurrencePhoto: () => Promise.resolve({ id: 'attachment-x', position: 2 }),
      registerTripOccurrence: (input: { occurrenceTypeId: string }) => {
        registerCalls.push(input.occurrenceTypeId)
        return Promise.resolve(buildRegistered(`occurrence-${registerCalls.length}`))
      },
    }

    const rendered = await renderWorkspace()

    await rendered.result().sendSeparationOccurrencePhotos({
      documentId: 'doc-1',
      note: 'ocorrência A',
      occurrenceTypeId: 'type-A',
      photos: [{ original: new Blob(), photoId: 'photo-a1', thumbnail: undefined }],
      productCode: '',
      tripId: 'trip-1',
    })

    // ⚠️ Reproduz o defeito de propósito: sem `resetSeparationOccurrencePhotoSend`, o segundo
    // registro (tipo/nota diferentes) reusa o `occurrenceId` da primeira ocorrência.
    await rendered.result().sendSeparationOccurrencePhotos({
      documentId: 'doc-2',
      note: 'ocorrência B',
      occurrenceTypeId: 'type-B',
      photos: [{ original: new Blob(), photoId: 'photo-b1', thumbnail: undefined }],
      productCode: '',
      tripId: 'trip-1',
    })

    expect(registerCalls).toEqual(['type-A'])

    rendered.unmount()
  })

  test('com reset entre os registros, a segunda ocorrência chama registerTripOccurrence de novo — nunca anexa a fotos da primeira', async () => {
    resetTripHookFakes([])
    const registerCalls: string[] = []
    fakes.tripClient = {
      ...fakes.tripClient,
      attachOccurrencePhoto: () => Promise.resolve({ id: 'attachment-x', position: 2 }),
      registerTripOccurrence: (input: { occurrenceTypeId: string }) => {
        registerCalls.push(input.occurrenceTypeId)
        return Promise.resolve(buildRegistered(`occurrence-${registerCalls.length}`))
      },
    }

    const rendered = await renderWorkspace()

    await rendered.result().sendSeparationOccurrencePhotos({
      documentId: 'doc-1',
      note: 'ocorrência A',
      occurrenceTypeId: 'type-A',
      photos: [{ original: new Blob(), photoId: 'photo-a1', thumbnail: undefined }],
      productCode: '',
      tripId: 'trip-1',
    })

    rendered.result().resetSeparationOccurrencePhotoSend()

    await rendered.result().sendSeparationOccurrencePhotos({
      documentId: 'doc-2',
      note: 'ocorrência B',
      occurrenceTypeId: 'type-B',
      photos: [{ original: new Blob(), photoId: 'photo-b1', thumbnail: undefined }],
      productCode: '',
      tripId: 'trip-1',
    })

    expect(registerCalls).toEqual(['type-A', 'type-B'])

    rendered.unmount()
  })
})
