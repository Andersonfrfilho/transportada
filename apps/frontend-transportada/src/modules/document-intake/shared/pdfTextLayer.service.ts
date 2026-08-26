/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 048: o PDF é lido **na máquina do operador**. `File` → `ArrayBuffer` → pdf.js, sem
 * requisição, sem origem nova na CSP e sem nada gravado — o arquivo vive na memória da aba e é
 * descartado.
 *
 * O carregador entra por parâmetro porque o pdf.js tem dois builds e os dois são necessários: o
 * normal quebra em Node (`DOMMatrix is not defined`) e o `legacy/` é o que o teste consegue rodar.
 * Amarrar o `import` aqui dentro deixaria esta camada sem teste automatizado nenhum.
 */

export type PdfTextFragment = Readonly<{
  /** Altura da fonte do fragmento, em pontos — é o que dá escala ao "topo da página". */
  height: number
  text: string
  /** `transform[4]` do pdf.js: o x do início do fragmento, em pontos, origem no canto inferior. */
  x: number
  /** `transform[5]`: o y, crescendo para cima. */
  y: number
}>

export type PdfPageText = Readonly<{
  fragments: readonly PdfTextFragment[]
  height: number
}>

type PdfTextItem = Readonly<{
  height?: number
  str?: string
  transform?: readonly number[]
}>

type PdfPageProxy = Readonly<{
  getTextContent: () => Promise<{ items: readonly unknown[] }>
  getViewport: (parameters: { scale: number }) => { height: number }
}>

type PdfDocumentProxy = Readonly<{
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
  numPages: number
}>

type PdfLoadingTask = Readonly<{
  destroy: () => Promise<void>
  promise: Promise<PdfDocumentProxy>
}>

export type PdfGetDocument = (parameters: {
  data: Uint8Array
  isEvalSupported: boolean
}) => PdfLoadingTask

/** Uma página basta: o CRLV-e é uma folha, e ler o documento inteiro é ler PII que ninguém pediu. */
const MAX_PAGES_READ = 1

function isTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null && 'str' in item
}

/**
 * O `getTextContent` intercala fragmentos de string vazia — marcas de posicionamento sem conteúdo.
 * Eles entram na conta geométrica como vizinho fantasma logo acima do valor de verdade, e o rótulo
 * casa com o nada.
 */
function toFragment(item: PdfTextItem): PdfTextFragment | undefined {
  const text = (item.str ?? '').trim()
  const x = item.transform?.[4]
  const y = item.transform?.[5]
  if (text.length === 0 || x === undefined || y === undefined) return undefined

  return { height: item.height ?? 0, text, x, y }
}

/**
 * `isEvalSupported: false` é o que mantém a CSP publicada intacta: `script-src 'self'` não tem
 * `unsafe-eval`, e o pdf.js só usa `eval` no atalho de fonte que essa opção desliga.
 */
export async function readPdfTextLayer(input: {
  data: Uint8Array
  getDocument: PdfGetDocument
}): Promise<PdfPageText> {
  const task = input.getDocument({ data: input.data, isEvalSupported: false })
  try {
    const document = await task.promise
    const page = await document.getPage(MAX_PAGES_READ)
    const [content, viewport] = [await page.getTextContent(), page.getViewport({ scale: 1 })]
    const fragments = content.items
      .filter(isTextItem)
      .map(toFragment)
      .filter((fragment): fragment is PdfTextFragment => fragment !== undefined)

    return { fragments, height: viewport.height }
  } finally {
    await task.destroy()
  }
}
