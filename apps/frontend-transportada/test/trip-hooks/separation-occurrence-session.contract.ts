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
import { renderHook, waitFor } from './renderHook.helper'

const { useTripWorkspace } = await import('@/modules/trip/hooks/useTripWorkspace.hook')

function buildRegistered(id: string): RegisteredOccurrence {
  return {
    attachments: [{ id: `${id}-attachment-1`, position: 1 }],
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
      productCodes: [],
      tripId: 'trip-1',
    })

    // ⚠️ Reproduz o defeito de propósito: sem `resetSeparationOccurrencePhotoSend`, o segundo
    // registro (tipo/nota diferentes) reusa o `occurrenceId` da primeira ocorrência.
    await rendered.result().sendSeparationOccurrencePhotos({
      documentId: 'doc-2',
      note: 'ocorrência B',
      occurrenceTypeId: 'type-B',
      photos: [{ original: new Blob(), photoId: 'photo-b1', thumbnail: undefined }],
      productCodes: [],
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
      productCodes: [],
      tripId: 'trip-1',
    })

    rendered.result().resetSeparationOccurrencePhotoSend()

    await rendered.result().sendSeparationOccurrencePhotos({
      documentId: 'doc-2',
      note: 'ocorrência B',
      occurrenceTypeId: 'type-B',
      photos: [{ original: new Blob(), photoId: 'photo-b1', thumbnail: undefined }],
      productCodes: [],
      tripId: 'trip-1',
    })

    expect(registerCalls).toEqual(['type-A', 'type-B'])

    rendered.unmount()
  })
})

/**
 * B2 (revisão spec 161): `sendSeparationOccurrencePhotos` não lança na falha de uma foto — o envio
 * é sequencial e sempre resolve, marcando o item como `failed`. Sem o retorno `hasFailure`, o
 * formulário não tinha como saber que precisa continuar aberto para reenviar só o que faltou.
 */
describe('recuperação de falha parcial no envio de fotos (B2)', () => {
  test('hasFailure volta true quando uma foto falha, e o reenvio (sem reset) completa só o que faltou', async () => {
    resetTripHookFakes([])
    const attachedPhotoIds: string[] = []
    let attachAttempts = 0
    fakes.tripClient = {
      ...fakes.tripClient,
      attachOccurrencePhoto: (input: { file: Blob }) => {
        attachAttempts += 1
        // A foto 2 falha na primeira tentativa e vai na segunda (reenvio).
        if (attachAttempts === 1) return Promise.reject(new Error('UPLOAD_FAILED'))
        attachedPhotoIds.push('photo-2')
        void input
        return Promise.resolve({ id: 'attachment-2', position: 2 })
      },
      registerTripOccurrence: () => Promise.resolve(buildRegistered('occurrence-1')),
    }

    const rendered = await renderWorkspace()
    const input = {
      documentId: 'doc-1',
      note: 'ocorrência A',
      occurrenceTypeId: 'type-A',
      photos: [
        { original: new Blob(), photoId: 'photo-1', thumbnail: undefined },
        { original: new Blob(), photoId: 'photo-2', thumbnail: undefined },
      ],
      productCodes: [],
      tripId: 'trip-1',
    }

    const firstAttempt = await rendered.result().sendSeparationOccurrencePhotos(input)
    expect(firstAttempt.hasFailure).toBe(true)
    await waitFor(() =>
      expect(
        rendered.result().occurrencePhotoSendState.find((item) => item.photoId === 'photo-2')
          ?.status,
      ).toBe('failed'),
    )

    // ⚠️ Reenvio sem `resetSeparationOccurrencePhotoSend` — a mesma sessão retoma a fila, e a
    // foto 1 (já `sent`) não é reenviada de novo.
    const retryAttempt = await rendered.result().sendSeparationOccurrencePhotos(input)
    expect(retryAttempt.hasFailure).toBe(false)
    expect(attachedPhotoIds).toEqual(['photo-2'])

    rendered.unmount()
  })

  /**
   * B2 correlato: a fila era reaproveitada por **comprimento**, não por identidade de `photoId`.
   * Chamar de novo com o mesmo número de fotos mas fotos diferentes, sem reset, reproduzia o
   * defeito — a fila antiga (com item `sent`) fazia o envio de verdade virar no-op silencioso.
   */
  test('duas ocorrências com o mesmo número de fotos, sem reset entre elas: a fila não confunde photoId', async () => {
    resetTripHookFakes([])
    const registeredPhotoIds: string[] = []
    fakes.tripClient = {
      ...fakes.tripClient,
      attachOccurrencePhoto: () => Promise.resolve({ id: 'attachment-x', position: 2 }),
      registerTripOccurrence: (input: { file: Blob }) => {
        void input
        return Promise.resolve(buildRegistered('occurrence-1'))
      },
    }

    const rendered = await renderWorkspace()

    await rendered.result().sendSeparationOccurrencePhotos({
      documentId: 'doc-1',
      note: 'ocorrência A',
      occurrenceTypeId: 'type-A',
      photos: [{ original: new Blob(), photoId: 'photo-a1', thumbnail: undefined }],
      productCodes: [],
      tripId: 'trip-1',
    })
    await waitFor(() => expect(rendered.result().occurrencePhotoSendState[0]?.status).toBe('sent'))
    registeredPhotoIds.push(rendered.result().occurrencePhotoSendState[0]?.photoId ?? 'MISSING_A')

    // ⚠️ Sem `resetSeparationOccurrencePhotoSend` de propósito: é a identidade por `photoId` que
    // precisa proteger contra a fila antiga, não o reset (que já é a defesa da B1).
    await rendered.result().sendSeparationOccurrencePhotos({
      documentId: 'doc-2',
      note: 'ocorrência B',
      occurrenceTypeId: 'type-B',
      photos: [{ original: new Blob(), photoId: 'photo-b1', thumbnail: undefined }],
      productCodes: [],
      tripId: 'trip-1',
    })

    // A fila da ocorrência B reflete `photo-b1`, nunca `photo-a1` reaproveitado por comprimento.
    await waitFor(() =>
      expect(rendered.result().occurrencePhotoSendState).toEqual([
        { error: undefined, photoId: 'photo-b1', status: 'sent' },
      ]),
    )

    rendered.unmount()
  })
})
