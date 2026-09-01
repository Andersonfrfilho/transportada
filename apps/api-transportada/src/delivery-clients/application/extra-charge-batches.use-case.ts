/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ApiError } from '../../shared/api.error.js'
import { checkDeliveryChargeTransition } from '../domain/delivery-charge-state.policy.js'
import type { DeliveryChargeRepositoryPort } from './delivery-charge.port.js'
import type {
  ExtraChargeBatch,
  ExtraChargeBatchReport,
  ExtraChargeBatchRepositoryPort,
  ExtraChargeDecision,
} from './extra-charge-batch.port.js'

export class ExtraChargeBatchEmptyError extends ApiError {
  public constructor() {
    super({
      code: 'EXTRA_CHARGE_BATCH_EMPTY',
      message: 'There is nothing to close for this contractor in this period',
      status: 422,
    })
  }
}

export class ExtraChargeBatchNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXTRA_CHARGE_BATCH_NOT_FOUND',
      message: 'Extra charge batch was not found',
      status: 404,
    })
  }
}

export type ExtraChargeBatchesUseCase = {
  close(input: {
    readonly context: CompanyContext
    readonly contractorId: string
    readonly periodEnd: string
    readonly periodStart: string
  }): Promise<ExtraChargeBatch>
  /** A decisão de gente da casa. A do contratante entra pela página pública, com token no lugar do ator. */
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

export type DecideOnBehalfOfTokenInput = {
  readonly accessToken: string
  readonly decisions: readonly ExtraChargeDecision[]
}

/**
 * ADR-0048 §7: o lote é **do contratante e do período**, nunca da viagem — o embarcador descarrega
 * várias cargas e a transportadora reagrupa em rotas próprias, então uma viagem mistura contratantes.
 *
 * Fechar gera o token opaco da página pública, e **fechar de novo gira o token**: o link antigo
 * deixa de abrir.
 */
export function createExtraChargeBatchesUseCase(dependencies: {
  readonly batches: ExtraChargeBatchRepositoryPort
  readonly charges: DeliveryChargeRepositoryPort
  readonly createToken: () => string
}): ExtraChargeBatchesUseCase & {
  decideByToken(input: DecideOnBehalfOfTokenInput): Promise<ExtraChargeBatchReport>
  readReportByToken(input: { readonly accessToken: string }): Promise<ExtraChargeBatchReport>
} {
  async function applyDecisions(input: {
    readonly batchId: string
    readonly companyId: string
    readonly decidedByToken?: string
    readonly decisions: readonly ExtraChargeDecision[]
    readonly userId?: string
  }): Promise<ExtraChargeBatchReport> {
    for (const decision of input.decisions) {
      const charge = await dependencies.charges.findById({
        companyId: input.companyId,
        id: decision.chargeId,
      })
      /**
       * Lançamento de outro lote é **ignorado**, não recusado: a página pública recebe o que o
       * contratante marcou, e um id que não é deste lote é engano de quem montou a requisição — não
       * é motivo para derrubar as outras trinta e sete decisões.
       */
      if (charge === null || charge.batchId !== input.batchId) continue

      const transition = checkDeliveryChargeTransition({
        action: decision.decision === 'approved' ? 'approve' : 'reject',
        status: charge.status,
      })
      if (transition.kind !== 'changed') continue

      await dependencies.charges.transition({
        actorUserId: input.userId ?? null,
        companyId: input.companyId,
        ...(input.decidedByToken === undefined ? {} : { decidedByToken: input.decidedByToken }),
        eventName: decision.decision,
        id: decision.chargeId,
        ...(decision.decision === 'rejected' ? { rejectionReason: decision.reason } : {}),
        status: transition.to,
      })
    }

    const report = await dependencies.batches.readReport({
      batchId: input.batchId,
      companyId: input.companyId,
    })
    if (report === null) throw new ExtraChargeBatchNotFoundError()

    return report
  }

  return {
    async close({ context, contractorId, periodEnd, periodStart }) {
      const batch = await dependencies.batches.close({
        accessToken: dependencies.createToken(),
        actorUserId: context.userId,
        companyId: context.companyId,
        contractorId,
        periodEnd,
        periodStart,
      })
      /**
       * Lote vazio é recusa, não lote de zero: ele nasceria, seria enviado e voltaria sem nada — e o
       * contratante receberia um link que não diz nada.
       */
      if (batch === null) throw new ExtraChargeBatchEmptyError()

      return batch
    },
    async decide({ batchId, context, decisions }) {
      return applyDecisions({
        batchId,
        companyId: context.companyId,
        decisions,
        userId: context.userId,
      })
    },
    async decideByToken({ accessToken, decisions }) {
      const found = await dependencies.batches.findByToken({ accessToken })
      if (found === null) throw new ExtraChargeBatchNotFoundError()

      return applyDecisions({
        batchId: found.batchId,
        companyId: found.companyId,
        /** Quem decidiu é quem tinha o link, e é isso que a trilha guarda — nunca um `userId`. */
        decidedByToken: accessToken,
        decisions,
      })
    },
    async readReport({ batchId, context }) {
      const report = await dependencies.batches.readReport({
        batchId,
        companyId: context.companyId,
      })
      if (report === null) throw new ExtraChargeBatchNotFoundError()

      return report
    },
    async readReportByToken({ accessToken }) {
      const found = await dependencies.batches.findByToken({ accessToken })
      if (found === null) throw new ExtraChargeBatchNotFoundError()

      const report = await dependencies.batches.readReport({
        batchId: found.batchId,
        companyId: found.companyId,
      })
      if (report === null) throw new ExtraChargeBatchNotFoundError()

      return report
    },
  }
}
