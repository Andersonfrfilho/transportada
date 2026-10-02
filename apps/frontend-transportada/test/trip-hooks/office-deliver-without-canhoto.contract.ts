/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 RF6/RF7: a baixa do escritório **sem canhoto** pelo painel — uma nota e em massa. A
 * mutação de uma nota existia e nunca tinha sido chamada; o lote é leque por nota, porque não há
 * rota de lote com autoria (ADR-0067) e `batch-status` continua só `load`/`separate` (RF5).
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '@/modules/trip/shared/trip.constant'
import type { FieldSettlementResult } from '@/modules/trip/shared/trip.types'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook } from './renderHook.helper'

const { useTripWorkspace } = await import('@/modules/trip/hooks/useTripWorkspace.hook')

const COMPANY_ID = 'company-1'
const TRIP_ID = 'trip-1'
const DELIVERED_AT = '2026-10-01T12:00:00Z'

const SETTLED: FieldSettlementResult = {
  alreadySettled: false,
  document: { deliveredAt: DELIVERED_AT, id: 'document-1', status: 'delivered' },
  stopStatus: 'done',
  tripStatus: 'in_transit',
} as unknown as FieldSettlementResult

type Sent = Readonly<{ documentId: string; form: FormData; idempotencyKey: string }>

async function renderWorkspace() {
  return renderHook(() =>
    useTripWorkspace({
      companyId: COMPANY_ID,
      permissions: [TRIP_REPORT_ON_BEHALF_PERMISSION],
      tripId: TRIP_ID,
    }),
  )
}

/**
 * O falso espelha o que o `tripClient` monta de verdade (`FormData` só com `deliveredAt`), para o
 * teste provar que **nenhum arquivo** sai na baixa sem canhoto — o ponto inteiro da feature.
 */
function stubDeliver(sent: Sent[], failing: readonly string[] = []) {
  fakes.tripClient = {
    ...fakes.tripClient,
    fieldDeliverDocument: (input: {
      deliveredAt: string
      documentId: string
      driverId?: string
      idempotencyKey: string
      tripId: string
    }) => {
      const form = new FormData()
      form.set('deliveredAt', input.deliveredAt)
      if (input.driverId !== undefined) form.set('driverId', input.driverId)
      sent.push({ documentId: input.documentId, form, idempotencyKey: input.idempotencyKey })
      return failing.includes(input.documentId)
        ? Promise.reject(new Error('TRIP_DOCUMENT_NOT_IN_FIELD'))
        : Promise.resolve(SETTLED)
    },
  }
}

describe('a baixa de uma nota sem canhoto (spec 223 RF6)', () => {
  test('manda deliveredAt e nenhum arquivo, com chave de idempotência por nota', async () => {
    resetTripHookFakes([])
    const sent: Sent[] = []
    stubDeliver(sent)
    const rendered = await renderWorkspace()

    await rendered.result().fieldDeliverDocumentMutation.mutateAsync({
      deliveredAt: DELIVERED_AT,
      documentId: 'document-1',
      tripId: TRIP_ID,
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.form.get('deliveredAt')).toBe(DELIVERED_AT)
    expect(sent[0]?.form.get('file')).toBeNull()
    expect(sent[0]?.idempotencyKey).toBeString()
    rendered.unmount()
  })
})

describe('a baixa em massa sem canhoto (spec 223 RF7)', () => {
  test('uma requisição por nota, cada uma com a própria chave', async () => {
    resetTripHookFakes([])
    const sent: Sent[] = []
    stubDeliver(sent)
    const rendered = await renderWorkspace()

    const results = await rendered.result().batchFieldDeliverMutation.mutateAsync({
      deliveredAt: DELIVERED_AT,
      documentIds: ['document-1', 'document-2', 'document-3'],
      tripId: TRIP_ID,
    })

    expect(sent.map((item) => item.documentId)).toEqual(['document-1', 'document-2', 'document-3'])
    expect(new Set(sent.map((item) => item.idempotencyKey)).size).toBe(3)
    expect(results.every((result) => result.errorCode === null)).toBe(true)
    rendered.unmount()
  })

  test('a nota que falha não derruba as irmãs e volta identificada', async () => {
    resetTripHookFakes([])
    const sent: Sent[] = []
    stubDeliver(sent, ['document-2'])
    const rendered = await renderWorkspace()

    const results = await rendered.result().batchFieldDeliverMutation.mutateAsync({
      deliveredAt: DELIVERED_AT,
      documentIds: ['document-1', 'document-2', 'document-3'],
      tripId: TRIP_ID,
    })

    const failed = results.filter((result) => result.errorCode !== null)
    expect(sent).toHaveLength(3)
    expect(failed.map((result) => result.item)).toEqual(['document-2'])
    expect(failed[0]?.errorCode).toBe('TRIP_DOCUMENT_NOT_IN_FIELD')
    rendered.unmount()
  })

  test('sem trip.report-on-behalf nenhuma nota é enviada', async () => {
    resetTripHookFakes([])
    const sent: Sent[] = []
    stubDeliver(sent)
    const rendered = await renderHook(() =>
      useTripWorkspace({ companyId: COMPANY_ID, permissions: ['trip.manage'], tripId: TRIP_ID }),
    )

    const results = await rendered.result().batchFieldDeliverMutation.mutateAsync({
      deliveredAt: DELIVERED_AT,
      documentIds: ['document-1'],
      tripId: TRIP_ID,
    })

    expect(sent).toEqual([])
    expect(results[0]?.errorCode).toBe('TRIP_FORBIDDEN')
    rendered.unmount()
  })
})
