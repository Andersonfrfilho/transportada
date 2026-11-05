/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Protótipo do spike T4.8a (spec 294): OCR local (tesseract.js + `por`) para dizer se a foto é um
 * canhoto assinado. Descartável — não é código de produção. Lê as imagens de um diretório e um
 * manifesto `nome<TAB>ambiente<TAB>rótulo`; imprime só índice opaco, marcas achadas e tempos.
 * Nunca imprime o texto reconhecido (é documento fiscal com nome e endereço).
 *
 * Dependências fora do repositório (instalar numa pasta descartável, nunca nas apps):
 *   bun add tesseract.js@5.1.1 sharp@0.33.5 @zxing/library@0.23.0
 *   curl -L -o lang/por.traineddata.gz \
 *     https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int/por.traineddata.gz
 *
 * Uso: OCR_LONG_SIDE=2400 PSM=11 EARLY_STOP=3 \
 *   bun canhoto-classifier.spike.ts <dir-imagens> <manifesto.tsv> <dir-lang>
 * (sem as variáveis roda a configuração 1 do spike: 1600 px, segmentação automática, parada em 2 marcas)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { BinaryBitmap, Code128Reader, HybridBinarizer, RGBLuminanceSource } from '@zxing/library'
import sharp from 'sharp'
import { createWorker, type Worker } from 'tesseract.js'

const OCR_LONG_SIDE = Number(process.env.OCR_LONG_SIDE ?? 1600)
const SIGNATURE_INK_THRESHOLD = 0.012
const PRINTED_LINE_ROW_RATIO = 0.5

const CANHOTO_MARKERS = {
  receivedFrom: ['RECEBEMOS DE'],
  receiptDate: ['DATA DE RECEBIMENTO'],
  signature: ['ASSINATURA DO RECEBEDOR', 'IDENTIFICACAO E ASSINATURA'],
  productsListed: ['PRODUTOS CONSTANTES', 'CONSTANTES DA NOTA'],
  nfeSeries: ['SERIE'],
} as const

const BODY_MARKERS = {
  auxiliaryDocument: ['DOCUMENTO AUXILIAR', 'DANFE'],
  recipient: ['DESTINATARIO REMETENTE', 'DESTINATARIO'],
  taxes: ['CALCULO DO IMPOSTO'],
  carrier: ['TRANSPORTADOR VOLUMES', 'TRANSPORTADOR'],
  products: ['DADOS DOS PRODUTOS', 'DADOS DO PRODUTO'],
  operation: ['NATUREZA DA OPERACAO'],
} as const

type Word = Readonly<{ text: string; x0: number; y0: number; x1: number; y1: number }>
type OcrPass = Readonly<{
  angle: number
  text: string
  words: Word[]
  width: number
  height: number
  gray: Buffer
}>

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, ' ')
}

/** Busca aproximada de substring (Sellers): menor distância de edição de `needle` em qualquer trecho. */
function approximateDistance(haystack: string, needle: string): number {
  let previous = new Array<number>(haystack.length + 1).fill(0)
  for (let row = 1; row <= needle.length; row += 1) {
    const current = new Array<number>(haystack.length + 1)
    current[0] = row
    for (let column = 1; column <= haystack.length; column += 1) {
      const cost = needle[row - 1] === haystack[column - 1] ? 0 : 1
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      )
    }
    previous = current
  }
  return Math.min(...previous)
}

function foundMarkers(
  text: string,
  markers: Readonly<Record<string, readonly string[]>>,
): string[] {
  const haystack = normalize(text)
  return Object.entries(markers)
    .filter(([, variants]) =>
      variants.some(
        (variant) => approximateDistance(haystack, variant) <= Math.floor(variant.length / 6),
      ),
    )
    .map(([name]) => name)
}

async function ocrAt(worker: Worker, image: Buffer, angle: number): Promise<OcrPass> {
  const { data, info } = await sharp(image)
    .rotate(angle)
    .grayscale()
    .normalize()
    .resize({ width: OCR_LONG_SIDE, height: OCR_LONG_SIDE, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .withMetadata({ density: 300 })
    .toBuffer()
  const result = await worker.recognize(png, {}, { text: true, blocks: true })
  const words: Word[] = []
  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) words.push({ text: word.text, ...word.bbox })
      }
    }
  }
  return {
    angle,
    text: result.data.text,
    words,
    width: info.width,
    height: info.height,
    gray: data,
  }
}

/** Tinta no campo da assinatura: pixels escuros abaixo do rótulo, sem as linhas impressas do formulário. */
function signatureInkRatio(pass: OcrPass): number | null {
  const label = pass.words.find(
    (word) => approximateDistance(normalize(word.text), 'ASSINATURA') <= 2,
  )
  if (label === undefined) return null
  const labelHeight = Math.max(8, label.y1 - label.y0)
  const top = Math.max(0, label.y0 - labelHeight * 4)
  const bottom = Math.min(pass.height, label.y1 + labelHeight * 4)
  const left = Math.max(0, label.x0 - labelHeight * 2)
  const right = Math.min(pass.width, label.x1 + Math.round(pass.width * 0.35))
  const textBoxes = pass.words.filter(
    (word) => word.y1 > top && word.y0 < bottom && word.x1 > left && word.x0 < right,
  )
  let ink = 0
  let total = 0
  for (let y = top; y < bottom; y += 1) {
    let rowDark = 0
    for (let x = left; x < right; x += 1)
      if ((pass.gray[y * pass.width + x] ?? 255) < 110) rowDark += 1
    if (rowDark / (right - left) > PRINTED_LINE_ROW_RATIO) continue
    for (let x = left; x < right; x += 1) {
      const insidePrinted = textBoxes.some(
        (word) =>
          word.text.length > 2 && x >= word.x0 && x <= word.x1 && y >= word.y0 && y <= word.y1,
      )
      if (insidePrinted) continue
      total += 1
      if ((pass.gray[y * pass.width + x] ?? 255) < 110) ink += 1
    }
  }
  return total === 0 ? null : ink / total
}

async function hasNfeBarcode(image: Buffer): Promise<boolean> {
  for (const angle of [0, 90]) {
    const { data, info } = await sharp(image)
      .rotate(angle)
      .grayscale()
      .resize({ width: 2000, height: 2000, fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    try {
      const source = new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height)
      const text = new Code128Reader()
        .decode(new BinaryBitmap(new HybridBinarizer(source)), new Map())
        .getText()
      if (/^[0-9]{44}$/u.test(text)) return true
    } catch {
      // sem código legível neste ângulo
    }
  }
  return false
}

type Classification = Readonly<{
  kind: 'canhoto' | 'danfe' | 'other' | 'unsure'
  canhotoMarkers: string[]
  bodyMarkers: string[]
  angle: number
  passes: number
  ocrMs: number
  inkRatio: number | null
  signed: boolean | null
  barcode: boolean
  barcodeMs: number
  aspect: number
}>

export async function classify(worker: Worker, image: Buffer): Promise<Classification> {
  const oriented = await sharp(image).rotate().toBuffer()
  const meta = await sharp(oriented).metadata()
  const aspect =
    Math.max(meta.width ?? 1, meta.height ?? 1) / Math.min(meta.width ?? 1, meta.height ?? 1)
  const started = performance.now()
  let best: OcrPass | undefined
  let bestScore = -1
  let passes = 0
  for (const angle of [0, 90, 270, 180]) {
    const pass = await ocrAt(worker, oriented, angle)
    passes += 1
    const score =
      foundMarkers(pass.text, CANHOTO_MARKERS).length + foundMarkers(pass.text, BODY_MARKERS).length
    if (score > bestScore) {
      best = pass
      bestScore = score
    }
    if (score >= Number(process.env.EARLY_STOP ?? 2)) break
  }
  const ocrMs = performance.now() - started
  const pass = best as OcrPass
  const canhotoMarkers = foundMarkers(pass.text, CANHOTO_MARKERS)
  const bodyMarkers = foundMarkers(pass.text, BODY_MARKERS)
  const barcodeStarted = performance.now()
  const barcode = await hasNfeBarcode(oriented)
  const barcodeMs = performance.now() - barcodeStarted
  const inkRatio = canhotoMarkers.length > 0 ? signatureInkRatio(pass) : null
  const signed = inkRatio === null ? null : inkRatio >= SIGNATURE_INK_THRESHOLD
  const kind =
    canhotoMarkers.length >= 2
      ? 'canhoto'
      : canhotoMarkers.length === 1
        ? 'unsure'
        : bodyMarkers.length >= 2 || barcode
          ? 'danfe'
          : 'other'
  return {
    kind,
    canhotoMarkers,
    bodyMarkers,
    angle: pass.angle,
    passes,
    ocrMs,
    inkRatio,
    signed,
    barcode,
    barcodeMs,
    aspect,
  }
}

async function main(): Promise<void> {
  const [imageDir, manifestPath, langPath] = process.argv.slice(2)
  if (imageDir === undefined || manifestPath === undefined || langPath === undefined) {
    throw new Error('uso: bun canhoto-classifier.spike.ts <dir-imagens> <manifesto.tsv> <dir-lang>')
  }
  const loadStarted = performance.now()
  const worker = await createWorker('por', 1, { langPath, cacheMethod: 'none', gzip: true })
  if (process.env.PSM)
    await worker.setParameters({ tessedit_pageseg_mode: process.env.PSM as never })
  const loadMs = performance.now() - loadStarted
  console.log(JSON.stringify({ event: 'worker_ready', loadMs: Math.round(loadMs) }))
  const rows = readFileSync(manifestPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split('\t'))
  for (const [name, environment, label] of rows) {
    const result = await classify(worker, readFileSync(join(imageDir, name as string)))
    console.log(
      JSON.stringify({
        name,
        environment,
        label,
        ...result,
        ocrMs: Math.round(result.ocrMs),
        barcodeMs: Math.round(result.barcodeMs),
      }),
    )
  }
  await worker.terminate()
}

await main()
