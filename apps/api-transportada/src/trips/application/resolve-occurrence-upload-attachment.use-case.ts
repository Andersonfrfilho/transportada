/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T201/RF2b: a ocorrência só referencia um objeto que **existe, é desta empresa e veio
 * desta viagem** — sem isso o cliente escolheria qual objeto anexar, o que é pior do que não ter
 * anexo. Usado por `register-driver-occurrence.use-case.ts` (T203) antes de gravar a ocorrência.
 */
import { TripOccurrenceUploadNotReachableError } from '../domain/trip.error.js'

export type OccurrenceUploadAttachmentPort = {
  /** `null` quando o objeto não existe, não é desta empresa, não é desta viagem, ou não foi confirmado. */
  findConfirmedUpload(input: {
    readonly companyId: string
    readonly id: string
    readonly tripId: string
  }): Promise<null | { readonly id: string }>
}

export async function resolveOccurrenceUploadAttachment(input: {
  readonly companyId: string
  readonly objectId: string
  readonly repository: OccurrenceUploadAttachmentPort
  readonly tripId: string
}): Promise<{ readonly id: string }> {
  const upload = await input.repository.findConfirmedUpload({
    companyId: input.companyId,
    id: input.objectId,
    tripId: input.tripId,
  })
  if (upload === null) throw new TripOccurrenceUploadNotReachableError()

  return upload
}
