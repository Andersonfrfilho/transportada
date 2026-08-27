/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryChargeType } from '../../database/delivery-client.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ApiError } from '../../shared/api.error.js'
import {
  checkDeliveryChargeTransition,
  resolveInitialChargeStatus,
  type DeliveryChargeAction,
} from '../domain/delivery-charge-state.policy.js'
import { DeliveryClientNotFoundError } from '../domain/delivery-client.error.js'
import type {
  DeliveryCharge,
  DeliveryChargeListFilters,
  DeliveryChargePage,
  DeliveryChargeRepositoryPort,
} from './delivery-charge.port.js'

export class DeliveryChargeNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DELIVERY_CHARGE_NOT_FOUND',
      message: 'Delivery charge was not found',
      status: 404,
    })
  }
}

export class DeliveryChargeTransitionNotAllowedError extends ApiError {
  public constructor(input: { readonly from: string; readonly to: string }) {
    super({
      code: 'DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED',
      details: [{ field: 'status', message: `${input.from} -> ${input.to}` }],
      message: 'The delivery charge cannot make this transition',
      status: 409,
    })
  }
}

export type RecordDeliveryChargeInput = {
  readonly amount: string
  readonly chargedOn: string
  readonly chargeType: DeliveryChargeType
  readonly context: CompanyContext
  readonly notes: string
  readonly tripDocumentId: string
}

export type ConfirmChargeInput = {
  /** O valor é editável na conferência: o CD reajustou a taxa, e quem confere corrige na hora. */
  readonly amount?: string
  readonly id: string
}

export type DeliveryChargesUseCase = {
  confirm(input: {
    readonly charges: readonly ConfirmChargeInput[]
    readonly context: CompanyContext
  }): Promise<readonly DeliveryCharge[]>
  dismiss(input: {
    readonly context: CompanyContext
    readonly id: string
    readonly reason: string
  }): Promise<DeliveryCharge>
  list(input: {
    readonly context: CompanyContext
    readonly filters: DeliveryChargeListFilters
  }): Promise<DeliveryChargePage>
  record(input: RecordDeliveryChargeInput): Promise<DeliveryCharge>
}

/**
 * ADR-0048 §6: **quem lança é o escritório, sob `trip.manage` — nunca o motorista pelo PWA.** Ele é
 * quem vê a taxa acontecer, mas o lançamento é dinheiro que vai ser cobrado de outra empresa, e
 * precisa de conferência antes de virar linha de relatório.
 *
 * O lançamento aceita **data retroativa**: o comprovante em papel volta com o motorista no fim do
 * dia, e o que corta é o fechamento do lote.
 */
export function createDeliveryChargesUseCase(dependencies: {
  readonly repository: DeliveryChargeRepositoryPort
}): DeliveryChargesUseCase {
  const { repository } = dependencies

  async function applyTransition(input: {
    readonly action: DeliveryChargeAction
    readonly amount?: string
    readonly companyId: string
    readonly eventName: string
    readonly id: string
    readonly reason?: string
    readonly userId: string
  }): Promise<DeliveryCharge> {
    const charge = await repository.findById({ companyId: input.companyId, id: input.id })
    if (charge === null) throw new DeliveryChargeNotFoundError()

    const transition = checkDeliveryChargeTransition({
      action: input.action,
      status: charge.status,
    })
    if (transition.kind === 'refused') {
      throw new DeliveryChargeTransitionNotAllowedError({
        from: charge.status,
        to: input.action,
      })
    }
    /** Repetir a confirmação converge: a rede caiu e o operador tocou duas vezes na mesma linha. */
    if (transition.kind === 'unchanged') return charge

    const updated = await repository.transition({
      actorUserId: input.userId,
      ...(input.amount === undefined ? {} : { amount: input.amount }),
      companyId: input.companyId,
      eventName: input.eventName,
      id: input.id,
      ...(input.reason === undefined ? {} : { rejectionReason: input.reason }),
      status: transition.to,
    })
    if (updated === null) throw new DeliveryChargeNotFoundError()

    return updated
  }

  return {
    async confirm({ charges, context }) {
      /**
       * Em série, e não em `Promise.all`: a fila de conferência é dezenas de linhas do mesmo
       * operador, e o ganho de paralelizar não paga o risco de duas transições da mesma linha
       * correndo juntas.
       */
      const confirmed: DeliveryCharge[] = []
      for (const charge of charges) {
        confirmed.push(
          await applyTransition({
            action: 'confirm',
            ...(charge.amount === undefined ? {} : { amount: charge.amount }),
            companyId: context.companyId,
            eventName: 'recorded',
            id: charge.id,
            userId: context.userId,
          }),
        )
      }

      return confirmed
    },
    async dismiss({ context, id, reason }) {
      return applyTransition({
        action: 'dismiss',
        companyId: context.companyId,
        eventName: 'dismissed',
        id,
        reason,
        userId: context.userId,
      })
    },
    async list({ context, filters }) {
      return repository.list({ companyId: context.companyId, filters })
    },
    async record({ context, ...input }) {
      const parties = await repository.findChargeParties({
        companyId: context.companyId,
        tripDocumentId: input.tripDocumentId,
      })
      /**
       * Sem cliente de entrega não há a quem atribuir a taxa. Isso só acontece quando o destinatário
       * da nota não virou cadastro — e aí o problema é a nota, não o lançamento.
       */
      if (parties === null) throw new DeliveryClientNotFoundError()

      const charge = await repository.insert({
        actorUserId: context.userId,
        charge: {
          amount: input.amount,
          chargedOn: input.chargedOn,
          chargeType: input.chargeType,
          notes: input.notes,
          origin: 'manual',
          parties,
          status: resolveInitialChargeStatus('manual'),
          tripDocumentId: input.tripDocumentId,
        },
        companyId: context.companyId,
      })
      if (charge === null) throw new DeliveryChargeNotFoundError()

      return charge
    },
  }
}
