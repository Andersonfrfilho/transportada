/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (T9–T10): o painel conhece `receiving_charge` (senão lança erro na primeira linha), lê fotos e PIX com
 * tolerância, lê a marca do cliente e envia o comprovante do PIX pelo chat antes de concluir.
 */
import { describe, expect, it } from 'bun:test'

import chargesEnLocale from '@/modules/extra-charges/locales/extraCharges.en.locale.json'
import chargesLocale from '@/modules/extra-charges/locales/extraCharges.locale.json'
import { DELIVERY_CHARGE_TYPES } from '@/modules/extra-charges/shared/extraCharges.types'
import { toOccurrenceChargeReportPage } from '@/modules/extra-charges/shared/extraChargesResponse.validation'
import { toReceivingChargeFlag } from '@/modules/delivery-clients/shared/deliveryClientReceivingChargeFlag.service'
import { sendDriverPayoutReceipt } from '@/modules/trip/shared/driverPayoutReceipt.service'

function payload(rowOverrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        accessKey: null,
        amount: '120.50',
        chargeType: 'receiving_charge',
        chargedOn: '2026-11-10',
        contractorId: 'contractor-1',
        hasSettlement: false,
        id: 'row-1',
        noteNumber: '10',
        noteSeries: '1',
        occurrenceId: null,
        photos: [
          {
            expiresAt: '2026-11-10T12:05:00Z',
            label: 'Placa de cobrança',
            slotKey: 'charge_sign',
            url: 'https://storage.example/a',
          },
          { label: 'sem url', slotKey: 'x' },
        ],
        receivingCharge: {
          driverPayoutSentAt: null,
          driverPixKey: 'a@b.com',
          driverPixKeyType: 'email',
          paidBy: 'driver',
        },
        status: 'recorded',
        stopOccurrenceId: 'stop-1',
        tripDocumentId: 'document-1',
        tripId: 'trip-1',
        ...rowOverrides,
      },
    ],
    page: { nextCursor: null },
    totals: {
      byChargeType: [{ amount: '120.50', chargeType: 'receiving_charge', count: 1 }],
      totalAmount: '120.50',
      totalCount: 1,
    },
  }
}

describe('Ressarcimentos conhece a cobrança no recebimento (spec 317 T9)', () => {
  it('aceita o tipo no vocabulário e traduz nos dois idiomas', () => {
    expect(DELIVERY_CHARGE_TYPES).toContain('receiving_charge')
    expect(chargesLocale.chargeType.receiving_charge).toBe('Cobrança no recebimento')
    expect(chargesEnLocale.chargeType.receiving_charge.length).toBeGreaterThan(0)
  })

  it('lê fotos rotuladas, PIX e os ids da viagem e da ocorrência; descarta foto malformada', () => {
    const [row] = toOccurrenceChargeReportPage(payload()).items
    expect(row?.chargeType).toBe('receiving_charge')
    expect(row?.photos).toEqual([
      {
        expiresAt: '2026-11-10T12:05:00Z',
        label: 'Placa de cobrança',
        slotKey: 'charge_sign',
        url: 'https://storage.example/a',
      },
    ])
    expect(row?.receivingCharge?.paidBy).toBe('driver')
    expect(row?.receivingCharge?.driverPixKey).toBe('a@b.com')
    expect(row?.stopOccurrenceId).toBe('stop-1')
    expect(row?.tripId).toBe('trip-1')
  })

  it('tolera resposta sem os campos novos (API antiga) e linha de nota', () => {
    const body = payload({ chargeType: 'unloading' })
    const raw = body.data[0] as Record<string, unknown>
    for (const key of ['photos', 'receivingCharge', 'stopOccurrenceId', 'tripId']) delete raw[key]
    const [row] = toOccurrenceChargeReportPage(body).items
    expect(row?.photos).toEqual([])
    expect(row?.receivingCharge).toBeNull()
    expect(row?.stopOccurrenceId).toBeNull()
  })
})

describe('marca do cliente (spec 317 T10)', () => {
  it('lê a marca e a ausência dela', () => {
    expect(
      toReceivingChargeFlag({
        data: { flaggedAt: '2026-11-10T10:00:00Z', sourceStopOccurrenceId: 'stop-1' },
      }),
    ).toEqual({ flaggedAt: '2026-11-10T10:00:00Z', sourceStopOccurrenceId: 'stop-1' })
    expect(
      toReceivingChargeFlag({ data: { flaggedAt: null, sourceStopOccurrenceId: null } }),
    ).toEqual({ flaggedAt: null, sourceStopOccurrenceId: null })
    expect(() => toReceivingChargeFlag({})).toThrow()
  })
})

type ReceiptClient = Parameters<typeof sendDriverPayoutReceipt>[0]['client']

function fakeClient(input: {
  conversationMessageId: null | string
  messages: readonly { attachments: readonly { id: string }[]; direction: string; id: string }[]
}): ReceiptClient {
  return {
    listConversations: () =>
      Promise.resolve({
        contractorPortal: { available: false },
        conversations: [
          {
            id: 'c1',
            messages: input.messages,
            participant: 'driver',
            status: 'open',
            unreadCount: 0,
          },
        ],
      }),
    putConversationUpload: () => Promise.resolve(),
    requestConversationUpload: () =>
      Promise.resolve({ uploadId: 'upload-1', uploadUrl: 'https://u' }),
    sendDriverAppMessage: () =>
      Promise.resolve({ conversationMessageId: input.conversationMessageId }),
  } as unknown as ReceiptClient
}

const receiptFile = new File(['x'], 'pix.png', { type: 'image/png' })

describe('comprovante do PIX (spec 317 T10, E13)', () => {
  it('devolve o id do anexo da mensagem enviada ao motorista', async () => {
    const id = await sendDriverPayoutReceipt({
      body: 'Comprovante do PIX',
      client: fakeClient({
        conversationMessageId: 'm2',
        messages: [
          { attachments: [{ id: 'old' }], direction: 'outbound', id: 'm1' },
          { attachments: [{ id: 'att-9' }], direction: 'outbound', id: 'm2' },
        ],
      }),
      file: receiptFile,
      idempotencyKey: 'k',
      occurrenceId: 'stop-1',
    })
    expect(id).toBe('att-9')
  })

  it('devolve null quando a mensagem não aparece — a conclusão segue sem comprovante', async () => {
    const id = await sendDriverPayoutReceipt({
      body: 'Comprovante do PIX',
      client: fakeClient({ conversationMessageId: 'm9', messages: [] }),
      file: receiptFile,
      idempotencyKey: 'k',
      occurrenceId: 'stop-1',
    })
    expect(id).toBeNull()
  })
})
