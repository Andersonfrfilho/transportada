/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8 (ADR-0094 §9.4–9.5): o que a ocorrência de recebimento faz DENTRO da trava da chegada —
 * a chave de novo, nota, estado e janela, tipo e itens, e as linhas (a foto já está no bucket). Itens,
 * quantidade e unidade pelas mesmas políticas da ocorrência de galpão.
 */
import type { CargoArrivalChannel } from '../../shared/cargo-arrival.constant.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import { resolveOccurrenceItemQuantities } from '../../trips/domain/occurrence-item-quantity.policy.js'
import type { OccurrenceItemQuantity } from '../../trips/domain/occurrence-item-quantity.policy.js'
import { assertOccurrenceTypeAcceptsProducts } from '../../trips/domain/occurrence-items-mode.policy.js'
import { resolveOccurrenceProductSelection } from '../../trips/domain/occurrence-scope.policy.js'
import { OccurrenceTypeSingleItemError } from '../../trips/domain/trip.error.js'
import {
  CargoArrivalOccurrenceItemsRequiredError,
  CargoArrivalOccurrenceTypeNotFoundError,
  CargoArrivalOccurrenceTypeNotReceivingError,
} from '../domain/cargo-arrival-occurrence.error.js'
import type {
  CargoArrivalOccurrenceTransactionPort,
  DocumentProduct,
} from './cargo-arrival-occurrence.port.js'
import type {
  ReceivingOccurrenceType,
  RegisterCargoArrivalOccurrenceParams,
} from './cargo-arrival-occurrence.types.js'
import { lockOpenableDocument } from './cargo-arrival-occurrence-guard.service.js'
import {
  persistCargoArrivalOccurrencePhoto,
  type UploadedCargoArrivalOccurrencePhoto,
} from './cargo-arrival-occurrence-photo.service.js'

export type RegisterStep = {
  readonly channel: CargoArrivalChannel
  readonly fingerprint: string
  readonly now: Date
  readonly occurrenceId: string
  readonly params: RegisterCargoArrivalOccurrenceParams
  readonly photo: UploadedCargoArrivalOccurrencePhoto
  readonly transaction: CargoArrivalOccurrenceTransactionPort
}

function assertReceivingType(type: ReceivingOccurrenceType | null): ReceivingOccurrenceType {
  if (type === null || !type.active) throw new CargoArrivalOccurrenceTypeNotFoundError()
  if (type.stage !== TRIP_OCCURRENCE_STAGE.receiving) {
    throw new CargoArrivalOccurrenceTypeNotReceivingError()
  }
  return type
}

function resolveItems(input: {
  readonly params: RegisterCargoArrivalOccurrenceParams
  readonly products: readonly DocumentProduct[]
  readonly type: ReceivingOccurrenceType
}): { readonly items: readonly OccurrenceItemQuantity[]; readonly productCode: string } {
  const { params, products, type } = input
  assertOccurrenceTypeAcceptsProducts({
    itemsMode: type.itemsMode,
    productCode: params.productCode,
    productCodes: params.productCodes,
  })
  const scope = resolveOccurrenceProductSelection({
    productCode: params.productCode,
    productCodes: params.productCodes,
    products,
  })
  if (scope.productCodes.length === 0) throw new CargoArrivalOccurrenceItemsRequiredError()
  if (!type.allowsMultipleItems && scope.productCodes.length > 1) {
    throw new OccurrenceTypeSingleItemError()
  }
  const items = resolveOccurrenceItemQuantities({
    productCodes: scope.productCodes,
    products,
    quantities: params.productQuantities,
    units: params.productQuantityUnits,
  })
  return { items, productCode: scope.productCode }
}

export async function registerWithinLock(
  step: RegisterStep,
): Promise<{ readonly isReplay: boolean; readonly occurrenceId: string }> {
  const { params, transaction } = step
  const located = await lockOpenableDocument({
    documentId: params.documentId,
    idempotency: { fingerprint: step.fingerprint, key: params.idempotencyKey },
    now: step.now,
    transaction,
  })
  if (located.kind === 'replay') return { isReplay: true, occurrenceId: located.occurrenceId }
  const type = assertReceivingType(await transaction.findOccurrenceType(params.occurrenceTypeId))
  const products = await transaction.listDocumentProducts(params.documentId)
  const { items, productCode } = resolveItems({ params, products, type })
  const saved = await transaction.saveOccurrence({
    actorUserId: params.context.userId,
    arrivalDocumentId: located.document.id,
    channel: step.channel,
    contractorId: located.arrival.contractorId,
    correlationId: params.correlationId,
    fingerprint: step.fingerprint,
    idempotencyKey: params.idempotencyKey,
    items,
    note: params.note,
    now: step.now,
    occurrenceId: step.occurrenceId,
    occurrenceType: type,
    productCode,
  })
  await persistCargoArrivalOccurrencePhoto({
    occurrenceId: saved.id,
    photo: step.photo,
    transaction,
  })
  return { isReplay: false, occurrenceId: saved.id }
}
