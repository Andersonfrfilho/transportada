/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { PdfGetDocument } from '@adatechnology/document-intake'
/**
 * ⚠️ **O `?url` do worker é `import` estático, e precisa continuar sendo.** Como `import()`
 * dinâmico ele funcionava no bundle e **quebrava no `vite dev`**: ali o sufixo é ignorado e o que
 * volta é o próprio módulo do worker (`{ WorkerMessageHandler }`), sem `default`. O `workerSrc`
 * recebia `undefined`, o pdf.js lançava `Invalid workerSrc type` antes de olhar o arquivo, e **todo
 * upload de documento falhava em desenvolvimento** — com qualquer PDF, dizendo "confira se é um
 * PDF". Os smokes não pegavam porque rodam contra o bundle construído, onde a forma dinâmica
 * funciona.
 *
 * Estático não custa carregamento: `?url` emite só a string do caminho. O que é pesado — os 300 kB
 * do pdf.js — segue no `import()` dinâmico abaixo.
 */
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/**
 * O pdf.js só entra no bundle quando alguém solta um arquivo: são pouco mais de 300 kB, e quem
 * cadastra veículo digitando não deveria pagar por eles no primeiro carregamento da tela.
 *
 * O worker sai **empacotado na nossa origem** — a CSP publicada declara `worker-src 'self'` sem
 * `blob:` e sem CDN (ADR-0042), e é o Vite que emite o arquivo.
 */
export async function loadPdfGetDocument(): Promise<PdfGetDocument> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  return pdfjs.getDocument
}
