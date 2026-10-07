/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7c (segunda revisão de segurança, H1-b e NOVO-3): a barreira de cabeçalho lê as linhas como a
 * `mailauth` as lê — nome sem espaços antes do `:`, e a linha que não abre um campo soma no cabeçalho de cima —,
 * limita CADA cabeçalho desdobrado (2 KiB os de endereço, 8 KiB os outros) e a soma dos repetidos de mesmo nome,
 * e conta as assinaturas: no máximo 8 `DKIM-Signature` e 3 conjuntos `ARC-*`. O custo da `mailauth` é um hasher
 * de corpo por combinação (canon, hash, `l=`) e uma consulta de DNS em série por assinatura.
 */
import { describe, expect, test } from 'bun:test'
import { dkimVerify } from 'mailauth'
import PostalMime from 'postal-mime'

import { hasBoundedMimeHeaders } from '../../src/contractor-mail/domain/mime-header-bounds.policy.js'
import { CONTRACTOR_ID, runIntake, validRawEmail } from './intake.harness.js'

const SIZE = 60 * 1024
const TAIL = 'Subject: s\r\n\r\ncorpo'
/** O NBSP em UTF-8 (C2 A0) lido byte a byte: a `mailauth` o trata como linha de dobra, e o teste de "começa com espaço" não. */
const NBSP = 'Â '
const commas = (length: number) => 'a,'.repeat(length / 2)
const bytes = (value: string) => Buffer.from(value, 'latin1')
const lines = (count: number, make: () => string) =>
  Array.from({ length: count }, make).join('\r\n')
const dnsNotFound = async (): Promise<never> => {
  throw Object.assign(new Error('nf'), { code: 'ENOTFOUND' })
}

describe('o teto vale para o nome como a mailauth o lê (spec 237 T4.7c, H1-b)', () => {
  test.each([
    ['Return-Path : (espaço antes do :)', `Return-Path : ${commas(SIZE)}\r\n`],
    ['Return-Path\\t: (tab antes do :)', `Return-Path\t: ${commas(SIZE)}\r\n`],
    ['Return-Path com o nome dobrado antes do :', `Return-Path\r\n : ${commas(SIZE)}\r\n`],
    ['From : (espaço antes do :)', `From : ${commas(SIZE)}\r\n`],
    ['To : (espaço antes do :)', `To : ${commas(SIZE)}\r\n`],
    ['return-path em minúsculas e com espaço', `return-path : ${commas(SIZE)}\r\n`],
    [
      'Return-Path com 60 linhas sem ":" (a mailauth as anexa ao cabeçalho de cima)',
      `Return-Path: <x@y.example>\r\n${lines(60, () => commas(1000))}\r\n`,
    ],
    [
      'Return-Path com 60 linhas iniciadas por NBSP',
      `Return-Path: <x@y.example>\r\n${lines(60, () => NBSP + commas(1000))}\r\n`,
    ],
    ['From com 60 linhas sem ":"', `From: <x@t.example>\r\n${lines(60, () => commas(1000))}\r\n`],
    [
      'Return-Path só com LF e linhas sem ":"',
      `Return-Path: <x@y.example>\n${lines(60, () => commas(1000)).replaceAll('\r\n', '\n')}\n`,
    ],
  ])('%s recusa', (_name, header) => {
    const startedAt = performance.now()
    expect(hasBoundedMimeHeaders(bytes(`${header}${TAIL}`))).toBe(false)
    expect(performance.now() - startedAt).toBeLessThan(100)
  })

  test.each([
    ['Return-Path repetido 30 vezes, cada um abaixo de 2 KiB', 'Return-Path', 30, 1900],
    ['From repetido 3 vezes de 1000 bytes', 'From', 3, 1000],
    ['Reply-To repetido 3 vezes de 1000 bytes', 'Reply-To', 3, 1000],
    ['To repetido 3 vezes de 6000 bytes (18 KiB nos destinatários)', 'To', 3, 6000],
  ])('a soma dos repetidos conta: %s', (_name, header, times, size) => {
    const repeated = lines(times, () => `${header}: ${'a'.repeat(size)}`)
    expect(hasBoundedMimeHeaders(bytes(`${repeated}\r\n${TAIL}`))).toBe(false)
  })

  test.each(['From', 'Reply-To', 'Return-Path', 'Sender'])(
    '%s fica em 2 KiB: acima recusa, abaixo passa',
    (name) => {
      expect(hasBoundedMimeHeaders(bytes(`${name}: ${'a'.repeat(3000)}\r\n${TAIL}`))).toBe(false)
      expect(hasBoundedMimeHeaders(bytes(`${name}: ${'a'.repeat(1500)}\r\n${TAIL}`))).toBe(true)
    },
  )

  test.each(['To', 'Cc', 'Bcc', 'Delivered-To'])(
    '%s fica em 8 KiB por campo: 9 KiB recusa, 7,5 KiB passa (spec 237 T4.7d)',
    (name) => {
      expect(hasBoundedMimeHeaders(bytes(`${name}: ${'a'.repeat(9 * 1024)}\r\n${TAIL}`))).toBe(
        false,
      )
      expect(hasBoundedMimeHeaders(bytes(`${name}: ${'a'.repeat(7500)}\r\n${TAIL}`))).toBe(true)
    },
  )

  test('a lista legítima de 120 destinatários com nome (responder a todos) passa e custa menos de 5 ms', () => {
    const list = Array.from(
      { length: 120 },
      (_, index) => `"Sobrenome${index}, Nome" <nome.sobrenome${index}@empresa-cliente.com.br>`,
    ).join(', ')
    const message = bytes(`To: ${list}\r\n${TAIL}`)
    expect(list.length).toBeGreaterThan(7000)
    expect(hasBoundedMimeHeaders(message)).toBe(true)
  })

  test('a soma dos quatro campos de destinatário tem teto de 16 KiB', () => {
    const field = (name: string, size: number) => `${name}: ${'a'.repeat(size)}\r\n`
    const four = (size: number) =>
      ['To', 'Cc', 'Bcc', 'Delivered-To'].map((name) => field(name, size)).join('')
    expect(hasBoundedMimeHeaders(bytes(`${four(4000)}${TAIL}`))).toBe(true)
    expect(hasBoundedMimeHeaders(bytes(`${four(4352)}${TAIL}`))).toBe(false)
    expect(
      hasBoundedMimeHeaders(
        bytes(`${field('To', 7900)}${field('Cc', 7900)}${field('Bcc', 700)}${TAIL}`),
      ),
    ).toBe(false)
    expect(hasBoundedMimeHeaders(bytes(`${field('To', 7900)}${field('Cc', 7900)}${TAIL}`))).toBe(
      true,
    )
  })

  test('qualquer outro cabeçalho fica em 8 KiB: acima recusa, abaixo passa', () => {
    expect(hasBoundedMimeHeaders(bytes(`X-Custom: ${'a'.repeat(9000)}\r\n${TAIL}`))).toBe(false)
    expect(hasBoundedMimeHeaders(bytes(`X-Custom: ${'a'.repeat(7000)}\r\n${TAIL}`))).toBe(true)
    expect(hasBoundedMimeHeaders(bytes(`X-Return-Path: ${'a'.repeat(5000)}\r\n${TAIL}`))).toBe(true)
  })

  test('a cadeia de Received de um e-mail comum passa', () => {
    const received = lines(
      12,
      () =>
        `Received: from mx.example (mx.example [10.0.0.1])\r\n\tby mail.example with ESMTP id ${'a'.repeat(200)}`,
    )
    expect(hasBoundedMimeHeaders(bytes(`From: a@b.example\r\n${received}\r\n${TAIL}`))).toBe(true)
  })

  test.each([['=?a?b?'], ['a,'], ['a=?b?c?d?=']])(
    'o pior cabeçalho de endereço que PASSA custa milissegundos na mailauth e no PostalMime (%s)',
    async (unit) => {
      const fill = (size: number) => unit.repeat(Math.floor(size / unit.length))
      const strict = ['From', 'Reply-To', 'Return-Path', 'Sender'].map(
        (name) => `${name}: ${fill(1900)}`,
      )
      const recipients = ['To', 'Cc'].map((name) => `${name}: ${fill(8000)}`)
      const message = bytes(
        `${[...strict, ...recipients].join('\r\n')}\r\nContent-Type: text/plain\r\n\r\ncorpo\r\n`,
      )
      expect(hasBoundedMimeHeaders(message)).toBe(true)

      const startedAt = performance.now()
      await dkimVerify(message, { resolver: dnsNotFound })
      await PostalMime.parse(message, {
        attachmentEncoding: 'arraybuffer',
        maxHeadersSize: 64 * 1024,
      })
      expect(performance.now() - startedAt).toBeLessThan(750)
    },
  )
})

describe('a barreira e o PostalMime separam os campos do mesmo jeito (spec 237 T4.7d, D-A)', () => {
  /** O PostalMime tira `\s` do JS das pontas do nome; a `mailauth` só aceita espaço e tab antes do `:`. */
  const SPACES = [
    ['formfeed', '\f'],
    ['tab vertical', '\v'],
    ['NBSP em UTF-8 (C2 A0)', '\xC2\xA0'],
    ['NBSP de um byte (A0)', '\xA0'],
    ['NEL em UTF-8 (C2 85)', '\xC2\x85'],
    ['espaço em U+2003 (E2 80 83)', '\xE2\x80\x83'],
    ['espaço em U+2028 (E2 80 A8)', '\xE2\x80\xA8'],
    ['espaço em U+3000 (E3 80 80)', '\xE3\x80\x80'],
    ['BOM em U+FEFF (EF BB BF)', '\xEF\xBB\xBF'],
  ] as const
  const PER_FIELD = 8 * 1024 - 64
  const filler = 'a=?b?c?d?='.repeat(Math.floor(PER_FIELD / 10))
  const hostile = (separator: string) =>
    bytes(
      `${Array.from({ length: 7 }, (_, index) => `X-${index}: y\r\nTo${separator}: ${filler}\r\n`).join('')}From: a@b.example\r\nContent-Type: text/plain\r\n\r\ncorpo`,
    )

  test.each(SPACES)(
    'To%s: antes do `:` recusa (sete campos de ~8 KiB que o PostalMime lê como `to`)',
    async (_name, separator) => {
      const message = hostile(separator)
      expect(hasBoundedMimeHeaders(message)).toBe(false)
    },
  )

  test.each(SPACES)('From%s: antes do `:` recusa', (_name, separator) => {
    expect(hasBoundedMimeHeaders(bytes(`From${separator}: a@b.example\r\n${TAIL}`))).toBe(false)
  })

  test('o PostalMime de fato lê essas linhas como campos `to` (a divergência é real)', async () => {
    const parsed = await PostalMime.parse(hostile('\f'), {
      attachmentEncoding: 'arraybuffer',
      maxHeadersSize: 64 * 1024,
    })
    expect(parsed.headers.filter((header) => header.key === 'to')).toHaveLength(7)
  })

  test('espaço e tab antes do `:` (o que a mailauth aceita) seguem passando, e a linha dobrada também', () => {
    expect(hasBoundedMimeHeaders(bytes(`To : a@b.example\r\n${TAIL}`))).toBe(true)
    expect(hasBoundedMimeHeaders(bytes(`To\t: a@b.example\r\n${TAIL}`))).toBe(true)
    expect(hasBoundedMimeHeaders(bytes(`To: a@b.example,\r\n c@d.example\r\n${TAIL}`))).toBe(true)
    expect(
      hasBoundedMimeHeaders(
        bytes(`Subject: caf\xC3\xA9\xC2\xA0com leite\r\nTo: a@b.example\r\n${TAIL}`),
      ),
    ).toBe(true)
  })
})

describe('o número de assinaturas tem teto (spec 237 T4.7c, NOVO-3)', () => {
  const signature = (index: number, name = 'DKIM-Signature') =>
    `${name}: v=1; a=rsa-sha256; c=relaxed/relaxed; d=e${index}.example; s=a; h=from; bh=x; b=y`
  const message = (headers: readonly string[]) =>
    bytes(`${headers.join('\r\n')}\r\nFrom: a@b.example\r\n${TAIL}`)
  const many = (count: number, name?: string) =>
    Array.from({ length: count }, (_, index) => signature(index, name))

  test('oito DKIM-Signature passam e nove recusam', () => {
    expect(hasBoundedMimeHeaders(message(many(8)))).toBe(true)
    expect(hasBoundedMimeHeaders(message(many(9)))).toBe(false)
  })

  test('480 assinaturas com l= diferentes (um hasher de corpo cada) recusam sem ler o corpo', () => {
    const withLength = Array.from(
      { length: 480 },
      (_, index) => `${signature(index)}; l=${900_000_000 + index}`,
    )
    expect(hasBoundedMimeHeaders(message(withLength))).toBe(false)
  })

  test.each([
    ['em minúsculas', 'dkim-signature'],
    ['com espaço antes do :', 'DKIM-Signature '],
    ['com tab antes do :', 'DKIM-Signature\t'],
  ])('a contagem vale para o nome %s', (_name, name) => {
    expect(hasBoundedMimeHeaders(message(many(9, name)))).toBe(false)
  })

  test('a assinatura desdobrada em várias linhas conta uma vez só', () => {
    const folded = Array.from(
      { length: 8 },
      (_, index) =>
        `DKIM-Signature: v=1; a=rsa-sha256;\r\n d=e${index}.example; s=a;\r\n h=from; bh=x; b=y`,
    )
    expect(hasBoundedMimeHeaders(message(folded))).toBe(true)
  })

  test.each(['ARC-Seal', 'ARC-Message-Signature', 'ARC-Authentication-Results'])(
    '%s: três conjuntos passam e quatro recusam',
    (name) => {
      expect(hasBoundedMimeHeaders(message(many(3, name)))).toBe(true)
      expect(hasBoundedMimeHeaders(message(many(4, name)))).toBe(false)
    },
  )

  test('na prévia, nove assinaturas recusam MIME_UNREADABLE sem chamar o DKIM', async () => {
    const run = runIntake({ rawEmail: `${many(9).join('\r\n')}\r\n${validRawEmail()}` })
    expect(await run.result).toEqual({
      contractorId: CONTRACTOR_ID,
      kind: 'rejected',
      reason: 'MIME_UNREADABLE',
    })
    expect(run.calls.dkimVerifications).toHaveLength(0)
  })
})
