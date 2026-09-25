/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T201/RF2a: a **única** garantia de tipo. O `Content-Type` não entra na assinatura da URL
 * de upload — duas URLs com tipos diferentes e o mesmo tamanho saem idênticas — então é aqui, com o
 * objeto já enviado, que o servidor confere tipo, tamanho e sha256 de verdade (`head()` mais os
 * bytes), antes de o objeto virar `stored_objects` e poder ser referenciado por uma ocorrência.
 *
 * Os bytes conferidos são copiados para uma chave final nova: a URL de subida vale 15 minutos e
 * seguiria valendo depois da confirmação — apontar o registro para ela deixaria um PUT tardio do
 * mesmo tamanho trocar o arquivo já conferido. A chave da subida sai depois de o registro gravado.
 */
import { randomBytes } from 'node:crypto'

import {
  assertOccurrenceAttachmentAccepted,
  buildOccurrenceUploadFinalObjectKey,
  OCCURRENCE_PDF_MAX_BYTES,
  OCCURRENCE_PHOTO_MAX_BYTES,
  isOccurrencePdf,
  sha256Hex,
} from '../domain/occurrence-attachment.policy.js'
import { TripOccurrenceUploadNotReachableError } from '../domain/trip.error.js'

export type PendingOccurrenceUpload = {
  readonly bucket: string
  readonly expiresAt: Date
  readonly mimeType: string
  readonly objectKey: string
}

export type OccurrenceUploadConfirmationPort = {
  /**
   * Achado [2] da revisão de 23/09: a linha só é gravada quando o `UPDATE` interno confirma **esta**
   * chamada como dona do `pending → confirmed` (condicionado a `status = 'pending'`). `confirmed:
   * false` é a perdedora de uma corrida — outra chamada já fechou a mesma confirmação entre a
   * leitura e a escrita — e não é erro: é o mesmo reenvio idempotente do achado [1], só que
   * concorrente em vez de sequencial.
   */
  confirmUpload(input: {
    readonly bucket: string
    readonly companyId: string
    readonly id: string
    readonly mimeType: string
    readonly now: Date
    readonly objectKey: string
    readonly sha256: string
    readonly sizeBytes: number
  }): Promise<{ readonly confirmed: boolean }>
  /**
   * Achado [1] da revisão de 23/09: o recall do reenvio idempotente. `null` quando o objeto nunca
   * foi confirmado, não é desta empresa, ou não é desta viagem — os mesmos três motivos de
   * `findPendingUpload` devolver `null` por outro caminho.
   */
  findConfirmedUpload(input: {
    readonly companyId: string
    readonly id: string
    readonly tripId: string
  }): Promise<null | { readonly id: string }>
  /** `null` quando o pedido não existe, não é desta empresa/viagem, ou já não está `pending`. */
  findPendingUpload(input: {
    readonly companyId: string
    readonly id: string
    readonly tripId: string
  }): Promise<null | PendingOccurrenceUpload>
}

export type OccurrenceUploadConfirmationStoragePort = {
  deleteObject(input: { readonly bucket: string; readonly key: string }): Promise<void>
  getObjectStream(input: {
    readonly bucket: string
    readonly key: string
  }): Promise<ReadableStream<Uint8Array>>
  headObject(input: {
    readonly bucket: string
    readonly key: string
  }): Promise<{ readonly contentLength: number } | undefined>
  storeObject(input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }): Promise<unknown>
}

export type ConfirmOccurrenceUploadInput = {
  readonly companyId: string
  readonly id: string
  /** Só para teste; em produção, 256 bits aleatórios. */
  readonly newObjectToken?: () => string
  readonly now: Date
  readonly repository: OccurrenceUploadConfirmationPort
  readonly storage: OccurrenceUploadConfirmationStoragePort
  readonly tripId: string
}

function newOccurrenceObjectToken(): string {
  return randomBytes(32).toString('base64url')
}

type ObjectLocation = { readonly bucket: string; readonly key: string }

/** Grava a cópia final dos bytes conferidos e aponta o registro para ela. */
async function confirmIntoFinalCopy(params: {
  readonly bytes: Uint8Array
  readonly input: ConfirmOccurrenceUploadInput
  readonly pending: PendingOccurrenceUpload
}): Promise<{ readonly confirmed: boolean; readonly finalLocation: ObjectLocation }> {
  const { bytes, input, pending } = params
  const sha256 = sha256Hex(bytes)
  const finalLocation = {
    bucket: pending.bucket,
    key: buildOccurrenceUploadFinalObjectKey({
      companyId: input.companyId,
      token: (input.newObjectToken ?? newOccurrenceObjectToken)(),
      tripId: input.tripId,
    }),
  }
  await input.storage.storeObject({
    ...finalLocation,
    body: bytes,
    contentLength: bytes.byteLength,
    contentType: pending.mimeType,
    sha256,
  })

  try {
    const outcome = await input.repository.confirmUpload({
      bucket: pending.bucket,
      companyId: input.companyId,
      id: input.id,
      mimeType: pending.mimeType,
      now: input.now,
      objectKey: finalLocation.key,
      sha256,
      sizeBytes: bytes.byteLength,
    })
    return { confirmed: outcome.confirmed, finalLocation }
  } catch (error) {
    /** A cópia final sem registro não tem dono: sai do bucket, melhor esforço. */
    await Promise.allSettled([input.storage.deleteObject(finalLocation)])
    throw error
  }
}

export type ConfirmOccurrenceUploadResult = { readonly id: string }

async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

export async function confirmOccurrenceUpload(
  input: ConfirmOccurrenceUploadInput,
): Promise<ConfirmOccurrenceUploadResult> {
  const pending = await input.repository.findPendingUpload({
    companyId: input.companyId,
    id: input.id,
    tripId: input.tripId,
  })
  if (pending === null) {
    /**
     * Achado [1]: `findPendingUpload` só acha `status = 'pending'`. Sem pendência, o motivo mais
     * comum não é "nunca existiu" — é a fila offline reenviando uma confirmação que já venceu. O
     * reenvio devolve o mesmo resultado em vez de 404; só quando nem confirmado ele é, o objeto é
     * mesmo inalcançável (nunca existiu, ou é de outra empresa/viagem).
     */
    const alreadyConfirmed = await input.repository.findConfirmedUpload({
      companyId: input.companyId,
      id: input.id,
      tripId: input.tripId,
    })
    if (alreadyConfirmed !== null) return alreadyConfirmed
    throw new TripOccurrenceUploadNotReachableError()
  }
  if (pending.expiresAt.getTime() <= input.now.getTime()) {
    throw new TripOccurrenceUploadNotReachableError()
  }

  const location = { bucket: pending.bucket, key: pending.objectKey }
  const head = await input.storage.headObject(location)
  if (head === undefined) throw new TripOccurrenceUploadNotReachableError()

  /**
   * Confere o tamanho pelo `head()` **antes** de baixar os bytes — um upload maior que o teto não
   * precisa ser lido inteiro para ser recusado.
   */
  const maxBytes = isOccurrencePdf(pending.mimeType)
    ? OCCURRENCE_PDF_MAX_BYTES
    : OCCURRENCE_PHOTO_MAX_BYTES
  if (head.contentLength > maxBytes) {
    throw new TripOccurrenceUploadNotReachableError()
  }

  const bytes = await readAllBytes(await input.storage.getObjectStream(location))

  /**
   * A única checagem que decide se o tipo declarado bate com o arquivo de verdade — assinatura de
   * bytes, não `Content-Type` (RF2a). Lança `TripDeliveryProofRejectedError` quando não bate.
   */
  assertOccurrenceAttachmentAccepted({
    bytes,
    imageMaxBytes: OCCURRENCE_PHOTO_MAX_BYTES,
    mimeType: pending.mimeType,
  })

  const outcome = await confirmIntoFinalCopy({ bytes, input, pending })
  if (outcome.confirmed) {
    /** Falha em apagar deixa um objeto que nada referencia — nunca o registro apontando para ele. */
    await Promise.allSettled([input.storage.deleteObject(location)])
    return { id: input.id }
  }

  /**
   * Achado [2]: perdeu a corrida — outra confirmação concorrente já fechou `pending → confirmed`
   * entre a leitura acima e este `UPDATE`. O mesmo recall do achado [1] devolve o resultado da
   * vencedora em vez de um 500 de violação de chave única. A cópia final desta chamada não virou
   * registro e sai do bucket; a chave da subida é da vencedora apagar.
   */
  await Promise.allSettled([input.storage.deleteObject(outcome.finalLocation)])
  const wonByConcurrentCall = await input.repository.findConfirmedUpload({
    companyId: input.companyId,
    id: input.id,
    tripId: input.tripId,
  })
  if (wonByConcurrentCall !== null) return wonByConcurrentCall
  throw new TripOccurrenceUploadNotReachableError()
}
