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
 * Pedido do usuário (14/10): a qualidade acompanha o tempo que a redução anterior levou neste
 * aparelho. Rápido (sem medida ainda, ou menos de 3 s) fica em 0,9; depois desce por faixas até 0,5
 * (o piso de legibilidade), para o aparelho lento não arriscar o orçamento de 8 s (spec 265). Cada degrau do
 * `toBlob` é caro em aparelho fraco, por isso a faixa lenta já começa baixa.
 */
export const PROOF_PHOTO_QUALITY_BANDS: readonly Readonly<{
  maxDurationMs: number
  quality: number
}>[] = [
  { maxDurationMs: 3_000, quality: 0.9 },
  { maxDurationMs: 5_000, quality: 0.85 },
  { maxDurationMs: 8_000, quality: 0.7 },
  { maxDurationMs: 10_000, quality: 0.6 },
]
export const PROOF_PHOTO_SLOWEST_QUALITY = 0.5
const PROOF_PHOTO_LAST_DURATION_KEY = 'driver.proofPhotoReduction.lastDurationMs'

/** Pura: a primeira faixa cujo teto de tempo comporta a medida; acima de todas, 0,5. */
export function resolveProofPhotoStartQuality(lastDurationMs: number | undefined): number {
  if (lastDurationMs === undefined) return PROOF_PHOTO_QUALITY_BANDS[0]?.quality ?? 0.9
  const band = PROOF_PHOTO_QUALITY_BANDS.find((item) => lastDurationMs < item.maxDurationMs)
  return band?.quality ?? PROOF_PHOTO_SLOWEST_QUALITY
}

function readLastReductionDuration(): number | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(PROOF_PHOTO_LAST_DURATION_KEY)
    const value = raw === null || raw === undefined ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? value : undefined
  } catch {
    return undefined
  }
}

function rememberReductionDuration(durationMs: number): void {
  try {
    globalThis.localStorage?.setItem(PROOF_PHOTO_LAST_DURATION_KEY, String(durationMs))
  } catch {
    /** Sem armazenamento (aba privada): a próxima foto começa em 0,9 e mede de novo. */
  }
}
/**
 * Teto duro, cópia de `OFFICE_PROOF_MAX_BYTES` da API (960 KiB): o corpo inteiro da requisição para
 * em 1 MiB (413 antes da rota), e acima de 960 KiB o arquivo volta 422 `TOO_LARGE`.
 */
export const PROOF_PHOTO_MAX_BYTES = 960 * 1024
/**
 * Spec 265 RF3/RF1: cópia por valor de `PROOF_ORIGINAL_MAX_BYTES` da API (ADR-0075 §7) — o teto do
 * **original** que sobe sem redução com `variant = 'original'`. Acima dele a API recusa 422
 * `TRIP_DELIVERY_PROOF_TOO_LARGE`; o app recusa antes, sem gastar dados. A paridade é vigiada por
 * `test/driver-trip/proof-original-parity.contract.ts`.
 */
export const PROOF_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024
export const PROOF_UPLOAD_VARIANTS = ['reduced', 'original'] as const
export type ProofUploadVariant = (typeof PROOF_UPLOAD_VARIANTS)[number]

/**
 * Spec 265 RF3: a variante que o multipart declara. Foto (ou mercadoria) acima do teto leve sobe como
 * `original`; a que coube sobe como `reduced`. Assinatura e PDF não passam pela redução: sem variante.
 */
export function resolveProofUploadVariant(input: {
  readonly file: Blob
  readonly kind: string
}): ProofUploadVariant | undefined {
  if (!shouldReduceProofFile(input)) return undefined
  return input.file.size > PROOF_PHOTO_MAX_BYTES ? 'original' : 'reduced'
}

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
 * Spec 265 RF9 (decisão de 14/10): o orçamento da redução é **8 s, fixo**. Defeito medido em produção
 * (01/10 e 14/10): a redução depende de `Image.onload` e `canvas.toBlob`, e em aparelho fraco (SM-A125M:
 * 10,6 s) ou com blob que o navegador não decodifica ela não assenta. Estourar o orçamento abandona a
 * redução (cancela entre os degraus) e o ORIGINAL sobe com `variant = 'original'`, até 12 MiB.
 */
export const PROOF_PHOTO_REDUCTION_BUDGET_MS = 8_000
/** Nome antigo (teto de 20 s): mantido como alias para quem ainda importa; vale o orçamento. */
export const PROOF_PHOTO_REDUCTION_TIMEOUT_MS = PROOF_PHOTO_REDUCTION_BUDGET_MS

/** A redução abandonada: o chamador cancelou (orçamento estourado) e o degrau seguinte não roda. */
export class ProofPhotoReductionCancelledError extends Error {
  constructor() {
    super('PROOF_PHOTO_REDUCTION_CANCELLED')
    this.name = 'ProofPhotoReductionCancelledError'
  }
}

/**
 * Pedido do usuário (14/10): a redução mostra porcentagem. É estimativa pelo tempo gasto contra o
 * teto, não progresso real do canvas (que não reporta nenhum): trava em 99 enquanto a redução não
 * termina, para a tela nunca dizer 100% de algo que ainda roda.
 */
export function resolveProofReductionPercent(input: {
  readonly elapsedMs: number
  readonly timeoutMs?: number
}): number {
  const timeoutMs = input.timeoutMs ?? PROOF_PHOTO_REDUCTION_BUDGET_MS
  const raw = Math.floor((Math.max(0, input.elapsedMs) / timeoutMs) * 100)
  return Math.min(99, raw)
}

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
  /** Spec 265 RF9: orçamento estourado — o próximo degrau (caro) não roda. */
  readonly signal?: AbortSignal
}): Promise<Blob> {
  let smallest: Blob | undefined
  for (const side of buildProofPhotoSideSequence()) {
    if (input.signal?.aborted === true) throw new ProofPhotoReductionCancelledError()
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
export async function reduceProofPhotoToJpeg(
  file: File,
  options: { readonly signal?: AbortSignal } = {},
): Promise<ReducedProofPhoto> {
  const startedAt = Date.now()
  const { signal } = options
  const startQuality = resolveProofPhotoStartQuality(readLastReductionDuration())
  try {
    return await reduceWithin({ file, signal, startQuality })
  } catch (error) {
    /** Abandonada por orçamento: a medida vira o orçamento, e a próxima foto sai em faixa mais baixa. */
    if (error instanceof ProofPhotoReductionCancelledError) {
      rememberReductionDuration(Math.max(Date.now() - startedAt, PROOF_PHOTO_REDUCTION_BUDGET_MS))
    }
    throw error
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new ProofPhotoReductionCancelledError()
}

async function reduceWithin(input: {
  readonly file: File
  readonly signal: AbortSignal | undefined
  readonly startQuality: number
}): Promise<ReducedProofPhoto> {
  const { file, signal, startQuality } = input
  const startedAt = Date.now()
  const image = await loadImageFromFile(file)
  throwIfCancelled(signal)
  const blob = await fitProofPhotoWithinCap({
    ...(signal === undefined ? {} : { signal }),
    encode: (maxSide) =>
      encodeImageToJpeg({
        image,
        maxSide,
        startQuality,
        targetBytes: PROOF_PHOTO_TARGET_BYTES,
      }),
  })
  throwIfCancelled(signal)
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
  rememberReductionDuration(Date.now() - startedAt)
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
  /** Spec 265: a redução abandonada por orçamento não volta a gastar 8 s a cada drenagem — o original sobe. */
  if (attachment.reductionAbandoned === true) return false
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
  if (input.isReplaced) delete next.reductionAbandoned
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

/**
 * A redução falhou, estourou o orçamento ou não ganhou nada: tira a marca, e o original sobe como está
 * (spec 265: com `variant = 'original'`). `reductionAbandoned` impede nova tentativa a cada drenagem.
 */
export function clearPendingReduction(input: {
  attachmentKey: string
  items: readonly QueuedAttachment[]
}): readonly QueuedAttachment[] {
  return input.items.map((item) =>
    item.attachmentKey === input.attachmentKey
      ? { ...withoutReductionMarks({ isReplaced: false, item }), reductionAbandoned: true as const }
      : item,
  )
}
