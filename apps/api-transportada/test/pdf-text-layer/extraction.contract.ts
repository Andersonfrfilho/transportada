/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O PDF de prova é gerado aqui pelo `pdfkit` que a app já usa para emitir DACTE e fatura: nenhum
 * documento real entra no repositório (§ Privacidade da 048), e o texto esperado é conhecido byte a
 * byte em vez de conferido a olho.
 */
import PDFDocument from 'pdfkit'
import { describe, expect, test } from 'bun:test'

import { extractPdfTextLayer } from '../../src/shared/pdf-text-layer.service.js'

async function buildPdf(input: {
  readonly compress: boolean
  readonly lines: readonly string[]
}): Promise<Uint8Array> {
  const document = new PDFDocument({ compress: input.compress })
  const chunks: Uint8Array[] = []
  document.on('data', (chunk: Uint8Array) => chunks.push(chunk))
  const finished = new Promise<void>((resolve) => document.on('end', () => resolve()))
  document.fontSize(12)
  for (const line of input.lines) document.text(line)
  document.end()
  await finished
  return new Uint8Array(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

describe('PDF text layer extraction', () => {
  test('reads the text of a compressed PDF, which is what the real documents ship', async () => {
    const bytes = await buildPdf({
      compress: true,
      lines: ['CODIGO RENAVAM 00761638261', 'PLACA DFJ2208'],
    })

    const text = await extractPdfTextLayer(bytes)

    expect(text).toContain('00761638261')
    expect(text).toContain('DFJ2208')
  })

  test('reads an uncompressed PDF too — the filter is optional in the format', async () => {
    const bytes = await buildPdf({ compress: false, lines: ['PLACA ABC1D23'] })

    const text = await extractPdfTextLayer(bytes)

    expect(text).toContain('ABC1D23')
  })

  /** Cada linha do documento precisa continuar sendo uma linha: os parsers ancoram no rótulo da
   * MESMA linha, e um texto colado numa linha só faria "NOME" engolir o campo seguinte. */
  test('keeps the lines apart instead of collapsing the page into one string', async () => {
    const bytes = await buildPdf({
      compress: true,
      lines: ['NOME FULANO DE TAL', 'CPF 12345678909'],
    })

    const text = await extractPdfTextLayer(bytes)

    const nameLine = text.split('\n').find((line) => line.includes('FULANO'))
    expect(nameLine).toBeDefined()
    expect(nameLine).not.toContain('12345678909')
  })

  /** Bytes que não são PDF são ausência de texto, nunca exceção: o upload já foi salvo, e derrubar
   * a leitura derrubaria o cadastro junto. */
  test('returns empty text for bytes that are not a PDF at all', async () => {
    const text = await extractPdfTextLayer(new Uint8Array([1, 2, 3, 4, 5]))

    expect(text).toBe('')
  })

  /** PDF cujo conteúdo é imagem embutida (CNH-e, CDT) não tem o que extrair — e ausência é o
   * resultado correto, porque valor errado viraria divergência contra documento correto. */
  test('returns empty text for a PDF with no text-showing operators', async () => {
    const bytes = await buildPdf({ compress: true, lines: [] })

    const text = await extractPdfTextLayer(bytes)

    expect(text.trim()).toBe('')
  })
})
