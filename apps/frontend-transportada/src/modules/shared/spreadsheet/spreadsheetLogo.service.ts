/** Copyright (c) 2026 Ada Technology. MIT License. */

export type SpreadsheetLogo = Readonly<{
  content: Blob
  contentType: 'image/png'
  height: number
  width: number
}>

/** Altura do logo no timbre: cabe nas linhas do nome, dos dados e do título sem cobrir a tabela. */
const LOGO_HEIGHT_PIXELS = 64
const LOGO_RENDER_SCALE = 2

/** `createImageBitmap` não decodifica SVG (o ícone do produto); o elemento `<img>` decodifica todos. */
function readImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('LOGO_DECODE_FAILED'))
    }
    image.src = objectUrl
  })
}

/**
 * O Excel só aceita PNG ou JPEG, e o logo pode ser WebP ou SVG (o ícone do produto): tudo passa pelo
 * canvas e sai PNG, com o dobro da resolução para não borrar ao ampliar.
 *
 * Devolve `undefined` quando a imagem não chega ou não decodifica — o timbre sai sem logo, nunca
 * trava a exportação.
 */
export async function loadSpreadsheetLogo(
  input: Readonly<{ fetch: typeof globalThis.fetch; url: string }>,
): Promise<SpreadsheetLogo | undefined> {
  try {
    const response = await input.fetch(input.url)
    if (!response.ok) return undefined
    const image = await readImage(await response.blob())
    /** SVG sem tamanho próprio decodifica com 0×0: sem proporção conhecida, o logo sai quadrado. */
    const ratio =
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : 1
    const width = Math.max(1, Math.round(ratio * LOGO_HEIGHT_PIXELS))
    const canvas = document.createElement('canvas')
    canvas.width = width * LOGO_RENDER_SCALE
    canvas.height = LOGO_HEIGHT_PIXELS * LOGO_RENDER_SCALE
    const context = canvas.getContext('2d')
    if (context === null) return undefined
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const content = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return content === null
      ? undefined
      : { content, contentType: 'image/png', height: LOGO_HEIGHT_PIXELS, width }
  } catch {
    return undefined
  }
}
