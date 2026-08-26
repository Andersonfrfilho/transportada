/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { PdfGetDocument } from './pdfTextLayer.service'

/**
 * O pdf.js só entra no bundle quando alguém solta um arquivo: são pouco mais de 300 kB, e quem
 * cadastra veículo digitando não deveria pagar por eles no primeiro carregamento da tela.
 *
 * O worker é referenciado por `?url` e sai **empacotado na nossa origem** — a CSP publicada declara
 * `worker-src 'self'` sem `blob:` e sem CDN (ADR-0042), e é o Vite que emite o arquivo.
 */
export async function loadPdfGetDocument(): Promise<PdfGetDocument> {
  const [pdfjs, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default

  return pdfjs.getDocument
}
