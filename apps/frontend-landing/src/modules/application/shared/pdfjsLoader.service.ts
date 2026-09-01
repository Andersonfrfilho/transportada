/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { PdfGetDocument } from '@adatechnology/document-intake'

/**
 * O pdf.js só entra no bundle quando alguém solta um arquivo: são pouco mais de 300 kB, e numa
 * página pública de cadastro isso é o primeiro carregamento de quem talvez nem anexe documento.
 *
 * O worker é referenciado por `?url` e sai **empacotado na nossa origem** — a CSP publicada declara
 * `worker-src 'self'` sem `blob:` e sem CDN, e é o Vite que emite o arquivo. Carregar o worker de
 * um CDN, ou montá-lo como `blob:`, exigiria afrouxar a diretiva; nenhum dos dois acontece aqui.
 *
 * Este arquivo é gêmeo do `pdfjsLoader.service.ts` do painel, por valor: nenhuma app do monorepo
 * importa código-fonte de outra, e o que é comum às duas já mora em `@adatechnology/document-intake`.
 * O que sobra aqui é justamente a parte que **não** pode ser empacotada — ela é cola do bundler.
 */
export async function loadPdfGetDocument(): Promise<PdfGetDocument> {
  const [pdfjs, workerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default

  return pdfjs.getDocument
}
