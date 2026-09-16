/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Espelha `USER_PICTURE_MAX_BYTES` da API: acima disso ela responde `USER_PICTURE_TOO_LARGE`. */
export const USER_PICTURE_MAX_BYTES = 262_144

/** Avatar se desenha com poucos rem: passar de 512 px é pagar bytes que a tela nunca mostra. */
const PICTURE_DIMENSION_STEPS = [512, 384, 256] as const
const PICTURE_QUALITY_STEPS = [0.85, 0.7, 0.5] as const

/** WebP guarda o fundo transparente do recorte; JPEG fica para o navegador que não codifica WebP. */
const PICTURE_ENCODING_TYPES = ['image/webp', 'image/jpeg'] as const

export type PictureEncodeAttempt = Readonly<{
  maxDimension: number
  quality: number
  type: string
}>

export type PictureEncoder = (attempt: PictureEncodeAttempt) => Promise<Blob | null>

export type CompressUserPictureParams = Readonly<{
  encode: PictureEncoder
  file: Blob
}>

export function listPictureEncodeAttempts(): readonly PictureEncodeAttempt[] {
  return PICTURE_ENCODING_TYPES.flatMap((type) =>
    PICTURE_DIMENSION_STEPS.flatMap((maxDimension) =>
      PICTURE_QUALITY_STEPS.map((quality) => ({ maxDimension, quality, type })),
    ),
  )
}

/**
 * Quem escolhe a foto não sabe o que é 256 KB — a foto do celular passa disso sempre. O navegador
 * reduz e recomprime até caber; o arquivo que já cabe segue intacto, sem perder qualidade à toa.
 */
export async function compressUserPicture(params: CompressUserPictureParams): Promise<Blob> {
  if (params.file.size <= USER_PICTURE_MAX_BYTES) return params.file

  for (const attempt of listPictureEncodeAttempts()) {
    const encoded = await params.encode(attempt)
    /** Safari devolve PNG quando não sabe codificar o tipo pedido: esse resultado não vale. */
    if (encoded === null || encoded.type !== attempt.type) continue
    if (encoded.size <= USER_PICTURE_MAX_BYTES) return encoded
  }

  return params.file
}

/** A imagem é decodificada uma vez; cada tentativa só redesenha e recodifica. */
export async function createCanvasPictureEncoder(file: Blob): Promise<PictureEncoder> {
  const bitmap = await createImageBitmap(file)

  return (attempt) => {
    const scale = Math.min(1, attempt.maxDimension / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (context === null) return Promise.resolve(null)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    return new Promise((resolve) => canvas.toBlob(resolve, attempt.type, attempt.quality))
  }
}

/** Arquivo que o navegador não decodifica (HEIC, corrompido) segue cru: a API diz o que houve. */
export async function prepareUserPictureUpload(file: Blob): Promise<Blob> {
  if (file.size <= USER_PICTURE_MAX_BYTES) return file

  try {
    const encode = await createCanvasPictureEncoder(file)
    return await compressUserPicture({ encode, file })
  } catch {
    return file
  }
}
