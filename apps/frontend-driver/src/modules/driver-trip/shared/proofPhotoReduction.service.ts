/* Copyright (c) 2026 Ada Technology. MIT License. */
import { encodeImageToJpeg, loadImageFromFile } from './occurrencePhotoImage.service'
import type { QueuedAttachment } from './offlineAttachments.service'

/**
 * Spec 212: o canhoto usa a régua do envio pelo escritório (`fieldDeliveryImage.service.ts` do
 * painel): lado maior de 2000 px e JPEG em degraus de qualidade até ~900 KiB.
 */
export const PROOF_PHOTO_MAX_SIDE = 2000
export const PROOF_PHOTO_TARGET_BYTES = 900 * 1024
/**
 * Teto duro, cópia de `OFFICE_PROOF_MAX_BYTES` da API (960 KiB): o corpo inteiro da requisição para
 * em 1 MiB (413 antes da rota), e acima de 960 KiB o arquivo volta 422 `TOO_LARGE`.
 */
export const PROOF_PHOTO_MAX_BYTES = 960 * 1024
/** Acima do teto mesmo no piso de qualidade, o lado cai 20% por tentativa, até um canhoto legível. */
const PROOF_PHOTO_SIDE_STEP = 0.8
const PROOF_PHOTO_MINIMUM_SIDE = 640
/** Spec 220 RF17 (spec 161 D12): miniatura JPEG de 320 px, qualidade 0,7, alvo 60 KiB, teto 128 KiB. */
export const PROOF_THUMBNAIL_MAX_SIDE = 320
export const PROOF_THUMBNAIL_START_QUALITY = 0.7
export const PROOF_THUMBNAIL_TARGET_BYTES = 60 * 1024
export const PROOF_THUMBNAIL_MAX_BYTES = 128 * 1024
/** O corpo inteiro da API para em 1 MiB: original + miniatura acima disto voltaria 413 e prenderia a foto. */
const PROOF_REQUEST_FILES_BUDGET_BYTES = 1000 * 1024
/**
 * Defeito medido em produção (01/10): a redução depende de `Image.onload` e `canvas.toBlob`, e
 * nenhuma das duas promete assentar — blob que o navegador não decodifica deixa a promise pendente
 * para sempre. Sem teto, `pendingReduction` nunca sai e a drenagem pula o anexo em toda volta
 * (`offlineAttachments.service.ts`): a foto fica em "enviando" para sempre, sem erro nem
 * retentativa. Estourar o teto é tratado como falha — a marca sai e o original sobe como está.
 */
export const PROOF_PHOTO_REDUCTION_TIMEOUT_MS = 20_000

export type ProofPhotoWithThumbnail = Readonly<{ original: Blob; thumbnail?: Blob }>

export type ReducedProofPhoto = Readonly<{ blob: Blob; fileName: string; thumbnail?: Blob }>

/**
 * Pedido do usuário (26/09): toda foto sai leve do aparelho. O canhoto subia no tamanho da câmera
 * (3–5 MB) e a API recusa o corpo acima de 1 MiB — a foto ficava presa na fila como recusada. Só a
 * **foto** (canhoto ou mercadoria) reduz: assinatura já é PNG pequeno, e PDF anexado não é imagem.
 */
export function shouldReduceProofFile(input: { file: Blob; kind: string }): boolean {
  return (input.kind === 'photo' || input.kind === 'cargo') && input.file.type.startsWith('image/')
}

/** Pura: 2000, 1600, 1280, 1024… até o lado mínimo. */
export function buildProofPhotoSideSequence(): readonly number[] {
  const sides: number[] = []
  for (
    let side = PROOF_PHOTO_MAX_SIDE;
    side >= PROOF_PHOTO_MINIMUM_SIDE;
    side = Math.round(side * PROOF_PHOTO_SIDE_STEP)
  ) {
    sides.push(side)
  }
  return sides
}

/**
 * A primeira tentativa que cabe no teto encerra; nenhuma coube, fica a menor — a drenagem ainda a
 * leva, e a recusa volta com causa, como antes. `encode` é injetado para a régua ser testável sem
 * canvas.
 */
export async function fitProofPhotoWithinCap(input: {
  readonly encode: (maxSide: number) => Promise<Blob>
}): Promise<Blob> {
  let smallest: Blob | undefined
  for (const side of buildProofPhotoSideSequence()) {
    const blob = await input.encode(side)
    if (smallest === undefined || blob.size < smallest.size) smallest = blob
    if (blob.size <= PROOF_PHOTO_MAX_BYTES) return blob
  }
  if (smallest === undefined) throw new Error('PROOF_PHOTO_ENCODE_FAILED')
  return smallest
}

/**
 * A miniatura nunca é condição para o comprovante existir (RF19): falha ao gerar, teto estourado
 * ou corpo que passaria de 1 MiB descartam a miniatura, e o original segue.
 */
export async function buildProofPhotoWithThumbnail(input: {
  readonly encodeThumbnail: (maxSide: number) => Promise<Blob>
  readonly original: Blob
}): Promise<ProofPhotoWithThumbnail> {
  const thumbnail = await input.encodeThumbnail(PROOF_THUMBNAIL_MAX_SIDE).catch(() => undefined)
  if (thumbnail === undefined || thumbnail.size > PROOF_THUMBNAIL_MAX_BYTES) {
    return { original: input.original }
  }
  if (input.original.size + thumbnail.size > PROOF_REQUEST_FILES_BUDGET_BYTES) {
    return { original: input.original }
  }
  return { original: input.original, thumbnail }
}

/** Impura: decodifica uma vez e reencoda pelo canvas, que descarta o EXIF (e o GPS) sozinho. */
export async function reduceProofPhotoToJpeg(file: File): Promise<ReducedProofPhoto> {
  const image = await loadImageFromFile(file)
  const blob = await fitProofPhotoWithinCap({
    encode: (maxSide) =>
      encodeImageToJpeg({ image, maxSide, targetBytes: PROOF_PHOTO_TARGET_BYTES }),
  })
  const { original, thumbnail } = await buildProofPhotoWithThumbnail({
    encodeThumbnail: (maxSide) =>
      encodeImageToJpeg({
        image,
        maxSide,
        startQuality: PROOF_THUMBNAIL_START_QUALITY,
        targetBytes: PROOF_THUMBNAIL_TARGET_BYTES,
      }),
    original: blob,
  })
  const baseName = file.name.replace(/\.[^./\\]+$/u, '') || 'canhoto'
  return {
    blob: original,
    fileName: `${baseName}.jpg`,
    ...(thumbnail === undefined ? {} : { thumbnail }),
  }
}

/**
 * A foto espera a redução (`pendingReduction`) quando nasce, ou quando ficou presa grande demais —
 * a recusa `413 PAYLOAD_TOO_LARGE`/`TRIP_DELIVERY_PROOF_TOO_LARGE` só acontece com arquivo acima do
 * teto, então o tamanho é o critério. Recusada com arquivo pequeno é outra causa: não se mexe.
 */
export function needsProofPhotoReduction(attachment: QueuedAttachment): boolean {
  if (!shouldReduceProofFile({ file: attachment.blob, kind: attachment.kind })) return false
  return attachment.pendingReduction === true || attachment.blob.size > PROOF_PHOTO_MAX_BYTES
}

function withoutReductionMarks(input: {
  readonly item: QueuedAttachment
  readonly isReplaced: boolean
}): QueuedAttachment {
  const next: { -readonly [Key in keyof QueuedAttachment]: QueuedAttachment[Key] } = {
    ...input.item,
  }
  delete next.pendingReduction
  /** O arquivo trocado é outro: a recusa era do anterior, e a drenagem automática volta a levá-lo. */
  if (input.isReplaced) delete next.rejectionCause
  /** A miniatura velha é do arquivo que saiu: a troca traz a nova, ou fica sem. */
  if (input.isReplaced) delete next.thumbnail
  return next
}

/**
 * Troca o arquivo do anexo ainda na fila pela versão reduzida, pela `attachmentKey` — no molde de
 * `applyAttachmentLocation`. Anexo que já saiu da fila fica como está: nada a trocar.
 */
export function replaceAttachmentBlob(input: {
  attachmentKey: string
  blob: Blob
  fileName: string
  items: readonly QueuedAttachment[]
  thumbnail?: Blob
}): readonly QueuedAttachment[] {
  return input.items.map((item) => {
    if (item.attachmentKey !== input.attachmentKey) return item

    return {
      ...withoutReductionMarks({ isReplaced: true, item }),
      blob: input.blob,
      fileName: input.fileName,
      ...(input.thumbnail === undefined ? {} : { thumbnail: input.thumbnail }),
    }
  })
}

/** A redução falhou ou não ganhou nada: tira a marca, e o original sobe como está. */
export function clearPendingReduction(input: {
  attachmentKey: string
  items: readonly QueuedAttachment[]
}): readonly QueuedAttachment[] {
  return input.items.map((item) =>
    item.attachmentKey === input.attachmentKey
      ? withoutReductionMarks({ isReplaced: false, item })
      : item,
  )
}
