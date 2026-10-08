/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 167 T301/T302 (RF2, RF3, RF4, RF5): substitui o conjunto inteiro de itens, reusando a
 * política de itens da spec 166 (`occurrence-item-quantity.policy.ts`) — nunca reescrita, para não
 * divergir calada da validação do registro.
 */
import { assertOccurrenceTypeAcceptsProducts } from '../domain/occurrence-items-mode.policy.js'
import { resolveOccurrenceProductSelection } from '../domain/occurrence-scope.policy.js'
import { resolveOccurrenceCorrectionChanged } from '../domain/occurrence-correction.policy.js'
import {
  assertSingleDeclaredAmountLevel,
  buildCorrectedOccurrenceLines,
  resolveCorrectedOccurrenceScalars,
  type TriStateText,
} from '../domain/occurrence-correction-values.policy.js'
import { applyCorrectionRequirements } from '../domain/occurrence-correction-requirements.policy.js'
import { resolveDocumentProductPricing } from '../domain/occurrence-product-pricing.policy.js'
import { resolveOccurrenceItemQuantities } from '../domain/occurrence-item-quantity.policy.js'
import {
  OccurrenceCancelledError,
  OccurrenceCaseAlreadyOpenError,
  OccurrenceTypeSingleItemError,
  TripDocumentNotFoundError,
  TripOccurrenceNotFoundError,
} from '../domain/trip.error.js'
import { resolveStoredOccurrenceRequirements } from './resolve-stored-occurrence-requirements.service.js'
import type {
  CorrectedOccurrenceView,
  OccurrenceCorrectionUnitOfWork,
} from './occurrence-correction.port.js'

export type CorrectOccurrenceItemsInput = {
  readonly actorUserId: string
  readonly companyId: string
  /** Spec 247 (T4.8): o valor pago da ocorrência — ausente mantém, nulo limpa, texto passa a valer. */
  readonly declaredAmount?: TriStateText
  readonly occurrenceId: string
  readonly productCode: string
  /** Vazio é a nota inteira — a mesma regra de `resolveOccurrenceProductSelection`. */
  readonly productCodes?: readonly string[]
  /** Spec 247 (T4.8): alinhada por índice a `productCodes`; o mesmo significado dos três estados. */
  readonly productDeclaredAmounts?: readonly TriStateText[]
  readonly productQuantities?: readonly string[]
  readonly productQuantityUnits?: readonly string[]
  /** Spec 247 (T4.8): o número do documento do cliente — os mesmos três estados. */
  readonly referenceNumber?: TriStateText
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

    /** Spec 241 (RF6, CA03): o tipo ATUAL manda — tipo que virou `off` aceita esvaziar, não preencher. */
    assertOccurrenceTypeAcceptsProducts({
      itemsMode: occurrenceType.itemsMode,
      productCode: input.productCode,
      productCodes: input.productCodes,
    })

    /** RF3: mesma regra do registro — item fora da nota, repetido ou os dois campos juntos é recusado. */
    const documentProducts = await transaction.listDocumentProducts({
      companyId: input.companyId,
      documentId: occurrence.tripDocumentId,
      tripId: occurrence.tripId,
    })
    const scope = resolveOccurrenceProductSelection({
      productCode: input.productCode,
      productCodes: input.productCodes,
      products: documentProducts,
    })

    /** RF3/CA05: o teto de um item quando o tipo não aceita vários, igual ao registro. */
    if (!occurrenceType.allowsMultipleItems && scope.productCodes.length > 1) {
      throw new OccurrenceTypeSingleItemError()
    }

    /** Spec 172 (RF2): a unidade da nota vale na correção como no registro — sem a nota, 'CX' seria desconhecida. */
    const nextItems = resolveOccurrenceItemQuantities({
      productCodes: scope.productCodes,
      products: documentProducts,
      quantities: input.productQuantities ?? [],
      units: input.productQuantityUnits ?? [],
    })

    /** Spec 247 (T7.2b N1): o modo EFETIVO manda — contratante e destinatário lidos da NOTA, nunca do corpo. */
    const subject = await transaction.findDocumentSubject({
      companyId: input.companyId,
      documentId: occurrence.tripDocumentId,
    })
    if (subject === null) throw new TripDocumentNotFoundError()
    const requirements = await resolveStoredOccurrenceRequirements({
      companyId: input.companyId,
      document: subject,
      occurrenceType,
      repository: transaction,
    })
    const applied = applyCorrectionRequirements({
      declaredAmount: input.declaredAmount,
      lineCount: nextItems.length,
      productDeclaredAmounts: input.productDeclaredAmounts ?? [],
      referenceNumber: input.referenceNumber,
      requirements,
    })

    const previousItems = await transaction.listCurrentItems({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
    })

    /** Spec 247 (T4.8): o preço copiado no registro sobrevive; o do código novo sai da nota, nunca do corpo. */
    const nextLines = buildCorrectedOccurrenceLines({
      declaredAmounts: applied.productDeclaredAmounts,
      nextItems,
      previousLines: previousItems,
      pricing: resolveDocumentProductPricing(documentProducts),
    })
    const scalars = resolveCorrectedOccurrenceScalars({
      declaredAmount: applied.declaredAmount,
      previous: {
        declaredAmount: occurrence.declaredAmount,
        referenceNumber: occurrence.referenceNumber,
      },
      referenceNumber: applied.referenceNumber,
    })
    assertSingleDeclaredAmountLevel({ declaredAmount: scalars.declaredAmount, lines: nextLines })

    /** RF5/CA03: sem mudança real, nada grava — registrar "corrigiu para o mesmo" só sujaria a auditoria. */
    if (
      scalars.isChanged ||
      resolveOccurrenceCorrectionChanged({ nextItems: nextLines, previousItems })
    ) {
      await transaction.replaceItems({
        companyId: input.companyId,
        items: nextLines,
        occurrenceId: input.occurrenceId,
        productCode: scope.productCode,
      })
      if (scalars.isChanged) {
        await transaction.writeDeclaredValues({
          companyId: input.companyId,
          declaredAmount: scalars.declaredAmount,
          occurrenceId: input.occurrenceId,
          referenceNumber: scalars.referenceNumber,
        })
      }
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
