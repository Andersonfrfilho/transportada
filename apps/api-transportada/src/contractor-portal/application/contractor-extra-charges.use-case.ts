/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ExtraChargeBatchReport,
  ExtraChargeDecision,
} from '../../delivery-clients/application/extra-charge-batch.port.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ContractorBatchNotFoundError } from '../domain/contractor-portal.error.js'
import type { ContractorPortalRepositoryPort } from './contractor-portal.types.js'

/** Quantos fechamentos o portal mostra. O contratante confere o período corrente e os anteriores. */
export const CONTRACTOR_BATCH_LIMIT = 24

export type ContractorExtraChargesUseCase = {
  decide(input: {
    readonly batchId: string
    readonly context: CompanyContext
    readonly decisions: readonly ExtraChargeDecision[]
  }): Promise<ExtraChargeBatchReport>
  list(input: { readonly context: CompanyContext }): Promise<readonly ExtraChargeBatchReport[]>
}

/**
 * ADR-0050 §6: **a aprovação usa o mesmo ciclo da 060, linha a linha.** A máquina de estados do
 * lançamento não é reescrita aqui — o que este caso de uso acrescenta é o recorte: o lote precisa
 * ser de um contratante amarrado à conta, e a pergunta é feita antes de qualquer leitura.
 *
 * O que muda em relação à página pública por token é **quem assina**: ali a trilha guarda o token,
 * porque quem decidiu foi quem tinha o link; aqui ela guarda o `userId` da conta do contratante, que
 * é ator externo com nome. Poder dizer *qual pessoa do cliente* aprovou é a razão de o portal ter
 * conta em vez de link.
 */
export function createContractorExtraChargesUseCase(dependencies: {
  readonly batches: {
    decide(input: {
      readonly batchId: string
      readonly context: CompanyContext
      readonly decisions: readonly ExtraChargeDecision[]
    }): Promise<ExtraChargeBatchReport>
    readReport(input: {
      readonly batchId: string
      readonly context: CompanyContext
    }): Promise<ExtraChargeBatchReport>
  }
  readonly repository: ContractorPortalRepositoryPort
}): ContractorExtraChargesUseCase {
  async function requireBatchInScope(input: {
    readonly batchId: string
    readonly context: CompanyContext
  }): Promise<void> {
    const scope = await dependencies.repository.resolveScope({ context: input.context })
    const allowed = await dependencies.repository.isBatchWithinScope({
      batchId: input.batchId,
      context: input.context,
      scope,
    })
    if (!allowed) throw new ContractorBatchNotFoundError()
  }

  return {
    async decide({ batchId, context, decisions }) {
      await requireBatchInScope({ batchId, context })

      return dependencies.batches.decide({ batchId, context, decisions })
    },
    async list({ context }) {
      const scope = await dependencies.repository.resolveScope({ context })
      const batchIds = await dependencies.repository.listBatchIds({
        context,
        limit: CONTRACTOR_BATCH_LIMIT,
        scope,
      })

      /**
       * Um relatório por lote, em série. São no máximo vinte e quatro leituras de um contratante, e
       * a alternativa — uma consulta que junta lote e lançamento de uma vez — duplicaria a montagem
       * do relatório, que é justamente o que confere o próprio total (060 T011).
       */
      const reports: ExtraChargeBatchReport[] = []
      for (const batchId of batchIds) {
        reports.push(await dependencies.batches.readReport({ batchId, context }))
      }

      return reports
    },
  }
}
