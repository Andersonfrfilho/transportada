/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TripFieldReportKeyReusedError } from '../domain/trip.error.js'
import type { DriverFieldReportTransactionPort } from './driver-field-report.port.js'
import type { FieldAuthorship, FieldTripLocator } from './field-trip-target.types.js'

/**
 * Spec 156 T15 M8 (ADR-0067 §2): o escritório reserva a chave numa `operation` própria, prefixada
 * `office.` — a mesma chave não confirma a ação do motorista nem a do escritório uma pela outra.
 */
export const OFFICE_FIELD_OPERATION_PREFIX = 'office.'

export function resolveFieldReportOperation(input: {
  readonly locator: FieldTripLocator
  readonly operation: string
}): string {
  return input.locator.target === undefined
    ? input.operation
    : `${OFFICE_FIELD_OPERATION_PREFIX}${input.operation}`
}

export type FieldReportGuardInput = {
  readonly actorUserId: string
  readonly authorship: FieldAuthorship
  readonly companyId: string
  readonly idempotencyKey: string
  readonly operation: string
  /** Só a reserva e a liquidação da chave: o lote de ocorrências (spec 156 T7.3) usa a guarda sem as demais portas. */
  readonly transaction: Pick<DriverFieldReportTransactionPort, 'claim' | 'settle'>
}

/**
 * ADR-0045 §5: a idempotência mora **no servidor**. A fila offline reenvia e dois celulares logados
 * no mesmo motorista mandam a mesma coisa duas vezes; quem decide que é a mesma confirmação é isto,
 * não o cliente.
 *
 * O reenvio devolve **o mesmo recurso** e **não reexecuta o efeito**. Rodar de novo "porque é
 * idempotente" carimbaria uma coordenada nova sobre a entrega de vinte minutos atrás — e a
 * coordenada é justamente a prova de onde ela aconteceu.
 */
export type WithFieldReportParams<TResult extends { readonly id: string }> = {
  readonly guard: FieldReportGuardInput
  /** O efeito — só roda quando esta transação reservou a chave, ou o reenvio não achou o resultado. */
  readonly perform: () => Promise<TResult>
  /** O reenvio: o resultado que a chave já liquidou. `null` executa `perform` de novo. */
  readonly recall: (resultId: string) => Promise<TResult | null>
}

export async function withFieldReport<TResult extends { readonly id: string }>(
  params: WithFieldReportParams<TResult>,
): Promise<TResult> {
  const { guard: input, perform, recall } = params
  const claim = await input.transaction.claim({
    actorUserId: input.actorUserId,
    authorship: input.authorship,
    companyId: input.companyId,
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
  })

  if (!claim.claimed) {
    /**
     * A mesma chave em ações diferentes é erro do cliente, não repetição — e aceitar em silêncio
     * faria uma entrega ser "confirmada" pela chave de uma chegada. ADR-0067 §5 (emenda
     * 2026-09-18): o mesmo vale para o ator — duas pessoas do escritório nunca compartilham a
     * confirmação uma da outra, mesmo que peçam a mesma coisa.
     */
    if (claim.operation !== input.operation || claim.actorUserId !== input.actorUserId) {
      throw new TripFieldReportKeyReusedError()
    }
    const recalled = claim.resultId === null ? null : await recall(claim.resultId)
    if (recalled !== null) return recalled
  }

  const result = await perform()
  await input.transaction.settle({
    companyId: input.companyId,
    idempotencyKey: input.idempotencyKey,
    resultId: result.id,
  })

  return result
}
