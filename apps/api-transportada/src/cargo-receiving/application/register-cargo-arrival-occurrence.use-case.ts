/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8 (ADR-0094 §9.4–9.5): a avaria sem viagem. A ordem é a decisão: o reenvio já gravado
 * volta antes de tudo (consulta barata, sem trava) → a foto sobe ao bucket → trava da chegada → chave
 * de novo (a corrida do reenvio) → nota, estado e janela → tipo e itens → linhas. O bucket lento nunca
 * segura a trava da chegada; o objeto que sobrou (recusa, reenvio, falha) é apagado em todo caminho.
 */
import type { CargoArrivalChannel } from '../../shared/cargo-arrival.constant.js'
import {
  runWithStoredObjectCleanup,
  type RemovableObjectStoragePort,
} from '../../trips/application/stored-object-cleanup.service.js'
import {
  assertOccurrenceAttachmentAccepted,
  OCCURRENCE_PHOTO_MAX_BYTES,
} from '../../trips/domain/occurrence-attachment.policy.js'
import {
  CargoArrivalOccurrenceKeyReusedError,
  CargoArrivalOccurrenceNotReadBackError,
} from '../domain/cargo-arrival-occurrence.error.js'
import { buildCargoArrivalOccurrenceFingerprint } from '../domain/cargo-arrival-occurrence.policy.js'
import { sha256Hex } from '../domain/cargo-preview-upload.policy.js'
import type {
  CargoArrivalOccurrenceReadPort,
  CargoArrivalOccurrenceUnitOfWork,
} from './cargo-arrival-occurrence.port.js'
import type {
  RegisterCargoArrivalOccurrenceParams,
  RegisteredCargoArrivalOccurrence,
} from './cargo-arrival-occurrence.types.js'
import {
  uploadCargoArrivalOccurrencePhoto,
  type UploadedCargoArrivalOccurrencePhoto,
} from './cargo-arrival-occurrence-photo.service.js'

type Dependencies = {
  readonly channel: CargoArrivalChannel
  readonly newObjectId: () => string
  readonly newOccurrenceId: () => string
  readonly now: () => Date
  readonly reads: CargoArrivalOccurrenceReadPort
  readonly storage: RemovableObjectStoragePort
  readonly unitOfWork: CargoArrivalOccurrenceUnitOfWork
}

import { registerWithinLock } from './register-cargo-arrival-occurrence-lock.service.js'
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

async function discardUploadedPhoto(params: {
  readonly photo: UploadedCargoArrivalOccurrencePhoto
  readonly storage: RemovableObjectStoragePort
}): Promise<void> {
  const keys = [params.photo.original, params.photo.thumbnail]
    .filter((object) => object !== null)
    .map((object) => object.objectKey)
  await Promise.allSettled(keys.map((objectKey) => params.storage.remove({ objectKey })))
}

type Scope = { readonly arrivalId: string; readonly companyId: string }

async function readRegistered(params: {
  readonly dependencies: Dependencies
  readonly isReplay: boolean
  readonly occurrenceId: string
  readonly scope: Scope
}): Promise<RegisteredCargoArrivalOccurrence> {
  const occurrence = await params.dependencies.reads.findOccurrence({
    ...params.scope,
    occurrenceId: params.occurrenceId,
  })
  if (occurrence === null) throw new CargoArrivalOccurrenceNotReadBackError()
  return { isReplay: params.isReplay, occurrence }
}

async function registerWithUploadedPhoto(params: {
  readonly dependencies: Dependencies
  readonly fingerprint: string
  readonly input: RegisterCargoArrivalOccurrenceParams
  readonly scope: Scope
}): Promise<{ readonly isReplay: boolean; readonly occurrenceId: string }> {
  const { dependencies, fingerprint, input, scope } = params
  const now = dependencies.now()
  const occurrenceId = dependencies.newOccurrenceId()
  return runWithStoredObjectCleanup({
    operation: async (storage) => {
      const photo = await uploadCargoArrivalOccurrencePhoto({
        attachment: input.attachment,
        companyId: scope.companyId,
        newObjectId: dependencies.newObjectId,
        now,
        occurrenceId,
        storage,
      })
      const registered = await dependencies.unitOfWork.execute({
        operation: (transaction) =>
          registerWithinLock({
            channel: dependencies.channel,
            fingerprint,
            now,
            occurrenceId,
            params: input,
            photo,
            transaction,
          }),
        scope,
      })
      if (registered.isReplay) await discardUploadedPhoto({ photo, storage })
      return registered
    },
    storage: dependencies.storage,
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
      const stored = await dependencies.reads.findReplay({
        companyId: scope.companyId,
        idempotencyKey: params.idempotencyKey,
      })
      if (stored !== null) {
        if (stored.fingerprint !== fingerprint) throw new CargoArrivalOccurrenceKeyReusedError()
        return readRegistered({
          dependencies,
          isReplay: true,
          occurrenceId: stored.occurrenceId,
          scope,
        })
      }
      const outcome = await registerWithUploadedPhoto({
        dependencies,
        fingerprint,
        input: params,
        scope,
      })
      return readRegistered({ dependencies, ...outcome, scope })
    },
  }
}
