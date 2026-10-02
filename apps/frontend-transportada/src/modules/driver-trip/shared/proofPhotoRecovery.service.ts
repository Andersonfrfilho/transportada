/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AttachmentStore, QueuedAttachment } from './offlineAttachments.service'
import {
  clearPendingReduction,
  needsProofPhotoReduction,
  PROOF_PHOTO_REDUCTION_TIMEOUT_MS,
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
  /** Só o teste aperta o teto; em produção vale `PROOF_PHOTO_REDUCTION_TIMEOUT_MS`. */
  reductionTimeoutMs?: number
  reductions: ProofPhotoReductions
}>

/**
 * `undefined` tanto na falha quanto no estouro do teto: quem chama trata os dois igual — a marca sai
 * e o original sobe como está. Um `413` com causa visível é melhor que uma foto presa em silêncio.
 */
export async function settleReductionWithinTimeout(input: {
  readonly reduction: Promise<ReducedProofPhoto>
  readonly timeoutMs?: number
}): Promise<ReducedProofPhoto | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expiry = new Promise<undefined>((resolve) => {
    timer = setTimeout(
      () => resolve(undefined),
      input.timeoutMs ?? PROOF_PHOTO_REDUCTION_TIMEOUT_MS,
    )
  })

  try {
    return await Promise.race([input.reduction.catch(() => undefined), expiry])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function runReduction(input: ReduceQueuedProofPhotoInput): Promise<void> {
  const { attachment } = input
  const source = new File([attachment.blob], attachment.fileName, { type: attachment.blob.type })
  const reduced = await settleReductionWithinTimeout({
    reduction: input.reduce(source),
    ...(input.reductionTimeoutMs === undefined ? {} : { timeoutMs: input.reductionTimeoutMs }),
  })
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
  /** Só o teste aperta o teto; em produção vale `PROOF_PHOTO_REDUCTION_TIMEOUT_MS`. */
  readonly reductionTimeoutMs?: number
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
