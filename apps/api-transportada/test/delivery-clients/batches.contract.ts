/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  DeliveryCharge,
  DeliveryChargeRepositoryPort,
} from '../../src/delivery-clients/application/delivery-charge.port.js'
import type {
  ExtraChargeBatch,
  ExtraChargeBatchReport,
  ExtraChargeBatchRepositoryPort,
} from '../../src/delivery-clients/application/extra-charge-batch.port.js'
import { createExtraChargeBatchesUseCase } from '../../src/delivery-clients/application/extra-charge-batches.use-case.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000003'
const BATCH_ID = '00000000-0000-4000-8000-000000000004'
const CHARGE_ID = '00000000-0000-4000-8000-000000000005'
const OTHER_CHARGE_ID = '00000000-0000-4000-8000-000000000006'
const TOKEN = 'token-opaco-de-trinta-e-dois-bytes-ou-mais'

const CONTEXT = {
  companyId: COMPANY_ID,
  userId: USER_ID,
} as unknown as CompanyContext

const BATCH: ExtraChargeBatch = {
  closedAt: '2026-09-01T12:00:00.000Z',
  contractorId: CONTRACTOR_ID,
  id: BATCH_ID,
  periodEnd: '2026-08-31',
  periodStart: '2026-08-01',
  status: 'submitted',
  totalAmount: '135.0000',
}

const REPORT: ExtraChargeBatchReport = {
  batch: BATCH,
  contractorName: 'Spani Atacadista',
  items: [],
  itemsTotal: '135.0000',
}

function buildWorld(
  overrides: {
    readonly charge?: DeliveryCharge | null
    readonly closed?: ExtraChargeBatch | null
  } = {},
) {
  const transitions: unknown[] = []
  const closes: unknown[] = []

  const charges: DeliveryChargeRepositoryPort = {
    async findById() {
      return overrides.charge === undefined
        ? ({
            amount: '45.0000',
            batchId: BATCH_ID,
            chargedOn: '2026-08-10',
            chargeType: 'unloading',
            contractorId: CONTRACTOR_ID,
            deliveryClientId: '00000000-0000-4000-8000-000000000007',
            id: CHARGE_ID,
            notes: '',
            origin: 'manual',
            rejectionReason: '',
            status: 'submitted',
            tripDocumentId: null,
            tripId: null,
          } satisfies DeliveryCharge)
        : overrides.charge
    },
    async findChargeParties() {
      return null
    },
    async insert() {
      return null
    },
    async list() {
      return { items: [], nextCursor: null }
    },
    async transition(input) {
      transitions.push(structuredClone(input))
      return null
    },
  }

  const batches: ExtraChargeBatchRepositoryPort = {
    async close(input) {
      closes.push(structuredClone(input))
      return overrides.closed === undefined ? BATCH : overrides.closed
    },
    async findByToken(input) {
      return input.accessToken === TOKEN ? { batchId: BATCH_ID, companyId: COMPANY_ID } : null
    },
    async readReport() {
      return REPORT
    },
    async rotateToken() {},
  }

  return {
    closes,
    transitions,
    useCase: createExtraChargeBatchesUseCase({
      batches,
      charges,
      createToken: () => TOKEN,
    }),
  }
}

describe('o lote de repasse (spec 060 T011)', () => {
  test('fecha o período do contratante com um token novo', async () => {
    const world = buildWorld()

    const batch = await world.useCase.close({
      context: CONTEXT,
      contractorId: CONTRACTOR_ID,
      periodEnd: '2026-08-31',
      periodStart: '2026-08-01',
    })

    expect(batch).toEqual(BATCH)
    expect(world.closes).toEqual([
      {
        accessToken: TOKEN,
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        contractorId: CONTRACTOR_ID,
        periodEnd: '2026-08-31',
        periodStart: '2026-08-01',
      },
    ])
  })

  /** Lote vazio nasceria, seria enviado e voltaria sem nada — e o link não diria nada ao contratante. */
  test('recusa fechar período sem nada a cobrar', async () => {
    const world = buildWorld({ closed: null })

    await expect(
      world.useCase.close({
        context: CONTEXT,
        contractorId: CONTRACTOR_ID,
        periodEnd: '2026-08-31',
        periodStart: '2026-08-01',
      }),
    ).rejects.toMatchObject({ code: 'EXTRA_CHARGE_BATCH_EMPTY', status: 422 })
  })

  test('aprova e rejeita por lançamento, e a rejeição carrega o motivo', async () => {
    const world = buildWorld()

    await world.useCase.decide({
      batchId: BATCH_ID,
      context: CONTEXT,
      decisions: [{ chargeId: CHARGE_ID, decision: 'rejected', reason: 'sem comprovante' }],
    })

    expect(world.transitions).toEqual([
      {
        actorUserId: USER_ID,
        companyId: COMPANY_ID,
        eventName: 'rejected',
        id: CHARGE_ID,
        rejectionReason: 'sem comprovante',
        status: 'rejected',
      },
    ])
  })

  /**
   * ADR-0048 §7: quem decidiu pela página pública é **um token**, nunca um `userId` inventado. A
   * pergunta "quem aprovou isso?" se responde com "quem estava com o link do lote".
   */
  test('a decisão por token grava o token na trilha, e nenhum ator', async () => {
    const world = buildWorld()

    await world.useCase.decideByToken({
      accessToken: TOKEN,
      decisions: [{ chargeId: CHARGE_ID, decision: 'approved', reason: '' }],
    })

    expect(world.transitions).toEqual([
      {
        actorUserId: null,
        companyId: COMPANY_ID,
        decidedByToken: TOKEN,
        eventName: 'approved',
        id: CHARGE_ID,
        status: 'approved',
      },
    ])
  })

  test('token desconhecido não abre lote nenhum', async () => {
    const world = buildWorld()

    await expect(
      world.useCase.readReportByToken({ accessToken: 'token-de-mentira' }),
    ).rejects.toMatchObject({ code: 'EXTRA_CHARGE_BATCH_NOT_FOUND' })
  })

  /**
   * Lançamento de outro lote é **ignorado**, não recusado: id trocado é engano de quem montou a
   * requisição, e não é motivo para derrubar as outras trinta e sete decisões.
   */
  test('decisão sobre lançamento de outro lote não derruba as demais', async () => {
    const world = buildWorld({
      charge: {
        amount: '45.0000',
        batchId: '00000000-0000-4000-8000-0000000000ff',
        chargedOn: '2026-08-10',
        chargeType: 'unloading',
        contractorId: CONTRACTOR_ID,
        deliveryClientId: '00000000-0000-4000-8000-000000000007',
        id: OTHER_CHARGE_ID,
        notes: '',
        origin: 'manual',
        rejectionReason: '',
        status: 'submitted',
        tripDocumentId: null,
        tripId: null,
      },
    })

    const report = await world.useCase.decide({
      batchId: BATCH_ID,
      context: CONTEXT,
      decisions: [{ chargeId: OTHER_CHARGE_ID, decision: 'approved', reason: '' }],
    })

    expect(world.transitions).toEqual([])
    expect(report).toEqual(REPORT)
  })

  /** Cada lançamento tem estado próprio: o lote fica parcialmente aprovado, nunca travado. */
  test('o lançamento já decidido não muda de novo', async () => {
    const world = buildWorld({
      charge: {
        amount: '45.0000',
        batchId: BATCH_ID,
        chargedOn: '2026-08-10',
        chargeType: 'unloading',
        contractorId: CONTRACTOR_ID,
        deliveryClientId: '00000000-0000-4000-8000-000000000007',
        id: CHARGE_ID,
        notes: '',
        origin: 'manual',
        rejectionReason: '',
        status: 'approved',
        tripDocumentId: null,
        tripId: null,
      },
    })

    await world.useCase.decide({
      batchId: BATCH_ID,
      context: CONTEXT,
      decisions: [{ chargeId: CHARGE_ID, decision: 'rejected', reason: 'mudei de ideia' }],
    })

    expect(world.transitions).toEqual([])
  })
})
