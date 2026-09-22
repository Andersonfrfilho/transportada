/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 156 T15 (A3): sonda com o motor REAL do tesseract.js sobre uma imagem sintética de
 * canhoto — prova que `recognizeCanhotoWords` (com `worker.recognize(image, {}, { blocks: true
 * })`, corrigido nesta task) devolve palavras não vazias e que a extração
 * (`extractCanhotoNumberFromWords`, pura) lê o número certo a partir delas.
 *
 * `bun test` não sobe Worker + WASM do jeito que o navegador sobe — por isso esta sonda roda por
 * fora, via Playwright/Chromium (mesmo caminho da sonda da T13), e não entra no `package.json`
 * como teste padrão. Uso: `bun run scripts/canhoto-ocr-engine.probe.ts`.
 */
import { chromium } from '@playwright/test'

import { extractCanhotoNumberFromWords } from '../src/modules/trip/shared/canhotoOcr.service'

const TESSERACT_DIST_ROOT = new URL('../node_modules/tesseract.js/dist/', import.meta.url)
const CANHOTO_OCR_ASSETS_ROOT = new URL('../public/canhoto-ocr/7.0.0/', import.meta.url)

function contentTypeFor(path: string): string {
  if (path.endsWith('.js')) return 'text/javascript'
  if (path.endsWith('.gz')) return 'application/gzip'
  if (path.endsWith('.wasm')) return 'application/wasm'
  return 'application/octet-stream'
}

function serveDirectory(base: URL) {
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url)
    const filePath = new URL(`.${url.pathname}`.replace(/^\.\/canhoto-ocr\/7\.0\.0\//u, './'), base)
    const file = Bun.file(filePath)
    if (!(await file.exists())) return undefined
    return new Response(file, { headers: { 'content-type': contentTypeFor(url.pathname) } })
  }
}

async function main(): Promise<void> {
  const serveTesseract = serveDirectory(TESSERACT_DIST_ROOT)
  const serveAssets = serveDirectory(CANHOTO_OCR_ASSETS_ROOT)

  const server = Bun.serve({
    fetch: async (request) => {
      const url = new URL(request.url)
      if (url.pathname === '/') {
        return new Response(
          `<!doctype html><html><body><canvas id="c" width="700" height="160"></canvas></body></html>`,
          { headers: { 'content-type': 'text/html' } },
        )
      }
      if (url.pathname.startsWith('/canhoto-ocr/7.0.0/')) {
        const response = await serveAssets(request)
        if (response !== undefined) return response
      }
      const response = await serveTesseract(request)
      if (response !== undefined) return response
      return new Response('not found', { status: 404 })
    },
    port: 0,
  })

  const baseUrl = `http://localhost:${server.port}`
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    page.on('console', (message) => console.log(`[chromium] ${message.text()}`))
    await page.goto(baseUrl)

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
       @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access,
       @typescript-eslint/no-unsafe-return --
       o corpo roda dentro do navegador via `page.evaluate`; o bundle ESM do tesseract.js não tem
       tipos ali, e o retorno é serializado de volta — não há como tipar sem reimplementar as
       definições do pacote só para esta sonda descartável. */
    const words: readonly { confidence: number; text: string }[] = await page.evaluate(
      async ({ base }: { base: string }): Promise<any> => {
        const canvas = document.getElementById('c') as HTMLCanvasElement
        const context = canvas.getContext('2d') as CanvasRenderingContext2D
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#000000'
        context.font = '32px monospace'
        context.fillText('NF-e No 000.123.456', 20, 60)
        context.fillText('SERIE 1', 20, 110)

        const tesseractModule: any = await import(/* @vite-ignore */ `${base}/tesseract.esm.min.js`)
        const { createWorker } = tesseractModule.default ?? tesseractModule
        const worker = await createWorker('eng', 1, {
          cacheMethod: 'none',
          corePath: `${base}/canhoto-ocr/7.0.0/`,
          gzip: true,
          langPath: `${base}/canhoto-ocr/7.0.0/`,
          workerBlobURL: false,
          workerPath: `${base}/canhoto-ocr/7.0.0/worker.min.js`,
        })
        const { data } = await worker.recognize(canvas, {}, { blocks: true })
        await worker.terminate()
        return (data.blocks ?? []).flatMap((block: any) =>
          block.paragraphs.flatMap((paragraph: any) =>
            paragraph.lines.flatMap((line: any) =>
              line.words.map((word: any) => ({ confidence: word.confidence, text: word.text })),
            ),
          ),
        )
      },
      { base: baseUrl },
    )
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
       @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access,
       @typescript-eslint/no-unsafe-return */

    console.log('palavras lidas pelo motor real:', JSON.stringify(words))
    if (words.length === 0) throw new Error('PROBE_FAILED: nenhuma palavra lida (blocks vazio)')

    const extraction = extractCanhotoNumberFromWords(words, { minimumConfidence: 0 })
    console.log('extração:', JSON.stringify(extraction))
    if (extraction?.number !== '000123456') {
      throw new Error(`PROBE_FAILED: número esperado 000123456, obtido ${extraction?.number}`)
    }

    console.log('PROBE_OK: motor real leu palavras não vazias e o número foi extraído corretamente')
  } finally {
    await browser.close()
    await server.stop(true)
  }
}

await main()
