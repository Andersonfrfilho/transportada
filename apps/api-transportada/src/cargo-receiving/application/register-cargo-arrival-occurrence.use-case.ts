/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8 (ADR-0094 §9.4–9.5): a avaria sem viagem. A ordem é a decisão: trava da chegada →
 * chave (o reenvio volta mesmo com a janela vencida) → nota, estado e janela → tipo e itens → linhas
 * → foto. Itens, quantidade, unidade e foto pelas mesmas políticas da ocorrência de galpão.
 */
import type { CargoArrivalChannel } from '../../shared/cargo-arrival.constant.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import {
  runWithStoredObjectCleanup,
  type RemovableObjectStoragePort,
} from '../../trips/application/stored-object-cleanup.service.js'
import {
  assertOccurrenceAttachmentAccepted,
  OCCURRENCE_PHOTO_MAX_BYTES,
} from '../../trips/domain/occurrence-attachment.policy.js'
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
import { buildCargoArrivalOccurrenceFingerprint } from '../domain/cargo-arrival-occurrence.policy.js'
import { sha256Hex } from '../domain/cargo-preview-upload.policy.js'
import type {
  CargoArrivalOccurrenceReadPort,
  CargoArrivalOccurrenceTransactionPort,
  CargoArrivalOccurrenceUnitOfWork,
  DocumentProduct,
} from './cargo-arrival-occurrence.port.js'
import type {
  ReceivingOccurrenceType,
  RegisterCargoArrivalOccurrenceParams,
  RegisteredCargoArrivalOccurrence,
} from './cargo-arrival-occurrence.types.js'
import { persistCargoArrivalOccurrencePhoto } from './cargo-arrival-occurrence-photo.service.js'
import { lockOpenableDocument } from './cargo-arrival-occurrence-guard.service.js'

type Dependencies = {
  readonly channel: CargoArrivalChannel
  readonly newObjectId: () => string
  readonly now: () => Date
  readonly reads: CargoArrivalOccurrenceReadPort
  readonly storage: RemovableObjectStoragePort
  readonly unitOfWork: CargoArrivalOccurrenceUnitOfWork
}

type RegisterStep = {
  readonly dependencies: Dependencies
  readonly fingerprint: string
  readonly now: Date
  readonly params: RegisterCargoArrivalOccurrenceParams
  readonly storage: RemovableObjectStoragePort
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

async function registerWithinLock(
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
    channel: step.dependencies.channel,
    contractorId: located.arrival.contractorId,
    correlationId: params.correlationId,
    fingerprint: step.fingerprint,
    idempotencyKey: params.idempotencyKey,
    items,
    note: params.note,
    now: step.now,
    occurrenceType: type,
    productCode,
  })
  await persistCargoArrivalOccurrencePhoto({
    attachment: params.attachment,
    companyId: params.context.companyId,
    newObjectId: step.dependencies.newObjectId,
    now: step.now,
    occurrenceId: saved.id,
    storage: step.storage,
    transaction,
  })
  return { isReplay: false, occurrenceId: saved.id }
}

function fingerprintOf(params: RegisterCargoArrivalOccurrenceParams): string {
  return buildCargoArrivalOccurrenceFingerprint({
    arrivalId: params.arrivalId,
    attachmentSha256: sha256Hex(params.attachment.bytes),
    documentId: params.documentId,
    note: params.note,
    occurrenceTypeId: params.occurrenceTypeId,
    productCode: params.productCode,
    productCodes: params.productCodes,
    productQuantities: params.productQuantities,
    productQuantityUnits: params.productQuantityUnits,
  })
}

export function createRegisterCargoArrivalOccurrenceUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: RegisterCargoArrivalOccurrenceParams,
  ) => Promise<RegisteredCargoArrivalOccurrence>
} {
  return {
    async execute(params) {
      assertOccurrenceAttachmentAccepted({
        bytes: params.attachment.bytes,
        imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
        mimeType: params.attachment.mimeType,
        ...(params.attachment.thumbnail === undefined
          ? {}
          : { thumbnail: params.attachment.thumbnail }),
      })
      const scope = { arrivalId: params.arrivalId, companyId: params.context.companyId }
      const fingerprint = fingerprintOf(params)
      const now = dependencies.now()
      const outcome = await runWithStoredObjectCleanup({
        operation: (storage) =>
          dependencies.unitOfWork.execute({
            operation: (transaction) =>
              registerWithinLock({ dependencies, fingerprint, now, params, storage, transaction }),
            scope,
          }),
        storage: dependencies.storage,
      })
      const occurrence = await dependencies.reads.findOccurrence({
        ...scope,
        occurrenceId: outcome.occurrenceId,
      })
      if (occurrence === null) throw new Error('CARGO_ARRIVAL_OCCURRENCE_NOT_READ_BACK')
      return { isReplay: outcome.isReplay, occurrence }
    },
  }
}
