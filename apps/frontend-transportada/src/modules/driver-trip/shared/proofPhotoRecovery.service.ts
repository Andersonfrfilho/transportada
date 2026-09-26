/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AttachmentStore, QueuedAttachment } from './offlineAttachments.service'
import {
  clearPendingReduction,
  needsProofPhotoReduction,
  replaceAttachmentBlob,
  type ReducedProofPhoto,
} from './proofPhotoReduction.service'

export type ProofPhotoReducer = (file: File) => Promise<ReducedProofPhoto>

/** As reduções em voo, pela `attachmentKey` — vive na memória do hook, uma por instância. */
export type ProofPhotoReductions = Map<string, Promise<void>>

type ReduceQueuedProofPhotoInput = Readonly<{
  attachment: QueuedAttachment
  attachmentStore: AttachmentStore
  eventKey: string
  reduce: ProofPhotoReducer
  reductions: ProofPhotoReductions
}>

async function runReduction(input: ReduceQueuedProofPhotoInput): Promise<void> {
  const { attachment } = input
  const source = new File([attachment.blob], attachment.fileName, { type: attachment.blob.type })
  const reduced = await input.reduce(source).catch(() => undefined)
  const replacement =
    reduced !== undefined && reduced.blob.size < attachment.blob.size ? reduced : undefined
  await input.attachmentStore.update({
    eventKey: input.eventKey,
    mutate: (items) =>
      replacement === undefined
        ? clearPendingReduction({ attachmentKey: attachment.attachmentKey, items })
        : replaceAttachmentBlob({
            attachmentKey: attachment.attachmentKey,
            blob: replacement.blob,
            fileName: replacement.fileName,
            items,
          }),
  })
}

/**
 * Spec 212: reduz a foto **já gravada** e troca o arquivo no mesmo item (a gravação vem antes,
 * spec 203). Uma redução por anexo: quem chega com a mesma chave espera a que já roda. Falhar nunca
 * perde a foto — a marca sai e o original sobe como está.
 */
export function reduceQueuedProofPhoto(input: ReduceQueuedProofPhotoInput): Promise<void> {
  const key = input.attachment.attachmentKey
  const running = input.reductions.get(key)
  if (running !== undefined) return running

  const task = runReduction(input).finally(() => input.reductions.delete(key))
  input.reductions.set(key, task)
  return task
}

/**
 * Spec 212: no boot e antes de cada drenagem. Espera as reduções em voo (a captura recém-gravada)
 * e reduz o que ficou para trás: a foto grande presa com `413`/`TOO_LARGE` — a causa sai junto, e a
 * drenagem automática volta a levá-la — e a marca que sobrou do app fechado no meio da redução.
 */
export async function recoverQueuedProofPhotos(input: {
  readonly attachmentStore: AttachmentStore
  readonly reduce: ProofPhotoReducer
  readonly reductions: ProofPhotoReductions
}): Promise<number> {
  await Promise.all(input.reductions.values())
  const groups = await input.attachmentStore.readAll()
  const targets = groups.flatMap(([eventKey, attachments]) =>
    attachments
      .filter((attachment) => needsProofPhotoReduction(attachment))
      .map((attachment) => ({ attachment, eventKey })),
  )

  /** Uma de cada vez: decodificar várias fotos de câmera juntas estoura a memória do aparelho. */
  for (const target of targets) {
    await reduceQueuedProofPhoto({ ...target, ...input })
  }
  return targets.length
}
