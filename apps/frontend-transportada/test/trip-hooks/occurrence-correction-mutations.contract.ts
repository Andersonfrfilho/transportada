/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 240 T1.4 (RF8): corrigir ou cancelar a ocorrência invalida detalhe, feed e linha do tempo —
 * senão a tela mostra o estado velho ao lado do novo. Cada tentativa leva a própria `Idempotency-Key`.
 */
import { describe, expect, test } from 'bun:test'
import type { QueryClient } from '@tanstack/react-query'

import { TRIP_QUERY_KEY } from '@/modules/trip/shared/trip.constant'
import type {
  CancelTripOccurrenceInput,
  CorrectTripOccurrenceItemsInput,
  OccurrenceWriteResult,
} from '@/modules/trip/shared/trip.types'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook } from './renderHook.helper'

const { useCancelOccurrence, useCorrectOccurrenceItems } = await import(
  '@/modules/trip/queries/useOccurrenceCorrection.query'
)
const { TRIP_OCCURRENCE_FEED_QUERY_KEY } = await import(
  '@/modules/trip/queries/tripOccurrenceFeed.query'
)

const COMPANY_ID = 'company-1'
const TRIP_ID = 'trip-1'
const DOCUMENT_ID = 'document-1'
const OCCURRENCE_ID = 'occurrence-1'

const DETAIL_KEY = [TRIP_OCCURRENCE_FEED_QUERY_KEY, 'detail', COMPANY_ID, OCCURRENCE_ID] as const
const FEED_KEY = [TRIP_OCCURRENCE_FEED_QUERY_KEY, COMPANY_ID, 'perPage=25'] as const
const OCCURRENCE_TIMELINE_KEY = [
  TRIP_OCCURRENCE_FEED_QUERY_KEY,
  'timeline',
  COMPANY_ID,
  OCCURRENCE_ID,
] as const
const TRIP_TIMELINE_KEY = [TRIP_QUERY_KEY, TRIP_ID, 'timeline'] as const
const DOCUMENT_TIMELINE_KEY = [
  TRIP_QUERY_KEY,
  TRIP_ID,
  'timeline',
  'document',
  DOCUMENT_ID,
] as const
const DOCUMENT_OCCURRENCES_KEY = [
  TRIP_QUERY_KEY,
  COMPANY_ID,
  TRIP_ID,
  'occurrences',
  DOCUMENT_ID,
] as const
const OTHER_TRIP_OCCURRENCES_KEY = [
  TRIP_QUERY_KEY,
  COMPANY_ID,
  'trip-2',
  'occurrences',
  DOCUMENT_ID,
] as const
const UNRELATED_KEY = [TRIP_QUERY_KEY, 'list'] as const
const UNRELATED_KEYS = [UNRELATED_KEY, OTHER_TRIP_OCCURRENCES_KEY] as const

const AFFECTED_KEYS = [
  DETAIL_KEY,
  FEED_KEY,
  OCCURRENCE_TIMELINE_KEY,
  TRIP_TIMELINE_KEY,
  DOCUMENT_TIMELINE_KEY,
  DOCUMENT_OCCURRENCES_KEY,
] as const

const WRITE_RESULT: OccurrenceWriteResult = {
  attachments: [],
  createdAt: '2026-10-03T00:00:00.000Z',
  id: OCCURRENCE_ID,
  note: '',
  occurrenceTypeId: 'type-1',
  productCode: '696',
  stage: 'separation',
  typeName: 'Item avariado',
}

function seed(queryClient: QueryClient): void {
  for (const key of [...AFFECTED_KEYS, ...UNRELATED_KEYS]) queryClient.setQueryData(key, {})
}

function isInvalidated(queryClient: QueryClient, key: readonly unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true
}

describe('mutações de correção e cancelamento da ocorrência (spec 240 T1.4)', () => {
  test('corrigir invalida detalhe, feed, linhas do tempo e a lista de ocorrências da nota — e só elas', async () => {
    resetTripHookFakes([])
    fakes.tripClient = {
      ...fakes.tripClient,
      correctTripOccurrenceItems: () => Promise.resolve(WRITE_RESULT),
    }
    const rendered = await renderHook(() => useCorrectOccurrenceItems())
    seed(rendered.queryClient)

    await rendered.result().mutateAsync({
      documentId: DOCUMENT_ID,
      items: [{ code: '696', quantity: '2', unit: 'box' }],
      occurrenceId: OCCURRENCE_ID,
      tripId: TRIP_ID,
    })

    for (const key of AFFECTED_KEYS) expect(isInvalidated(rendered.queryClient, key)).toBe(true)
    for (const key of UNRELATED_KEYS) expect(isInvalidated(rendered.queryClient, key)).toBe(false)
    rendered.unmount()
  })

  test('cancelar invalida as mesmas consultas', async () => {
    resetTripHookFakes([])
    fakes.tripClient = {
      ...fakes.tripClient,
      cancelTripOccurrence: () => Promise.resolve(WRITE_RESULT),
    }
    const rendered = await renderHook(() => useCancelOccurrence())
    seed(rendered.queryClient)

    await rendered.result().mutateAsync({
      documentId: DOCUMENT_ID,
      occurrenceId: OCCURRENCE_ID,
      reason: 'Lançada na nota errada',
      tripId: TRIP_ID,
    })

    for (const key of AFFECTED_KEYS) expect(isInvalidated(rendered.queryClient, key)).toBe(true)
    for (const key of UNRELATED_KEYS) expect(isInvalidated(rendered.queryClient, key)).toBe(false)
    rendered.unmount()
  })

  test('um 409 também invalida: a tela recarrega o estado que o servidor viu', async () => {
    resetTripHookFakes([])
    fakes.tripClient = {
      ...fakes.tripClient,
      cancelTripOccurrence: () => Promise.reject(new Error('OCCURRENCE_CASE_ALREADY_OPEN')),
      correctTripOccurrenceItems: () => Promise.reject(new Error('OCCURRENCE_CASE_ALREADY_OPEN')),
    }
    const correcting = await renderHook(() => useCorrectOccurrenceItems())
    const cancelling = await renderHook(() => useCancelOccurrence())
    seed(correcting.queryClient)
    seed(cancelling.queryClient)

    const correctionError = await correcting
      .result()
      .mutateAsync({
        documentId: DOCUMENT_ID,
        items: [],
        occurrenceId: OCCURRENCE_ID,
        tripId: TRIP_ID,
      })
      .catch((error: unknown) => error)
    const cancellationError = await cancelling
      .result()
      .mutateAsync({
        documentId: DOCUMENT_ID,
        occurrenceId: OCCURRENCE_ID,
        reason: 'motivo',
        tripId: TRIP_ID,
      })
      .catch((error: unknown) => error)

    expect(correctionError).toEqual(
      expect.objectContaining({ message: 'OCCURRENCE_CASE_ALREADY_OPEN' }),
    )
    expect(cancellationError).toEqual(
      expect.objectContaining({ message: 'OCCURRENCE_CASE_ALREADY_OPEN' }),
    )
    for (const queryClient of [correcting.queryClient, cancelling.queryClient]) {
      for (const key of AFFECTED_KEYS) expect(isInvalidated(queryClient, key)).toBe(true)
    }
    correcting.unmount()
    cancelling.unmount()
  })

  test('cada tentativa leva a própria Idempotency-Key, e o resto vai como veio', async () => {
    resetTripHookFakes([])
    const corrections: CorrectTripOccurrenceItemsInput[] = []
    const cancellations: CancelTripOccurrenceInput[] = []
    fakes.tripClient = {
      ...fakes.tripClient,
      cancelTripOccurrence: (input: CancelTripOccurrenceInput) => {
        cancellations.push(input)
        return Promise.resolve(WRITE_RESULT)
      },
      correctTripOccurrenceItems: (input: CorrectTripOccurrenceItemsInput) => {
        corrections.push(input)
        return Promise.resolve(WRITE_RESULT)
      },
    }
    const correcting = await renderHook(() => useCorrectOccurrenceItems())
    const cancelling = await renderHook(() => useCancelOccurrence())
    const variables = { documentId: DOCUMENT_ID, occurrenceId: OCCURRENCE_ID, tripId: TRIP_ID }

    await correcting.result().mutateAsync({ ...variables, items: [{ code: '696' }] })
    await correcting.result().mutateAsync({ ...variables, items: [{ code: '696' }] })
    await cancelling.result().mutateAsync({ ...variables, reason: 'um' })
    await cancelling.result().mutateAsync({ ...variables, reason: 'dois' })

    expect(corrections.map((call) => call.items)).toEqual([[{ code: '696' }], [{ code: '696' }]])
    expect(cancellations.map((call) => call.reason)).toEqual(['um', 'dois'])
    const keys = [...corrections, ...cancellations].map((call) => call.idempotencyKey)
    expect(keys.every((key) => key !== '')).toBe(true)
    expect(new Set(keys).size).toBe(4)
    correcting.unmount()
    cancelling.unmount()
  })
})
