/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ChargeParties,
  DeliveryCharge,
  DeliveryChargeRepositoryPort,
  DeliveryChargeRule,
  DeliveryChargeRuleRepositoryPort,
} from '../../src/delivery-clients/application/delivery-charge.port.js'
import { createDeliveryChargesUseCase } from '../../src/delivery-clients/application/delivery-charges.use-case.js'
import { createSuggestDeliveryCharges } from '../../src/delivery-clients/application/suggest-delivery-charges.use-case.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const CLIENT_ID = '00000000-0000-4000-8000-000000000003'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000004'
const TRIP_DOCUMENT_ID = '00000000-0000-4000-8000-000000000005'
const CHARGE_ID = '00000000-0000-4000-8000-000000000006'

const CONTEXT = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-00000000000a',
  permissions: new Set(['trip.manage']),
  roles: ['operator'],
  userId: USER_ID,
} as unknown as CompanyContext

const PARTIES: ChargeParties = {
  contractorId: CONTRACTOR_ID,
  deliveryClientId: CLIENT_ID,
  tripId: '00000000-0000-4000-8000-000000000007',
}

function charge(overrides: Partial<DeliveryCharge> = {}): DeliveryCharge {
  return {
    amount: '45.0000',
    batchId: null,
    chargedOn: '2026-08-26',
    chargeType: 'unloading',
    contractorId: CONTRACTOR_ID,
    deliveryClientId: CLIENT_ID,
    id: CHARGE_ID,
    notes: '',
    origin: 'recurring',
    rejectionReason: '',
    status: 'suggested',
    tripDocumentId: TRIP_DOCUMENT_ID,
    tripId: PARTIES.tripId,
    ...overrides,
  }
}

function buildRepository(
  overrides: {
    readonly insertResult?: DeliveryCharge | null
    readonly parties?: ChargeParties | null
    readonly stored?: DeliveryCharge
  } = {},
) {
  const inserts: unknown[] = []
  const transitions: unknown[] = []

  const repository: DeliveryChargeRepositoryPort = {
    async findById() {
      return overrides.stored ?? charge()
    },
    async findChargeParties() {
      return overrides.parties === undefined ? PARTIES : overrides.parties
    },
    async insert(input) {
      inserts.push(structuredClone(input.charge))
      return overrides.insertResult === undefined ? charge() : overrides.insertResult
    },
    async list() {
      return { items: [], nextCursor: null }
    },
    async transition(input) {
      transitions.push(structuredClone(input))
      return charge({ status: input.status, ...(input.amount === undefined ? {} : { amount: input.amount }) })
    },
  }

  return { inserts, repository, transitions }
}

describe('o lançamento da taxa (spec 060 T010)', () => {
  /**
   * ADR-0048 §5: lançamento manual entra **direto em `recorded`** — obrigá-lo a passar por
   * confirmação seria pedir que a mesma pessoa confirmasse o que acabou de digitar.
   */
  test('o lançamento manual nasce registrado, com cliente e contratante vindos da nota', async () => {
    const { inserts, repository } = buildRepository()
    const useCase = createDeliveryChargesUseCase({ repository })

    await useCase.record({
      amount: '45.0000',
      chargedOn: '2026-08-20',
      chargeType: 'unloading',
      context: CONTEXT,
      notes: 'recibo 123',
      tripDocumentId: TRIP_DOCUMENT_ID,
    })

    expect(inserts).toEqual([
      {
        amount: '45.0000',
        chargeType: 'unloading',
        chargedOn: '2026-08-20',
        notes: 'recibo 123',
        origin: 'manual',
        parties: PARTIES,
        status: 'recorded',
        tripDocumentId: TRIP_DOCUMENT_ID,
      },
    ])
  })

  /** Data retroativa é o caso normal: o comprovante em papel volta com o motorista no fim do dia. */
  test('aceita data retroativa sem reclamar', async () => {
    const { inserts, repository } = buildRepository()
    const useCase = createDeliveryChargesUseCase({ repository })

    await useCase.record({
      amount: '45.0000',
      chargedOn: '2026-07-01',
      chargeType: 'scheduling',
      context: CONTEXT,
      notes: '',
      tripDocumentId: TRIP_DOCUMENT_ID,
    })

    expect((inserts[0] as { chargedOn: string }).chargedOn).toBe('2026-07-01')
  })

  /** Sem cliente de entrega não há a quem atribuir a taxa — e aí o problema é a nota, não o lançamento. */
  test('recusa lançar quando o destinatário não tem cadastro', async () => {
    const { repository } = buildRepository({ parties: null })
    const useCase = createDeliveryChargesUseCase({ repository })

    await expect(
      useCase.record({
        amount: '45.0000',
        chargedOn: '2026-08-20',
        chargeType: 'unloading',
        context: CONTEXT,
        notes: '',
        tripDocumentId: TRIP_DOCUMENT_ID,
      }),
    ).rejects.toMatchObject({ code: 'DELIVERY_CLIENT_NOT_FOUND' })
  })

  /** O valor é editável na conferência: o CD reajustou a taxa, e quem confere corrige na hora. */
  test('confirma em lote, com o valor corrigido por linha', async () => {
    const { repository, transitions } = buildRepository()
    const useCase = createDeliveryChargesUseCase({ repository })

    await useCase.confirm({
      charges: [{ amount: '52.0000', id: CHARGE_ID }, { id: CHARGE_ID }],
      context: CONTEXT,
    })

    expect(transitions).toEqual([
      {
        actorUserId: USER_ID,
        amount: '52.0000',
        companyId: COMPANY_ID,
        eventName: 'recorded',
        id: CHARGE_ID,
        status: 'recorded',
      },
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        eventName: 'recorded',
        id: CHARGE_ID,
        status: 'recorded',
      },
    ])
  })

  /** A trava da máquina chega até a rota: sugestão não vira lote sem passar por gente. */
  test('recusa transição que a máquina não permite', async () => {
    const { repository } = buildRepository({ stored: charge({ status: 'submitted' }) })
    const useCase = createDeliveryChargesUseCase({ repository })

    await expect(
      useCase.confirm({ charges: [{ id: CHARGE_ID }], context: CONTEXT }),
    ).rejects.toMatchObject({ code: 'DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED', status: 409 })
  })

  /** Repetir a confirmação converge: a rede caiu e o operador tocou duas vezes na mesma linha. */
  test('confirmar o que já está registrado é no-op', async () => {
    const { repository, transitions } = buildRepository({ stored: charge({ status: 'recorded' }) })
    const useCase = createDeliveryChargesUseCase({ repository })

    const [confirmed] = await useCase.confirm({ charges: [{ id: CHARGE_ID }], context: CONTEXT })

    expect(confirmed?.status).toBe('recorded')
    expect(transitions).toEqual([])
  })

  test('descartar guarda o motivo', async () => {
    const { repository, transitions } = buildRepository()
    const useCase = createDeliveryChargesUseCase({ repository })

    await useCase.dismiss({ context: CONTEXT, id: CHARGE_ID, reason: 'doca livre, não cobraram' })

    expect(transitions).toEqual([
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        eventName: 'dismissed',
        id: CHARGE_ID,
        rejectionReason: 'doca livre, não cobraram',
        status: 'dismissed',
      },
    ])
  })
})

describe('a regra que propõe sozinha (spec 060 D4b)', () => {
  function buildRules(rules: readonly DeliveryChargeRule[]): DeliveryChargeRuleRepositoryPort {
    return {
      async deactivate() {
        return true
      },
      async listActiveByClient() {
        return rules
      },
      async listByClient() {
        return rules
      },
      async upsert() {
        return rules[0] as DeliveryChargeRule
      },
    }
  }

  const RULE: DeliveryChargeRule = {
    active: true,
    chargeType: 'unloading',
    deliveryClientId: CLIENT_ID,
    expectedAmount: '45.0000',
    id: '00000000-0000-4000-8000-000000000008',
  }

  test('a entrega concluída propõe a taxa, e ela nasce sugerida', async () => {
    const { inserts, repository } = buildRepository()

    await createSuggestDeliveryCharges({
      charges: repository,
      logger: { warn() {} },
      rules: buildRules([RULE]),
    }).onDelivered({
      companyId: COMPANY_ID,
      deliveredOn: '2026-08-26',
      tripDocumentId: TRIP_DOCUMENT_ID,
    })

    expect(inserts).toEqual([
      {
        amount: '45.0000',
        chargeType: 'unloading',
        chargedOn: '2026-08-26',
        notes: '',
        origin: 'recurring',
        parties: PARTIES,
        status: 'suggested',
        tripDocumentId: TRIP_DOCUMENT_ID,
      },
    ])
  })

  test('cliente sem regra ligada não propõe nada', async () => {
    const { inserts, repository } = buildRepository()

    await createSuggestDeliveryCharges({
      charges: repository,
      logger: { warn() {} },
      rules: buildRules([]),
    }).onDelivered({
      companyId: COMPANY_ID,
      deliveredOn: '2026-08-26',
      tripDocumentId: TRIP_DOCUMENT_ID,
    })

    expect(inserts).toEqual([])
  })

  /**
   * O motorista está na porta do cliente: recusar a entrega porque a sugestão de taxa não gravou
   * seria trocar o essencial pelo acessório.
   */
  test('a falha da sugestão nunca desfaz a entrega', async () => {
    const warnings: unknown[] = []
    const repository: DeliveryChargeRepositoryPort = {
      ...buildRepository().repository,
      async findChargeParties() {
        throw new Error('banco fora')
      },
    }

    await createSuggestDeliveryCharges({
      charges: repository,
      logger: {
        warn(message) {
          warnings.push(message)
        },
      },
      rules: buildRules([RULE]),
    }).onDelivered({
      companyId: COMPANY_ID,
      deliveredOn: '2026-08-26',
      tripDocumentId: TRIP_DOCUMENT_ID,
    })

    expect(warnings).toEqual(['delivery_charge_suggestion_failed'])
  })
})
