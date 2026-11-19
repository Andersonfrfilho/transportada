/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T201 (RF1/RF3): o detalhe de uma ocorrência — a forma da listagem, mais o bloco do
 * motorista. O caso de uso só escopa pela empresa do contexto e transforma "não achei" em 404; a
 * leitura das duas fontes (nota e parada) é da query, provada contra Postgres na T202.
 */
import { describe, expect, test } from 'bun:test'

import { createReadTripOccurrenceDetailUseCase } from '../../src/trips/application/read-trip-occurrence-detail.use-case.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import { OCCURRENCE_DETAIL } from '../fixtures/trip-occurrence-detail.fixture.js'

const OCCURRENCE_ID = OCCURRENCE_DETAIL.id

const COMPANY_ID = '00000000-0000-4000-8000-00000000c001'

describe('detalhe da ocorrência — caso de uso (spec 183 T201)', () => {
  test('lê pela empresa do contexto, nunca por outra', async () => {
    const calls: unknown[] = []
    const useCase = createReadTripOccurrenceDetailUseCase({
      reader: {
        findDetail: async (input) => {
          calls.push(input)
          return { ...OCCURRENCE_DETAIL, receivingCharge: null }
        },
      },
    })

    const detail = await useCase.execute({
      context: { companyId: COMPANY_ID },
      occurrenceId: OCCURRENCE_ID,
    })

    expect(detail).toEqual({ ...OCCURRENCE_DETAIL, receivingCharge: null })
    expect(calls).toEqual([{ companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID }])
  })

  test('inexistente e de outra empresa respondem igual: 404 TRIP_OCCURRENCE_NOT_FOUND', async () => {
    const useCase = createReadTripOccurrenceDetailUseCase({
      reader: { findDetail: async () => null },
    })

    const attempt = useCase.execute({
      context: { companyId: COMPANY_ID },
      occurrenceId: OCCURRENCE_ID,
    })

    expect(attempt).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)
  })

  describe('cobrança no recebimento (placa, extrato e PIX do motorista)', () => {
    const SOURCE = {
      declaredAmount: '50,00',
      driverPayoutReceipt: {
        bucket: 'b',
        fileName: 'pix.jpg',
        objectKey: 'k/pix',
        sentAt: '2026-11-17T19:00:00.000Z',
      },
      driverPix: { key: '16993056772', type: 'phone' as const },
      paidBy: 'driver' as const,
      photos: [
        { bucket: 'b', label: 'Placa do veículo', objectKey: 'k/placa', slotKey: 'plate' },
        {
          bucket: 'b',
          label: 'Extrato do pagamento',
          objectKey: 'k/extrato',
          slotKey: 'payment_receipt',
        },
      ],
    }
    const downloads = {
      createDownloadUrl: async (location: { readonly objectKey: string }) => ({
        expiresAt: '2026-11-17T20:00:00.000Z',
        url: `https://signed.example/${location.objectKey}`,
      }),
    }
    const build = (): ReturnType<typeof createReadTripOccurrenceDetailUseCase> =>
      createReadTripOccurrenceDetailUseCase({
        downloads,
        reader: {
          findDetail: async () => ({ ...OCCURRENCE_DETAIL, receivingCharge: SOURCE }),
        },
      })

    test('com trip.financials mostra o PIX e assina as fotos das vagas', async () => {
      const detail = await build().execute({
        context: { companyId: COMPANY_ID },
        includeFinancials: true,
        occurrenceId: OCCURRENCE_ID,
      })

      expect(detail.receivingCharge?.driverPix).toEqual({ key: '16993056772', type: 'phone' })
      expect(detail.receivingCharge?.driverPayoutReceipt).toEqual({
        expiresAt: '2026-11-17T20:00:00.000Z',
        fileName: 'pix.jpg',
        sentAt: '2026-11-17T19:00:00.000Z',
        url: 'https://signed.example/k/pix',
      })
      expect(detail.receivingCharge?.photos.map((photo) => [photo.slotKey, photo.url])).toEqual([
        ['plate', 'https://signed.example/k/placa'],
        ['payment_receipt', 'https://signed.example/k/extrato'],
      ])
    })

    test('sem trip.financials o PIX some, e a foto e o valor continuam', async () => {
      const detail = await build().execute({
        context: { companyId: COMPANY_ID },
        occurrenceId: OCCURRENCE_ID,
      })

      expect(detail.receivingCharge?.driverPix).toBeNull()
      expect(detail.receivingCharge?.driverPayoutReceipt).toBeNull()
      expect(detail.receivingCharge?.paidBy).toBe('driver')
      expect(detail.receivingCharge?.declaredAmount).toBe('50,00')
      expect(detail.receivingCharge?.photos).toHaveLength(2)
    })
  })
})
