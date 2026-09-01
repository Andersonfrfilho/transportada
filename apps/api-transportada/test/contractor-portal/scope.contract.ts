/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import {
  CONTRACTOR_DELIVERY_LIMIT,
  createReadContractorDeliveriesUseCase,
} from '../../src/contractor-portal/application/read-contractor-deliveries.use-case.js'
import { createContractorExtraChargesUseCase } from '../../src/contractor-portal/application/contractor-extra-charges.use-case.js'
import { createScheduleContractorDeliveryUseCase } from '../../src/contractor-portal/application/schedule-contractor-delivery.use-case.js'
import {
  ContractorBatchNotFoundError,
  ContractorDeliveryNotFoundError,
} from '../../src/contractor-portal/domain/contractor-portal.error.js'
import { ContractorNotBoundError } from '../../src/contractor-portal/domain/contractor-portal.error.js'
import type { ContractorPortalRepositoryPort } from '../../src/contractor-portal/application/contractor-portal.types.js'
import { resolveContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const CONTEXT: CompanyContext = {
  companyId: '00000000-0000-4000-8000-000000000001',
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-000000000002',
  permissions: new Set(['deliveries.track'] as const),
  roles: ['contractor'],
  userId: '00000000-0000-4000-8000-000000000003',
}

describe('o recorte do contratante (spec 063 T003)', () => {
  /** A forma canônica é sem máscara e em caixa alta — a mesma do resto do produto. */
  test('canonicaliza o documento do vínculo', () => {
    const scope = resolveContractorScope([
      { contractorId: 'c1', taxId: '12.abc.345/01de-35' },
      { contractorId: 'c2', taxId: '12345678901' },
    ])

    expect(scope.taxIds).toEqual(['12ABC34501DE35', '12345678901'])
    expect(scope.contractorIds).toEqual(['c1', 'c2'])
  })

  /** Uma conta responde por vários CNPJs do grupo; o mesmo documento duas vezes é um só. */
  test('deduplica o documento repetido', () => {
    const scope = resolveContractorScope([
      { contractorId: 'c1', taxId: '12345678901' },
      { contractorId: 'c1', taxId: '12.345.678-901' },
    ])

    expect(scope.taxIds).toEqual(['12345678901'])
  })

  /**
   * Sem vínculo é recusa, não lista vazia: lista vazia faria o portal parecer funcionando e a pessoa
   * concluir que não tem entrega nenhuma.
   */
  test('conta sem vínculo é recusada, não devolvida vazia', () => {
    expect(() => resolveContractorScope([])).toThrow(ContractorNotBoundError)
  })

  /**
   * Documento em branco casaria com participante sem documento — que é justamente a nota de terceiro
   * que este recorte existe para não mostrar.
   */
  test('documento em branco não vira escopo', () => {
    expect(() => resolveContractorScope([{ contractorId: 'c1', taxId: '   ' }])).toThrow(
      ContractorNotBoundError,
    )
  })

  /** ADR-0050 §4: o escopo vem da conta, e a listagem recebe o escopo — nunca um filtro do cliente. */
  test('a listagem recebe o escopo resolvido pela conta', async () => {
    const seen: unknown[] = []
    const useCase = createReadContractorDeliveriesUseCase({
      repository: {
        findScheduleTarget: async () => null,
        isBatchWithinScope: async () => false,
        listBatchIds: async () => [],
        listDeliveries: async (input) => {
          seen.push(input)
          return []
        },
        resolveScope: async () =>
          resolveContractorScope([{ contractorId: 'c1', taxId: '12345678901' }]),
      },
    })

    await useCase({ context: CONTEXT })

    expect(seen).toEqual([
      {
        context: CONTEXT,
        limit: CONTRACTOR_DELIVERY_LIMIT,
        scope: { contractorIds: ['c1'], taxIds: ['12345678901'] },
      },
    ])
  })

  /**
   * O contrato por texto de fonte existe porque a falha aqui é silenciosa: uma assinatura que
   * aceitasse `taxId` compilaria, passaria em todo teste de caminho feliz, e só apareceria no dia em
   * que alguém mandasse o CNPJ do vizinho.
   */
  test('nenhuma assinatura do portal aceita documento vindo de fora', async () => {
    const sources = await Promise.all(
      [
        'src/contractor-portal/application/read-contractor-deliveries.use-case.ts',
        'src/contractor-portal/application/contractor-portal.types.ts',
        'src/contractor-portal/infrastructure/contractor-delivery.query.ts',
      ].map((path) => readFile(path, 'utf8')),
    )

    for (const source of sources) {
      expect(source).not.toMatch(/readonly taxId(s)?\??:/)
    }
  })

  /** O tenant no `where` é a defesa em profundidade que todo repositório daqui carrega. */
  test('as duas consultas filtram por empresa', async () => {
    const bindings = await readFile(
      'src/contractor-portal/infrastructure/contractor-binding.query.ts',
      'utf8',
    )
    const deliveries = await readFile(
      'src/contractor-portal/infrastructure/contractor-delivery.query.ts',
      'utf8',
    )

    expect(bindings).toContain('eq(contractorPortalBindings.companyId, input.companyId)')
    expect(bindings).toContain('eq(contractorPortalBindings.membershipId, input.membershipId)')
    expect(deliveries).toContain('eq(nfeDocuments.companyId, input.companyId)')
  })

  /** Contratante inativo perde o portal junto — a porta que alguém achou que tinha fechado. */
  test('o vínculo ignora contratante inativo', async () => {
    const bindings = await readFile(
      'src/contractor-portal/infrastructure/contractor-binding.query.ts',
      'utf8',
    )

    expect(bindings).toContain("eq(contractors.status, 'active')")
  })

  /**
   * ADR-0050 §6: a regra do agendamento não é reescrita aqui — o portal descobre a parada pela chave
   * e chama a mesma máquina da 060.
   */
  test('o agendamento chama a máquina da 060 com a parada resolvida pela chave', async () => {
    const saved: unknown[] = []
    const useCase = createScheduleContractorDeliveryUseCase({
      repository: {
        ...emptyRepository(),
        findScheduleTarget: async () => ({ stopId: 'stop-1', tripId: 'trip-1' }),
        resolveScope: async () =>
          resolveContractorScope([{ contractorId: 'c1', taxId: '12345678901' }]),
      },
      schedules: {
        async save(input) {
          saved.push(input)
          return {
            divergedAt: null,
            id: 'schedule-1',
            notes: '',
            protocol: 'AG-1',
            scheduledAt: '2026-08-28T13:00:00.000Z',
            status: 'confirmed',
            stopId: 'stop-1',
          }
        },
      },
    })

    await useCase({
      accessKey: 'chave',
      context: CONTEXT,
      values: {
        notes: '',
        protocol: 'AG-1',
        scheduledAt: '2026-08-28T13:00:00.000Z',
        status: 'confirmed',
      },
    })

    expect(saved).toEqual([
      {
        context: CONTEXT,
        stopId: 'stop-1',
        tripId: 'trip-1',
        values: {
          notes: '',
          protocol: 'AG-1',
          scheduledAt: '2026-08-28T13:00:00.000Z',
          status: 'confirmed',
        },
      },
    ])
  })

  /** Chave que não é dele responde como chave que não existe: existir já é informação. */
  test('a chave fora do escopo é ausência, não recusa explicada', async () => {
    const useCase = createScheduleContractorDeliveryUseCase({
      repository: {
        ...emptyRepository(),
        resolveScope: async () =>
          resolveContractorScope([{ contractorId: 'c1', taxId: '12345678901' }]),
      },
      schedules: {
        async save() {
          throw new Error('não deveria escrever')
        },
      },
    })

    await expect(
      useCase({
        accessKey: 'chave',
        context: CONTEXT,
        values: { notes: '', protocol: '', scheduledAt: null, status: 'refused' },
      }),
    ).rejects.toBeInstanceOf(ContractorDeliveryNotFoundError)
  })

  /** O recorte do lote é conferido **antes** de qualquer leitura do relatório. */
  test('lote de outro contratante é ausência, e a decisão nem chega ao ciclo da 060', async () => {
    const decided: unknown[] = []
    const useCase = createContractorExtraChargesUseCase({
      batches: {
        async decide(input) {
          decided.push(input)
          throw new Error('não deveria decidir')
        },
        async readReport() {
          throw new Error('não deveria ler')
        },
      },
      repository: {
        ...emptyRepository(),
        resolveScope: async () =>
          resolveContractorScope([{ contractorId: 'c1', taxId: '12345678901' }]),
      },
    })

    await expect(
      useCase.decide({ batchId: 'batch-1', context: CONTEXT, decisions: [] }),
    ).rejects.toBeInstanceOf(ContractorBatchNotFoundError)
    expect(decided).toEqual([])
  })
})

function emptyRepository(): ContractorPortalRepositoryPort {
  return {
    findScheduleTarget: async () => null,
    isBatchWithinScope: async () => false,
    listBatchIds: async () => [],
    listDeliveries: async () => [],
    resolveScope: async () =>
      resolveContractorScope([{ contractorId: 'c1', taxId: '12345678901' }]),
  }
}
