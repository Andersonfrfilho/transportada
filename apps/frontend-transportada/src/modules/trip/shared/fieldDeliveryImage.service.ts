/* Copyright (c) 2026 Ada Technology. MIT License. */

/** D9: lado maior ≤ 2000px — mesmo teto que a spec pede para o envio do canhoto pelo escritório. */
export const FIELD_DELIVERY_IMAGE_MAX_SIDE = 2000
const FIELD_DELIVERY_IMAGE_QUALITY = 0.85

export type FieldDeliveryImageSize = Readonly<{ height: number; width: number }>

/**
 * Pura: a conta de proporção não depende de canvas nem de imagem real, e é a parte que mais quebra
 * por arredondamento — por isso separada de `reduceFieldDeliveryImageToJpeg`, que precisa de canvas
 * e não roda no ambiente de teste.
 */
export function computeFieldDeliveryImageDimensions({
  height,
  width,
}: FieldDeliveryImageSize): FieldDeliveryImageSize {
  const largestSide = Math.max(height, width)
  if (largestSide <= FIELD_DELIVERY_IMAGE_MAX_SIDE) return { height, width }

  const scale = FIELD_DELIVERY_IMAGE_MAX_SIDE / largestSide
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

/**
 * Impura: desenha o quadro capturado num canvas do tamanho reduzido e exporta JPEG. Reencodar pelo
 * canvas já descarta o EXIF sozinho — nenhum metadado é copiado da fonte, então "sem EXIF" (D9) sai
 * de graça daqui, sem biblioteca extra.
 */
export function reduceFieldDeliveryImageToJpeg(
  source: CanvasImageSource,
  sourceSize: FieldDeliveryImageSize,
): Promise<Blob> {
  const { height, width } = computeFieldDeliveryImageDimensions(sourceSize)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) return Promise.reject(new Error('FIELD_DELIVERY_CANVAS_UNAVAILABLE'))
  context.drawImage(source, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob === null ? reject(new Error('FIELD_DELIVERY_IMAGE_ENCODE_FAILED')) : resolve(blob),
      'image/jpeg',
      FIELD_DELIVERY_IMAGE_QUALITY,
    )
  })
}
