/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 167 T301/T302 (RF2, RF3, RF4, RF5): substitui o conjunto inteiro de itens, reusando a
 * política de itens da spec 166 (`occurrence-item-quantity.policy.ts`) — nunca reescrita, para não
 * divergir calada da validação do registro.
 */
import { resolveOccurrenceProductSelection } from '../domain/occurrence-scope.policy.js'
import { resolveOccurrenceCorrectionChanged } from '../domain/occurrence-correction.policy.js'
import { resolveOccurrenceItemQuantities } from '../domain/occurrence-item-quantity.policy.js'
import {
  OccurrenceCancelledError,
  OccurrenceCaseAlreadyOpenError,
  OccurrenceTypeSingleItemError,
  TripDocumentNotFoundError,
  TripOccurrenceNotFoundError,
} from '../domain/trip.error.js'
import type {
  CorrectedOccurrenceView,
  OccurrenceCorrectionUnitOfWork,
} from './occurrence-correction.port.js'

export type CorrectOccurrenceItemsInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly occurrenceId: string
  readonly productCode: string
  /** Vazio é a nota inteira — a mesma regra de `resolveOccurrenceProductSelection`. */
  readonly productCodes?: readonly string[]
  readonly productQuantities?: readonly string[]
  readonly productQuantityUnits?: readonly string[]
  readonly unitOfWork: OccurrenceCorrectionUnitOfWork
}

/**
 * ⚠️ **Ocorrência de outra empresa é 404**, nunca 403 — o mesmo desenho do resto do módulo. Ela não
 * distingue "não existe" de "é de outra empresa".
 */
export async function correctOccurrenceItems(
  input: CorrectOccurrenceItemsInput,
): Promise<CorrectedOccurrenceView> {
  return input.unitOfWork.execute(async (transaction) => {
    const occurrence = await transaction.lockOccurrence({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
    })
    if (occurrence === null) throw new TripOccurrenceNotFoundError()
    /** RF6 (correção de ocorrência cancelada): cancelada é fim de linha. */
    if (occurrence.cancelledAt !== null) throw new OccurrenceCancelledError()
    /** RF4/CA06: o número já está valendo dinheiro — a janela fechou. */
    if (
      await transaction.hasOpenCase({
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
      })
    ) {
      throw new OccurrenceCaseAlreadyOpenError()
    }

    const occurrenceType = await transaction.findOccurrenceType({
      companyId: input.companyId,
      occurrenceTypeId: occurrence.occurrenceTypeId,
    })
    if (occurrenceType === null) throw new TripDocumentNotFoundError()

    /** RF3: mesma regra do registro — item fora da nota, repetido ou os dois campos juntos é recusado. */
    const scope = resolveOccurrenceProductSelection({
      productCode: input.productCode,
      productCodes: input.productCodes,
      products: await transaction.listDocumentProducts({
        companyId: input.companyId,
        documentId: occurrence.tripDocumentId,
        tripId: occurrence.tripId,
      }),
    })

    /** RF3/CA05: o teto de um item quando o tipo não aceita vários, igual ao registro. */
    if (!occurrenceType.allowsMultipleItems && scope.productCodes.length > 1) {
      throw new OccurrenceTypeSingleItemError()
    }

    const nextItems = resolveOccurrenceItemQuantities({
      productCodes: scope.productCodes,
      quantities: input.productQuantities ?? [],
      units: input.productQuantityUnits ?? [],
    })

    const previousItems = await transaction.listCurrentItems({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
    })

    /** RF5/CA03: sem mudança real, nada grava — registrar "corrigiu para o mesmo" só sujaria a auditoria. */
    if (resolveOccurrenceCorrectionChanged({ nextItems, previousItems })) {
      await transaction.replaceItems({
        companyId: input.companyId,
        items: nextItems,
        occurrenceId: input.occurrenceId,
        productCode: scope.productCode,
      })
      await transaction.insertCorrection({
        companyId: input.companyId,
        correctedByUserId: input.actorUserId,
        occurrenceId: input.occurrenceId,
        previousItems,
      })
    }

    return transaction.readOccurrenceView({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
    })
  })
}
