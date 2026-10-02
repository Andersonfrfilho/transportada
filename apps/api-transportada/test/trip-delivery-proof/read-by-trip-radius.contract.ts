/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 227 T5.2 (D6): a leitura dos comprovantes da viagem devolve o raio tolerado de pontualidade
 * ("longe do ponto") como dado, para o painel desenhar o círculo sem ler `settings.manage`. O raio é o
 * mesmo que o juiz da captura usa (`resolveProofPunctualitySettings`), lido da empresa do contexto.
 */
import { describe, expect, test } from 'bun:test'

import {
  readDeliveryProofsByTrip,
  type TripDeliveryProofRecord,
} from '../../src/trips/application/read-delivery-proof.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'

const RECORD: TripDeliveryProofRecord = {
  bucket: 'transportada',
  createdAt: '2026-09-25T12:00:00.000Z',
  documentId: '00000000-0000-4000-8000-0000000000d1',
  id: '00000000-0000-4000-8000-0000000000a1',
  kind: 'photo',
  lateRegistration: false,
  mimeType: 'image/jpeg',
  objectKey: 'companies/1/proofs/a1.jpg',
  receiverDocumentMasked: '',
  receiverName: 'Maria',
  receivedBy: null,
  receivedByDetail: null,
  thumbnail: null,
}

const downloads = {
  async createDownloadUrl() {
    return { expiresAt: '2026-09-25T12:05:00.000Z', url: 'https://bucket.example/a1.jpg?s=1' }
  },
}

function createDoubles(input: {
  readonly proofRadiusMeters: number
  readonly records: readonly TripDeliveryProofRecord[]
}) {
  const settingsCalls: object[] = []
  return {
    settingsCalls,
    read: () =>
      readDeliveryProofsByTrip({
        companyId: COMPANY_ID,
        downloads,
        repository: { findByTrip: async () => input.records },
        settings: {
          resolveProofPunctualitySettings: async (query) => {
            settingsCalls.push(query)
            return { proofRadiusMeters: input.proofRadiusMeters }
          },
        },
        tripId: TRIP_ID,
      }),
  }
}

describe('readDeliveryProofsByTrip devolve o raio (spec 227 T5.2)', () => {
  test('cada item leva o raio da empresa do contexto', async () => {
    const { read, settingsCalls } = createDoubles({
      proofRadiusMeters: 450,
      records: [RECORD, { ...RECORD, id: '00000000-0000-4000-8000-0000000000a2' }],
    })

    const views = await read()

    expect(views.map((view) => view.proofRadiusMeters)).toEqual([450, 450])
    expect(settingsCalls).toEqual([{ companyId: COMPANY_ID }])
  })

  test('viagem sem comprovante: lista vazia e a configuração nem é consultada', async () => {
    const { read, settingsCalls } = createDoubles({ proofRadiusMeters: 450, records: [] })

    expect(await read()).toEqual([])
    expect(settingsCalls).toEqual([])
  })

  test('raio que não é um número positivo sai ausente, nunca zero', async () => {
    for (const proofRadiusMeters of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { read } = createDoubles({ proofRadiusMeters, records: [RECORD] })

      const [view] = await read()

      expect(view).toBeDefined()
      expect(view).not.toHaveProperty('proofRadiusMeters')
    }
  })

  test('o raio é número no corpo, ao lado do restante, sem coordenada nem configuração inteira', async () => {
    const { read } = createDoubles({ proofRadiusMeters: 300, records: [RECORD] })

    const body = JSON.stringify(await read())

    expect(body).toContain('"proofRadiusMeters":300')
    expect(body).not.toContain('latitude')
    expect(body).not.toContain('longitude')
    expect(body).not.toContain('latePenaltyPoints')
    expect(body).not.toContain('proofWindowMinutes')
  })
})
