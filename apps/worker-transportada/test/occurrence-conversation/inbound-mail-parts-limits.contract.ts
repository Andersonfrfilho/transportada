/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7d (terceira revisão de segurança, NOVO-2 restante): o PostalMime é quadrático no número de
 * partes e o worker abre cada `message/rfc822` aninhada — 5000 aninhadas com `To`+`Cc` de 2 KiB eram 25 s de
 * laço travado, 20 000 partes pequenas 9 s. Agora as linhas de fronteira são contadas ANTES do leitor (teto de
 * 1000) e as aninhadas abertas dividem um orçamento comum (5, o teto de anexos da conversa). O anexo legítimo
 * — PDF numa aninhada comum, `.eml` anexo, profundidade 2 — continua exatamente como era.
 */
import { describe, expect, test } from 'bun:test'

import { parseForwardedEmail } from '../../src/cargo-preview-email/application/parse-forwarded-email.service.js'
import { readInboundMailParts } from '../../src/occurrence-conversation/application/inbound-mail-parts.service.js'

const PDF_BASE64 = Buffer.from(
  '%PDF-1.4\n%xx\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n',
).toString('base64')
const OUTER_HEADER =
  'From: c@cliente.example\r\nTo: r@x.example\r\nSubject: s\r\nMIME-Version: 1.0\r\n'
const LIMIT_MS = 1500

const pdfPart = (boundary: string, name: string) =>
  `--${boundary}\r\nContent-Type: application/pdf; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${PDF_BASE64}\r\n`
const message = (boundary: string, body: string) =>
  `${OUTER_HEADER}Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\nhi\r\n${body}--${boundary}--\r\n`
const nestedPart = (boundary: string, inner: string, disposition = '') =>
  `--${boundary}\r\nContent-Type: message/rfc822\r\n${disposition}\r\n${inner}\r\n`
const names = (parts: Awaited<ReturnType<typeof readInboundMailParts>>['parts']) =>
  parts.map((part) => part.filename ?? part.mimeType)
const bytes = (value: string) => Buffer.from(value, 'latin1')

async function measure<TResult>(run: () => Promise<TResult>) {
  const startedAt = performance.now()
  const result = await run()
  return { elapsedMs: performance.now() - startedAt, result }
}

describe('o teto de partes do MIME da conversa (spec 237 T4.7d)', () => {
  test('20 000 partes PDF pequenas: recusa em milissegundos, sem ler nenhuma', async () => {
    const raw = bytes(message('B', pdfPart('B', 'a.pdf').repeat(20_000)))
    const { elapsedMs, result } = await measure(() => readInboundMailParts(raw))
    expect(result).toEqual({ parts: [], skippedNestedMessages: 1 })
    expect(elapsedMs).toBeLessThan(LIMIT_MS)
  })

  test('o teto é de 1000 linhas de fronteira: 998 anexos (1000 linhas com o texto e o fecho) passam, 999 recusam', async () => {
    const parts = (count: number) =>
      readInboundMailParts(bytes(message('B', pdfPart('B', 'a.pdf').repeat(count))))
    expect((await parts(998)).parts).toHaveLength(998)
    expect(await parts(999)).toEqual({ parts: [], skippedNestedMessages: 1 })
  })

  test('um relatório colado em texto com 300 réguas `-----` não faz o PDF anexado ser perdido', async () => {
    const report = `${'-----\r\n'.repeat(300)}`
    const raw = bytes(
      message('B', `${pdfPart('B', 'a.pdf')}--B\r\nContent-Type: text/plain\r\n\r\n${report}`),
    )
    const read = await readInboundMailParts(raw)
    expect(names(read.parts)).toEqual(['a.pdf'])
    expect(read.skippedNestedMessages).toBe(0)
  })

  test('a fronteira com espaço no valor também conta (o PostalMime a reconhece)', async () => {
    const spaced = pdfPart('B x', 'a.pdf').repeat(1100)
    const raw = bytes(message('B x', spaced))
    expect(await readInboundMailParts(raw)).toEqual({ parts: [], skippedNestedMessages: 1 })
  })

  test('uma resposta comum — texto, HTML, três anexos e a assinatura — passa inteira', async () => {
    const raw = bytes(
      message('B', pdfPart('B', 'a.pdf') + pdfPart('B', 'b.pdf') + pdfPart('B', 'c.pdf')),
    )
    const read = await readInboundMailParts(raw)
    expect(names(read.parts)).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
    expect(read.skippedNestedMessages).toBe(0)
  })

  test('na prévia, o encaminhamento com 20 000 partes é MIME ilegível, em milissegundos', async () => {
    const raw = bytes(message('B', pdfPart('B', 'a.pdf').repeat(20_000)))
    const { elapsedMs, result } = await measure(() => parseForwardedEmail(raw))
    expect(result).toBeUndefined()
    expect(elapsedMs).toBeLessThan(LIMIT_MS)
  })

  test('na prévia, a mensagem anexada com mais de 1000 linhas de fronteira também recusa', async () => {
    const inner = message('N', pdfPart('N', 'a.pdf').repeat(1100))
    const outer = message('B', nestedPart('B', inner))
    expect(await parseForwardedEmail(bytes(outer))).toBeUndefined()
  })
})

describe('o orçamento das mensagens aninhadas abertas (spec 237 T4.7d)', () => {
  /** Uma mensagem de uma parte só (o PDF): sem linha de fronteira própria, só o `To`+`Cc` de 2 KiB que custa leitura. */
  const honestInner = (index: number) =>
    `From: x@y.example\r\nTo: ${'a=?b?c?d?='.repeat(200)}\r\nCc: ${'a=?b?c?d?='.repeat(200)}\r\nSubject: i\r\nMIME-Version: 1.0\r\nContent-Type: application/pdf; name="dentro-${index}.pdf"\r\nContent-Disposition: attachment; filename="dentro-${index}.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n${PDF_BASE64}\r\n`

  test('1000 aninhadas com To+Cc de 2 KiB: recusa pelo teto de partes, em milissegundos', async () => {
    const body = Array.from({ length: 1000 }, (_, index) => nestedPart('B', honestInner(index)))
    const { elapsedMs, result } = await measure(() =>
      readInboundMailParts(bytes(message('B', body.join('')))),
    )
    expect(result).toEqual({ parts: [], skippedNestedMessages: 1 })
    expect(elapsedMs).toBeLessThan(LIMIT_MS)
  })

  test('60 aninhadas dentro do teto de partes: só 5 são abertas e o resto conta como recusa', async () => {
    const body = Array.from({ length: 60 }, (_, index) => nestedPart('B', honestInner(index)))
    const read = await readInboundMailParts(bytes(message('B', body.join(''))))
    expect(names(read.parts)).toEqual([
      'dentro-0.pdf',
      'dentro-1.pdf',
      'dentro-2.pdf',
      'dentro-3.pdf',
      'dentro-4.pdf',
    ])
    expect(read.skippedNestedMessages).toBe(55)
  })

  test('o orçamento é de TODA a mensagem: as aninhadas de dentro de uma aninhada também gastam', async () => {
    const deep = (index: number) =>
      message(
        `M${index}`,
        nestedPart(`M${index}`, honestInner(index)).repeat(3) +
          pdfPart(`M${index}`, `fundo-${index}.pdf`),
      )
    const body = Array.from({ length: 4 }, (_, index) => nestedPart('B', deep(index)))
    const read = await readInboundMailParts(bytes(message('B', body.join(''))))
    // 4 de primeiro nível + 1 de segundo nível: o orçamento de 5 acaba, e as demais contam como recusa.
    expect(read.parts.length).toBeLessThanOrEqual(8)
    expect(read.skippedNestedMessages).toBeGreaterThan(0)
  })
})

describe('o anexo legítimo continua como era (spec 237 T4.7d)', () => {
  const inner = (boundary: string, name: string) =>
    `From: x@y.example\r\nTo: a@b.example\r\nSubject: s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\nhi\r\n${pdfPart(boundary, name)}--${boundary}--\r\n`

  test('PDF numa aninhada comum, sem disposição, entra na mesma posição', async () => {
    const raw = bytes(
      message('A', pdfPart('A', 'fora.pdf') + nestedPart('A', inner('N', 'dentro.pdf'))),
    )
    const read = await readInboundMailParts(raw)
    expect(names(read.parts)).toEqual(['fora.pdf', 'dentro.pdf'])
    expect(read.skippedNestedMessages).toBe(0)
  })

  test('aninhada `inline` explícita abre; `.eml` anexado (`attachment`) fica como parte', async () => {
    const explicit = bytes(
      message('A', nestedPart('A', inner('N', 'dentro.pdf'), 'Content-Disposition: inline\r\n')),
    )
    expect(names((await readInboundMailParts(explicit)).parts)).toEqual(['dentro.pdf'])
    const attached = bytes(
      message(
        'A',
        nestedPart(
          'A',
          inner('N', 'dentro.pdf'),
          'Content-Disposition: attachment; filename="fwd.eml"\r\n',
        ),
      ),
    )
    expect(names((await readInboundMailParts(attached)).parts)).toEqual(['fwd.eml'])
  })

  test('profundidade 2 abre; profundidade 4 segue recusada (T4.7c)', async () => {
    const level2 = bytes(
      message('A', nestedPart('A', message('N', nestedPart('N', inner('M', 'fundo.pdf'))))),
    )
    expect(names((await readInboundMailParts(level2)).parts)).toEqual(['fundo.pdf'])
    const level4 = bytes(
      message(
        'A',
        nestedPart(
          'A',
          message(
            'N',
            nestedPart(
              'N',
              message('M', nestedPart('M', message('O', nestedPart('O', inner('P', 'x.pdf'))))),
            ),
          ),
        ),
      ),
    )
    expect(await readInboundMailParts(level4)).toEqual({ parts: [], skippedNestedMessages: 1 })
  })

  test('aninhada em base64 também abre', async () => {
    const encoded = Buffer.from(inner('N', 'b64.pdf')).toString('base64')
    const raw = bytes(
      message(
        'A',
        `--A\r\nContent-Type: message/rfc822\r\nContent-Transfer-Encoding: base64\r\n\r\n${encoded}\r\n`,
      ),
    )
    expect(names((await readInboundMailParts(raw)).parts)).toEqual(['b64.pdf'])
  })
})
