/* Copyright (c) 2026 Ada Technology. MIT License. */

/** D9: lado maior ≤ 2000px — mesmo teto que a spec pede para o envio do canhoto pelo escritório. */
export const FIELD_DELIVERY_IMAGE_MAX_SIDE = 2000
const FIELD_DELIVERY_IMAGE_QUALITY = 0.85
/** M7 (spec 156 T15): teto de tamanho do arquivo — câmeras de aparelho médio ainda estouram isso
 * mesmo em 2000px de lado; a qualidade cai em degraus até caber ou até o piso de legibilidade. */
export const FIELD_DELIVERY_IMAGE_TARGET_BYTES = 900 * 1024
const FIELD_DELIVERY_IMAGE_MINIMUM_QUALITY = 0.5
const FIELD_DELIVERY_IMAGE_QUALITY_STEP = 0.1
/** Spec 220 RF17 (spec 161 D12): miniatura JPEG de 320 px, qualidade 0,7, alvo 60 KiB, teto 128 KiB. */
export const FIELD_DELIVERY_THUMBNAIL_MAX_SIDE = 320
const FIELD_DELIVERY_THUMBNAIL_START_QUALITY = 0.7
const FIELD_DELIVERY_THUMBNAIL_TARGET_BYTES = 60 * 1024
export const FIELD_DELIVERY_THUMBNAIL_MAX_BYTES = 128 * 1024
/** O corpo inteiro da API para em 1 MiB: original + miniatura acima disto voltaria 413 e prenderia a foto. */
const FIELD_DELIVERY_REQUEST_FILES_BUDGET_BYTES = 1000 * 1024

export type FieldDeliveryImageSize = Readonly<{ height: number; width: number }>

/**
 * Pura: a conta de proporção não depende de canvas nem de imagem real, e é a parte que mais quebra
 * por arredondamento — por isso separada de `reduceFieldDeliveryImageToJpeg`, que precisa de canvas
 * e não roda no ambiente de teste.
 */
export function computeFieldDeliveryImageDimensions(
  { height, width }: FieldDeliveryImageSize,
  maxSide: number = FIELD_DELIVERY_IMAGE_MAX_SIDE,
): FieldDeliveryImageSize {
  const largestSide = Math.max(height, width)
  if (largestSide <= maxSide) return { height, width }

  const scale = maxSide / largestSide
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

/**
 * M7 (spec 156 T15): pura — a sequência de qualidades tentadas até caber no teto de bytes, do
 * padrão (0.85) até o piso de legibilidade (0.5), em degraus de 0.1. Separada da parte impura
 * (`canvas.toBlob`, que não roda no ambiente de teste) para o degrau ser testável sozinho.
 */
export function buildFieldDeliveryImageQualitySequence(
  startQuality: number = FIELD_DELIVERY_IMAGE_QUALITY,
): readonly number[] {
  const sequence: number[] = []
  for (
    let quality = startQuality;
    quality > FIELD_DELIVERY_IMAGE_MINIMUM_QUALITY;
    quality -= FIELD_DELIVERY_IMAGE_QUALITY_STEP
  ) {
    sequence.push(Math.round(quality * 100) / 100)
  }
  sequence.push(FIELD_DELIVERY_IMAGE_MINIMUM_QUALITY)
  return sequence
}

function encodeCanvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob === null ? reject(new Error('FIELD_DELIVERY_IMAGE_ENCODE_FAILED')) : resolve(blob),
      'image/jpeg',
      quality,
    )
  })
}

async function encodeImageWithinTarget(input: {
  maxSide: number
  source: CanvasImageSource
  sourceSize: FieldDeliveryImageSize
  startQuality: number
  targetBytes: number
}): Promise<Blob> {
  const { height, width } = computeFieldDeliveryImageDimensions(input.sourceSize, input.maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) return Promise.reject(new Error('FIELD_DELIVERY_CANVAS_UNAVAILABLE'))
  context.drawImage(input.source, 0, 0, width, height)

  let smallestBlob: Blob | undefined
  for (const quality of buildFieldDeliveryImageQualitySequence(input.startQuality)) {
    const blob = await encodeCanvasToJpeg(canvas, quality)
    if (smallestBlob === undefined || blob.size < smallestBlob.size) smallestBlob = blob
    if (blob.size <= input.targetBytes) return blob
  }
  return smallestBlob as Blob
}

/**
 * Impura: desenha a fonte num canvas do tamanho reduzido e exporta JPEG, baixando a qualidade em
 * degraus (M7) até o arquivo caber em `FIELD_DELIVERY_IMAGE_TARGET_BYTES` ou até o piso de
 * legibilidade — o que vier primeiro; o piso ainda sai menor que a foto sem compressão nenhuma, e a
 * régua nunca aceita degradar mais que isso. Reencodar pelo canvas já descarta o EXIF sozinho —
 * nenhum metadado é copiado da fonte, então "sem EXIF" (D9) sai de graça daqui, sem lib extra.
 */
export function reduceFieldDeliveryImageToJpeg(
  source: CanvasImageSource,
  sourceSize: FieldDeliveryImageSize,
): Promise<Blob> {
  return encodeImageWithinTarget({
    maxSide: FIELD_DELIVERY_IMAGE_MAX_SIDE,
    source,
    sourceSize,
    startQuality: FIELD_DELIVERY_IMAGE_QUALITY,
    targetBytes: FIELD_DELIVERY_IMAGE_TARGET_BYTES,
  })
}

export type FieldDeliveryImageWithThumbnail = Readonly<{ original: Blob; thumbnail?: Blob }>

/**
 * A miniatura nunca é condição para o comprovante existir (RF19): falha ao gerar, teto estourado
 * ou corpo que passaria de 1 MiB descartam a miniatura, e o original segue.
 */
export async function buildFieldDeliveryImageWithThumbnail(input: {
  readonly encodeThumbnail: (maxSide: number) => Promise<Blob>
  readonly original: Blob
}): Promise<FieldDeliveryImageWithThumbnail> {
  const thumbnail = await input
    .encodeThumbnail(FIELD_DELIVERY_THUMBNAIL_MAX_SIDE)
    .catch(() => undefined)
  if (thumbnail === undefined || thumbnail.size > FIELD_DELIVERY_THUMBNAIL_MAX_BYTES) {
    return { original: input.original }
  }
  if (input.original.size + thumbnail.size > FIELD_DELIVERY_REQUEST_FILES_BUDGET_BYTES) {
    return { original: input.original }
  }
  return { original: input.original, thumbnail }
}

/** O arquivo escolhido pelo operador (canhoto escaneado, foto de ocorrência) vira `<img>` para
 * poder ser desenhado num canvas — mesmo caminho da captura pela câmera. */
export function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve(image)
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      reject(new Error('FIELD_DELIVERY_IMAGE_LOAD_FAILED'))
      URL.revokeObjectURL(url)
    }
    image.src = url
  })
}

/**
 * M7 (spec 156 T15): mesma redução da foto do canhoto (lado ≤ 2000px, JPEG até ~900 KB, sem EXIF)
 * aplicada a qualquer `File` escolhido pelo operador — hoje usada na foto da ocorrência de campo
 * (`FieldOccurrenceDialog`), que ia para a API crua, sem teto de tamanho nem remoção de metadado.
 */
export async function reduceImageFileToJpeg(file: File): Promise<File> {
  const image = await loadImageFromFile(file)
  const blob = await reduceFieldDeliveryImageToJpeg(image, {
    height: image.naturalHeight,
    width: image.naturalWidth,
  })
  const name = file.name.replace(/\.[^./\\]+$/u, '') || file.name
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
}

/**
 * Impura: a miniatura sai do JPEG final que vai ser enviado (já recortado, se foi o caso), e nunca
 * lança — sem miniatura o original sobe sozinho (RF19).
 */
export async function createFieldDeliveryThumbnail(original: Blob): Promise<Blob | undefined> {
  const { thumbnail } = await buildFieldDeliveryImageWithThumbnail({
    encodeThumbnail: async (maxSide) => {
      const image = await loadImageFromFile(original)
      return encodeImageWithinTarget({
        maxSide,
        source: image,
        sourceSize: { height: image.naturalHeight, width: image.naturalWidth },
        startQuality: FIELD_DELIVERY_THUMBNAIL_START_QUALITY,
        targetBytes: FIELD_DELIVERY_THUMBNAIL_TARGET_BYTES,
      })
    },
    original,
  })
  return thumbnail
}
