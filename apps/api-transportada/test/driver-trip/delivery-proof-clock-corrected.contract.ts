/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232 D4/D4b no caso de uso `attachDeliveryProof`. A flag de relógio corrigido nasce SÓ de
 * `resolveOccurredAt({ tappedAt: upload.capturedAt, clockOffsetMs, receivedAt: now }).kind ===
 * 'corrected'` — nunca de "o campo veio" — e a classificação recebe o `capturedAt` corrigido. Ter ou
 * não posição na entrega é decisão da política (D4b), não do caso de uso.
 */
import { describe, expect, it } from 'bun:test'

import {
  attachDeliveryProof,
  type AttachDeliveryProofInput,
  type DeliveryProofUpload,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import type { Coordinate } from '../../src/addresses/domain/coordinate-distance.js'
import { PROOF_PUNCTUALITY } from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import {
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from '../../src/shared/time.constant.js'
import {
  buildInput,
  buildWorld,
  COMPANY_ID,
  DELIVERED_AT,
  DRIVER_ID,
} from '../fixtures/delivery-proof-world.fixture.js'

const TRIP_ID = '00000000-0000-4000-8000-000000000007'
const DELIVERY_POSITION: Coordinate = { latitude: '-23.5500000', longitude: '-46.6300000' }
const PHOTO_AT_DELIVERY_PLACE = { ...DELIVERY_POSITION, accuracyMeters: 5 }

/** O aparelho está 2 h adiantado: o desvio (servidor − aparelho) é −2 h. */
const DEVICE_AHEAD_OFFSET_MS = -2 * MILLISECONDS_PER_HOUR
/** A foto foi tirada de verdade 10 min depois da entrega. */
const TRUE_PHOTO_AT = new Date(DELIVERED_AT.getTime() + 10 * MILLISECONDS_PER_MINUTE)
/** O que o aparelho adiantado carimba: entrega + 2 h 10 min — fora da janela se não for corrigido. */
const RAW_PHOTO_AT = new Date(TRUE_PHOTO_AT.getTime() - DEVICE_AHEAD_OFFSET_MS)

// O campo ainda não existe em DeliveryProofUpload; a interseção sai na T1.3.
type ClockCorrectedUpload = Partial<DeliveryProofUpload> & { readonly clockOffsetMs?: number }

function afterDelivery(milliseconds: number): Date {
  return new Date(DELIVERED_AT.getTime() + milliseconds)
}

function buildRequiredWorld(deliveryEventPosition: Coordinate | undefined = DELIVERY_POSITION) {
  const world = buildWorld({
    deliveredAt: DELIVERED_AT,
    ...(deliveryEventPosition === undefined ? {} : { deliveryEventPosition }),
  })
  const resolve = world.repository.resolveProofFieldSettings
  world.repository.resolveProofFieldSettings = async (query) => ({
    ...(await resolve(query)),
    cargo: 'required',
    photo: 'required',
  })
  return world
}

function attach(world: ReturnType<typeof buildWorld>, upload: ClockCorrectedUpload, now: Date) {
  return attachDeliveryProof(buildInput(world, upload, now))
}

/** A foto tirada na hora, com o desvio medido, em `kind` e `attachmentKey` à escolha. */
function correctedPhoto(overrides: ClockCorrectedUpload = {}): ClockCorrectedUpload {
  return {
    capturedAt: RAW_PHOTO_AT,
    clockOffsetMs: DEVICE_AHEAD_OFFSET_MS,
    position: PHOTO_AT_DELIVERY_PLACE,
    ...overrides,
  }
}

async function resolveOfficeTarget() {
  return resolveFieldTripTarget({
    companyId: COMPANY_ID,
    repository: {
      findTripCrew: async () => ({
        drivers: [{ driverId: DRIVER_ID, position: 1 }],
        tripId: TRIP_ID,
        tripStatus: 'in_transit',
      }),
    },
    target: { kind: 'trip', tripId: TRIP_ID },
  })
}

describe('caso de uso: foto julgada pelo relógio corrigido (spec 232 D4/D4b)', () => {
  const THIRTY_HOURS_LATER = afterDelivery(30 * MILLISECONDS_PER_HOUR)

  /** (a) CA1 de ponta a ponta: o caso de uso passa a flag e o `capturedAt` corrigido. */
  it('desvio válido, entrega com posição, foto recebida 30 h depois: on_time gravado', async () => {
    const world = buildRequiredWorld()

    const result = await attach(world, correctedPhoto(), THIRTY_HOURS_LATER)

    expect(result.punctuality).toBe(PROOF_PUNCTUALITY.onTime)
    expect(world.saved).toHaveLength(1)
    expect(world.saved[0]?.punctuality).toBe(PROOF_PUNCTUALITY.onTime)
  })

  /**
   * (b) A flag não é "o campo veio": hora corrigida 31 h 10 min depois da entrega, recebida 30 h
   * depois, está no futuro — a correção é descartada e o piso de 24 h vale.
   */
  it('desvio presente mas hora corrigida no futuro: correção descartada, late', async () => {
    const world = buildRequiredWorld()

    const result = await attach(
      world,
      correctedPhoto({ capturedAt: TRUE_PHOTO_AT, clockOffsetMs: 31 * MILLISECONDS_PER_HOUR }),
      THIRTY_HOURS_LATER,
    )

    expect(result.punctuality).toBe(PROOF_PUNCTUALITY.late)
  })

  /** (c) Idem com a hora corrigida mais de 30 dias antes do recebimento. */
  it('desvio presente mas hora corrigida com mais de 30 dias: correção descartada, late', async () => {
    const world = buildRequiredWorld()

    const result = await attach(
      world,
      correctedPhoto({ capturedAt: TRUE_PHOTO_AT, clockOffsetMs: -40 * MILLISECONDS_PER_DAY }),
      THIRTY_HOURS_LATER,
    )

    expect(result.punctuality).toBe(PROOF_PUNCTUALITY.late)
  })

  /** (d) CA2 de ponta a ponta: cliente antigo, sem o desvio, continua com o piso de 24 h. */
  it('sem desvio, a mesma foto recebida 30 h depois continua late', async () => {
    const world = buildRequiredWorld()

    const result = await attach(
      world,
      { capturedAt: TRUE_PHOTO_AT, position: PHOTO_AT_DELIVERY_PLACE },
      THIRTY_HOURS_LATER,
    )

    expect(result.punctuality).toBe(PROOF_PUNCTUALITY.late)
  })

  /** (e) Spec 159 T11 (ALTO 2): o escritório nunca classifica — a D4 não se aplica a ele. */
  it('canal office com desvio continua not_required', async () => {
    const world = buildRequiredWorld()
    const base = buildInput(world, correctedPhoto(), THIRTY_HOURS_LATER)
    const officeInput: AttachDeliveryProofInput = {
      actorUserId: base.actorUserId,
      companyId: base.companyId,
      documentId: base.documentId,
      newObjectId: base.newObjectId,
      newProofId: base.newProofId,
      now: base.now,
      repository: base.repository,
      sealDocument: base.sealDocument,
      storage: base.storage,
      target: await resolveOfficeTarget(),
      upload: base.upload,
    }

    const result = await attachDeliveryProof(officeInput)

    expect(result.punctuality).toBe(PROOF_PUNCTUALITY.notRequired)
  })

  /** (f) Spec 220 RF10: a foto da mercadoria do motorista entra na nota e também é corrigida. */
  it('foto da mercadoria com desvio válido, recebida 30 h depois, é on_time', async () => {
    const world = buildRequiredWorld()

    const result = await attach(world, correctedPhoto({ kind: 'cargo' }), THIRTY_HOURS_LATER)

    expect(result.punctuality).toBe(PROOF_PUNCTUALITY.onTime)
    expect(world.saved[0]?.punctuality).toBe(PROOF_PUNCTUALITY.onTime)
  })

  /**
   * (g) Spec 159 T11 D3b: a foto corrigida e pontual que substitui uma `late` já gravada não lava o
   * atraso — a fusão continua valendo com a flag.
   */
  it('canhoto substituto com relógio corrigido depois de um late continua late', async () => {
    const world = buildRequiredWorld()
    const lateAt = afterDelivery(2 * MILLISECONDS_PER_HOUR)

    const first = await attach(
      world,
      { attachmentKey: 'first', capturedAt: lateAt, position: PHOTO_AT_DELIVERY_PLACE },
      lateAt,
    )
    const second = await attach(
      world,
      correctedPhoto({ attachmentKey: 'second' }),
      THIRTY_HOURS_LATER,
    )

    expect(first.punctuality).toBe(PROOF_PUNCTUALITY.late)
    expect(second.punctuality).toBe(PROOF_PUNCTUALITY.late)
    expect(world.saved.map((proof) => proof.punctuality)).toEqual([
      PROOF_PUNCTUALITY.late,
      PROOF_PUNCTUALITY.late,
    ])
  })

  /** (h) Reenvio com a mesma chave devolve o veredito gravado — o desvio não reclassifica. */
  it('reenvio com a mesma attachmentKey e desvio devolve o veredito gravado sem reclassificar', async () => {
    const world = buildRequiredWorld()
    world.repository.findProofIdByAttachmentKey = async () => ({
      id: 'proof-existing',
      punctuality: PROOF_PUNCTUALITY.late,
    })

    const result = await attach(
      world,
      correctedPhoto({ attachmentKey: 'retry-1' }),
      THIRTY_HOURS_LATER,
    )

    expect(result).toEqual({ id: 'proof-existing', punctuality: PROOF_PUNCTUALITY.late })
    expect(world.saved).toHaveLength(0)
    expect(world.stored).toHaveLength(0)
  })

  /** (i) Até a T1.5 decidir onde guardar o desvio, a persistência recebe a hora crua do aparelho. */
  it('saveProof recebe o capturedAt cru do aparelho, não o corrigido', async () => {
    const world = buildRequiredWorld()

    await attach(world, correctedPhoto(), THIRTY_HOURS_LATER)

    expect(world.saved[0]?.capturedAt).toEqual(RAW_PHOTO_AT)
  })

  describe('entrega sem posição (D4b): o caso de uso passa a flag, a política decide', () => {
    /** (j) Recebida 30 min depois: a referência é o recebimento (no prazo), e a entrega conta como longe. */
    it('desvio válido, recebida 30 min depois da entrega: away', async () => {
      const world = buildRequiredWorld(undefined)

      const result = await attach(
        world,
        correctedPhoto(),
        afterDelivery(30 * MILLISECONDS_PER_MINUTE),
      )

      expect(result.punctuality).toBe(PROOF_PUNCTUALITY.away)
    })

    it('desvio válido, recebida 61 min depois da entrega: late_and_away', async () => {
      const world = buildRequiredWorld(undefined)

      const result = await attach(
        world,
        correctedPhoto(),
        afterDelivery(61 * MILLISECONDS_PER_MINUTE),
      )

      expect(result.punctuality).toBe(PROOF_PUNCTUALITY.lateAndAway)
    })

    /** Espelho: sem o desvio (cliente antigo), a distância segue sem pesar — comportamento de hoje. */
    it('sem desvio, recebida 30 min depois da entrega: on_time', async () => {
      const world = buildRequiredWorld(undefined)

      const result = await attach(
        world,
        { capturedAt: TRUE_PHOTO_AT, position: PHOTO_AT_DELIVERY_PLACE },
        afterDelivery(30 * MILLISECONDS_PER_MINUTE),
      )

      expect(result.punctuality).toBe(PROOF_PUNCTUALITY.onTime)
    })
  })
})
