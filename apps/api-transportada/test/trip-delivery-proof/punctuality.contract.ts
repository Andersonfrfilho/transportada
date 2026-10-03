/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  attachDeliveryProof,
  type DeliveryProofPort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { TripDeliveryProofCargoLimitError } from '../../src/trips/domain/trip-field-office.error.js'
import {
  classifyProofPunctuality,
  mergeProofPunctuality,
  type ProofPunctuality,
} from '../../src/trips/domain/delivery-proof-punctuality.policy.js'

const DELIVERED_AT = new Date('2026-09-18T12:00:00.000Z')
const RECEIVED_AT = new Date('2026-09-18T12:15:00.000Z')
const DELIVERY_EVENT_POSITION = { latitude: '-23.550520', longitude: '-46.633308' }

describe('classificação da pontualidade da foto (spec 159 RF4-RF6)', () => {
  test('não exige quando o modo não é required', () => {
    expect(
      classifyProofPunctuality({
        capturedAt: undefined,
        deliveredAt: DELIVERED_AT,
        deliveryEventPosition: undefined,
        photoMode: 'optional',
        photoPosition: undefined,
        proofRadiusMeters: 300,
        proofWindowMinutes: 60,
        missingAfterHours: 24,
        receivedAt: RECEIVED_AT,
      }),
    ).toBe('not_required')

    expect(
      classifyProofPunctuality({
        capturedAt: undefined,
        deliveredAt: DELIVERED_AT,
        deliveryEventPosition: undefined,
        photoMode: 'off',
        photoPosition: undefined,
        proofRadiusMeters: 300,
        proofWindowMinutes: 60,
        missingAfterHours: 24,
        receivedAt: RECEIVED_AT,
      }),
    ).toBe('not_required')
  })

  /** Aceite 3: 100 m e 10 min depois da entrega — dentro da janela (60) e do raio (300). */
  test('pontual: perto e dentro da janela', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: { accuracyMeters: 10, latitude: '-23.551430', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
    })

    expect(result).toBe('on_time')
  })

  /** Aceite 4: 2h depois com janela 60 → late. */
  test('tardia: referência mais de proofWindowMinutes depois da entrega', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T14:00:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: {
        latitude: DELIVERY_EVENT_POSITION.latitude,
        longitude: DELIVERY_EVENT_POSITION.longitude,
      },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T14:00:05.000Z'),
    })

    expect(result).toBe('late')
  })

  /** Aceite 4: 2 km de distância com raio 300 → away. */
  test('longe: distância maior que o raio mais a precisão', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: { latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
    })

    expect(result).toBe('away')
  })

  /** Aceite 4: sem posição da foto → away, mesmo dentro da janela. */
  test('sem posição da foto conta como longe', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: undefined,
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
    })

    expect(result).toBe('away')
  })

  test('tardia e longe combinam em late_and_away', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T15:00:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: { latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T15:00:05.000Z'),
    })

    expect(result).toBe('late_and_away')
  })

  /** RF5: capturedAt no futuro é limitado ao recebimento + 2 min, nunca recusado. */
  test('capturedAt no futuro é limitado pela folga de 2 minutos', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-19T12:00:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: {
        latitude: DELIVERY_EVENT_POSITION.latitude,
        longitude: DELIVERY_EVENT_POSITION.longitude,
      },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: RECEIVED_AT,
    })

    // referência vira RECEIVED_AT + 2min = 12:17, 17 min depois da entrega: dentro da janela de 60
    expect(result).toBe('on_time')
  })

  /** RF5: capturedAt antes da entrega é limitado a deliveredAt − 2 min. */
  test('capturedAt antes da entrega é limitado pela folga de 2 minutos', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T10:00:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: {
        latitude: DELIVERY_EVENT_POSITION.latitude,
        longitude: DELIVERY_EVENT_POSITION.longitude,
      },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: RECEIVED_AT,
    })

    // referência vira DELIVERED_AT − 2min, antes da entrega: diferença negativa, não é tardia
    expect(result).toBe('on_time')
  })

  /**
   * RF6 (emenda 2026-09-25 da ADR-0070): a referência do raio é onde o motorista deu a baixa, não o
   * pino geocodificado da parada — a foto prova que foi tirada onde a entrega foi registrada.
   */
  test('a referência do raio é a posição do evento de entrega', () => {
    const away = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: { latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
    })

    expect(away).toBe('away')

    const onTime = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: {
        latitude: DELIVERY_EVENT_POSITION.latitude,
        longitude: DELIVERY_EVENT_POSITION.longitude,
      },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
    })

    expect(onTime).toBe('on_time')
  })

  /** RF6: evento de entrega sem coordenada não dá referência, e a distância não pesa. */
  test('sem referência nenhuma de local, a distância não julga', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: undefined,
      photoMode: 'required',
      photoPosition: { latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
    })

    expect(result).toBe('on_time')
  })

  /** RF6: a precisão soma ao raio — 320 m de distância com precisão 50 e raio 300 ainda é on_time. */
  test('a precisão da foto soma ao raio', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      photoMode: 'required',
      photoPosition: { accuracyMeters: 50, latitude: '-23.5534', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      missingAfterHours: 24,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
    })

    expect(result).toBe('on_time')
  })
})

/** Spec 159 T11: as duas brechas que a revisão achou no veredito da foto. */
describe('antifraude do veredito (spec 159 T11, D3a e item 4)', () => {
  /**
   * D3a: o aparelho diz que tirou a foto na hora da entrega, mas ela chegou 30 h depois. O relógio
   * dele só vale até `missingAfterHours` (24) antes do recebimento — a referência vira entrega + 6 h.
   */
  test('capturedAt antigo demais para o recebimento é limitado e vira late', () => {
    const receivedAt = new Date(DELIVERED_AT.getTime() + 30 * 60 * 60 * 1000)

    const result = classifyProofPunctuality({
      capturedAt: DELIVERED_AT,
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      missingAfterHours: 24,
      photoMode: 'required',
      photoPosition: DELIVERY_EVENT_POSITION,
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt,
    })

    expect(result).toBe('late')
  })

  test('capturedAt dentro do prazo de envio continua valendo', () => {
    const receivedAt = new Date(DELIVERED_AT.getTime() + 20 * 60 * 60 * 1000)

    const result = classifyProofPunctuality({
      capturedAt: new Date(DELIVERED_AT.getTime() + 10 * 60 * 1000),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      missingAfterHours: 24,
      photoMode: 'required',
      photoPosition: DELIVERY_EVENT_POSITION,
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt,
    })

    expect(result).toBe('on_time')
  })

  /** Item 4: precisão declarada de 5 km não transforma 2 km em "no local" — soma no máximo o raio. */
  test('precisão enorme soma no máximo um raio', () => {
    const result = classifyProofPunctuality({
      capturedAt: new Date('2026-09-18T12:10:00.000Z'),
      deliveredAt: DELIVERED_AT,
      deliveryEventPosition: DELIVERY_EVENT_POSITION,
      missingAfterHours: 24,
      photoMode: 'required',
      photoPosition: { accuracyMeters: 5000, latitude: '-23.568', longitude: '-46.633308' },
      proofRadiusMeters: 300,
      proofWindowMinutes: 60,
      receivedAt: new Date('2026-09-18T12:10:05.000Z'),
    })

    expect(result).toBe('away')
  })
})

/**
 * Spec 159 T11, decisão D3(b) do usuário: substituir a foto (upsert por evento+tipo) nunca melhora
 * a pontualidade gravada — fica a pior das duas, e `late` com `away` vira `late_and_away`. Sem isso,
 * a foto tardia seria "lavada" por uma segunda foto tirada depois no lugar certo.
 */
describe('substituição da foto fica com a pior pontualidade (spec 159 T11, D3b)', () => {
  const cases: ReadonlyArray<
    readonly [ProofPunctuality | undefined, ProofPunctuality, ProofPunctuality]
  > = [
    [undefined, 'on_time', 'on_time'],
    [undefined, 'late', 'late'],
    ['on_time', 'late', 'late'],
    ['late', 'on_time', 'late'],
    ['away', 'on_time', 'away'],
    ['late', 'late', 'late'],
    ['late', 'away', 'late_and_away'],
    ['away', 'late', 'late_and_away'],
    ['late_and_away', 'on_time', 'late_and_away'],
    ['on_time', 'not_required', 'on_time'],
    ['not_required', 'on_time', 'on_time'],
    ['not_required', 'not_required', 'not_required'],
    ['late', 'not_required', 'late'],
  ]

  for (const [previous, next, expected] of cases) {
    test(`${previous ?? 'sem foto'} + ${next} = ${expected}`, () => {
      expect(mergeProofPunctuality({ next, previous })).toBe(expected)
    })
  }
})

/**
 * Spec 220 RF10/RF12: a foto da mercadoria (`cargo`) passa pelo mesmo veredito da foto do
 * motorista, guiada por `settings.cargo`; o canal `office` continua fora (ADR-0070 §2-6).
 */
describe('o veredito alcança a foto da mercadoria (spec 220 RF10, RF12)', () => {
  const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
  const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
  const EVENT_ID = '00000000-0000-4000-8000-000000000005'
  const CARGO_DELIVERED_AT = new Date('2026-09-25T12:00:00.000Z')
  const DELIVERY_POSITION = { latitude: '-23.550520', longitude: '-46.633308' }
  const EIGHT_HUNDRED_METERS_AWAY = {
    accuracyMeters: 10,
    latitude: '-23.543320',
    longitude: '-46.633308',
  }

  function attachCargo(input: {
    readonly channel?: 'office'
    readonly settings: Partial<DeliveryProofFieldSettings>
  }) {
    const repository: DeliveryProofPort = {
      findDeliveryContext: async () => ({
        deliveredAt: CARGO_DELIVERED_AT,
        deliveryEventPosition: DELIVERY_POSITION,
        isDeliveryRecordedByDriver: true,
      }),
      findDeliveryEventId: async () => EVENT_ID,
      findProofIdByAttachmentKey: async () => null,
      countProofsForEvent: async () => 0,
      findProofPunctuality: async () => null,
      resolveProofFieldSettings: async () => ({
        ...DEFAULT_DELIVERY_PROOF_SETTINGS,
        ...input.settings,
      }),
      resolveProofPunctualitySettings: async () => DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
      saveProof: async () => ({ id: 'proof-1' }),
    }

    return attachDeliveryProof({
      actorUserId: '00000000-0000-4000-8000-000000000002',
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      driverId: '00000000-0000-4000-8000-000000000003',
      ...(input.channel === undefined ? {} : { channel: input.channel }),
      newObjectId: () => '00000000-0000-4000-8000-0000000000cc',
      newProofId: () => 'proof-1',
      now: new Date('2026-09-25T14:00:10.000Z'),
      repository,
      sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
      storage: { store: async () => ({ sha256: 'a'.repeat(64) }) },
      upload: {
        attachmentKey: '',
        bytes: new Uint8Array(16),
        capturedAt: new Date('2026-09-25T14:00:00.000Z'),
        kind: 'cargo',
        mimeType: 'image/jpeg',
        position: EIGHT_HUNDRED_METERS_AWAY,
        receiverDocument: '',
        receiverName: '',
      },
    })
  }

  test('mercadoria obrigatória, 800 m longe e 2 h depois, é tardia e longe', async () => {
    const proof = await attachCargo({ settings: { cargo: 'required' } })

    expect(proof.punctuality).toBe('late_and_away')
  })

  test('mercadoria enviada pelo escritório não é classificada', async () => {
    const proof = await attachCargo({ channel: 'office', settings: { cargo: 'required' } })

    expect(proof.punctuality).toBe('not_required')
  })

  test('mercadoria desligada na configuração não é classificada', async () => {
    const proof = await attachCargo({ settings: { cargo: 'off' } })

    expect(proof.punctuality).toBe('not_required')
  })
})

describe('cada foto da mercadoria guarda o próprio veredito (spec 220 RF10)', () => {
  const DELIVERED_AT = new Date('2026-09-25T12:00:00.000Z')
  const DELIVERY_POSITION = { latitude: '-23.550520', longitude: '-46.633308' }

  function attachOnTimeProof(input: {
    readonly kind: 'cargo' | 'photo'
    readonly previous: 'late' | 'late_and_away'
    readonly settings: Partial<DeliveryProofFieldSettings>
  }) {
    const repository: DeliveryProofPort = {
      findDeliveryContext: async () => ({
        deliveredAt: DELIVERED_AT,
        deliveryEventPosition: DELIVERY_POSITION,
        isDeliveryRecordedByDriver: true,
      }),
      findDeliveryEventId: async () => '00000000-0000-4000-8000-000000000005',
      findProofIdByAttachmentKey: async () => null,
      countProofsForEvent: async () => 0,
      findProofPunctuality: async () => input.previous,
      resolveProofFieldSettings: async () => ({
        ...DEFAULT_DELIVERY_PROOF_SETTINGS,
        ...input.settings,
      }),
      resolveProofPunctualitySettings: async () => DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
      saveProof: async () => ({ id: 'proof-1' }),
    }

    return attachDeliveryProof({
      actorUserId: '00000000-0000-4000-8000-000000000002',
      companyId: '00000000-0000-4000-8000-000000000001',
      documentId: '00000000-0000-4000-8000-000000000004',
      driverId: '00000000-0000-4000-8000-000000000003',
      newObjectId: () => '00000000-0000-4000-8000-0000000000cc',
      newProofId: () => 'proof-1',
      now: new Date('2026-09-25T12:10:10.000Z'),
      repository,
      sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
      storage: { store: async () => ({ sha256: 'a'.repeat(64) }) },
      upload: {
        attachmentKey: '',
        bytes: new Uint8Array(16),
        capturedAt: new Date('2026-09-25T12:10:00.000Z'),
        kind: input.kind,
        mimeType: 'image/jpeg',
        position: { accuracyMeters: 10, ...DELIVERY_POSITION },
        receiverDocument: '',
        receiverName: '',
      },
    })
  }

  test('a segunda foto da mercadoria, no lugar e na hora, não herda o tardia e longe da primeira', async () => {
    const proof = await attachOnTimeProof({
      kind: 'cargo',
      previous: 'late_and_away',
      settings: { cargo: 'required' },
    })

    expect(proof.punctuality).toBe('on_time')
  })

  test('a segunda foto da mercadoria, no lugar e na hora, não herda o tardia da primeira', async () => {
    const proof = await attachOnTimeProof({
      kind: 'cargo',
      previous: 'late',
      settings: { cargo: 'required' },
    })

    expect(proof.punctuality).toBe('on_time')
  })

  test('a foto que substitui a anterior continua herdando o veredito gravado', async () => {
    const proof = await attachOnTimeProof({
      kind: 'photo',
      previous: 'late',
      settings: { photo: 'required' },
    })

    expect(proof.punctuality).toBe('late')
  })
})

describe('o teto de cinco fotos da mercadoria vale para o motorista (spec 220 RF08)', () => {
  function attachWithCount(input: { readonly count: number; readonly kind: 'cargo' | 'photo' }) {
    const repository: DeliveryProofPort = {
      countProofsForEvent: async () => input.count,
      findDeliveryContext: async () => ({
        deliveredAt: new Date('2026-09-25T12:00:00.000Z'),
        deliveryEventPosition: undefined,
        isDeliveryRecordedByDriver: true,
      }),
      findDeliveryEventId: async () => '00000000-0000-4000-8000-000000000005',
      findProofIdByAttachmentKey: async () => null,
      findProofPunctuality: async () => null,
      resolveProofFieldSettings: async () => DEFAULT_DELIVERY_PROOF_SETTINGS,
      resolveProofPunctualitySettings: async () => DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
      saveProof: async () => ({ id: 'proof-1' }),
    }

    return attachDeliveryProof({
      actorUserId: '00000000-0000-4000-8000-000000000002',
      companyId: '00000000-0000-4000-8000-000000000001',
      documentId: '00000000-0000-4000-8000-000000000004',
      driverId: '00000000-0000-4000-8000-000000000003',
      newObjectId: () => '00000000-0000-4000-8000-0000000000cc',
      newProofId: () => 'proof-1',
      now: new Date('2026-09-25T12:10:10.000Z'),
      repository,
      sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
      storage: { store: async () => ({ sha256: 'a'.repeat(64) }) },
      upload: {
        attachmentKey: '',
        bytes: new Uint8Array(16),
        capturedAt: undefined,
        kind: input.kind,
        mimeType: 'image/jpeg',
        position: undefined,
        receiverDocument: '',
        receiverName: '',
      },
    })
  }

  test('a quinta foto da mercadoria entra', async () => {
    const proof = await attachWithCount({ count: 4, kind: 'cargo' })

    expect(proof.id).toBe('proof-1')
  })

  test('a sexta foto da mercadoria é recusada com o teto', async () => {
    const attempt = attachWithCount({ count: 5, kind: 'cargo' })

    await expect(attempt).rejects.toBeInstanceOf(TripDeliveryProofCargoLimitError)
    await expect(attempt).rejects.toMatchObject({
      code: 'TRIP_DELIVERY_PROOF_CARGO_LIMIT',
      status: 422,
    })
  })

  test('a foto do canhoto não passa pela contagem: ela substitui', async () => {
    const proof = await attachWithCount({ count: 99, kind: 'photo' })

    expect(proof.id).toBe('proof-1')
  })
})
