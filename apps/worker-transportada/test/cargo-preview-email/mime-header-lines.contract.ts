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
    ['To repetido 3 vezes de 1000 bytes', 'To', 3, 1000],
  ])('a soma dos repetidos conta: %s', (_name, header, times, size) => {
    const repeated = lines(times, () => `${header}: ${'a'.repeat(size)}`)
    expect(hasBoundedMimeHeaders(bytes(`${repeated}\r\n${TAIL}`))).toBe(false)
  })

  test.each(['To', 'Cc', 'Bcc', 'Delivered-To', 'Reply-To', 'Sender'])(
    '%s acima de 2 KiB recusa, e abaixo passa',
    (name) => {
      expect(hasBoundedMimeHeaders(bytes(`${name}: ${'a'.repeat(3000)}\r\n${TAIL}`))).toBe(false)
      expect(hasBoundedMimeHeaders(bytes(`${name}: ${'a'.repeat(1500)}\r\n${TAIL}`))).toBe(true)
    },
  )

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
      const names = ['From', 'Reply-To', 'Return-Path', 'Sender', 'To', 'Cc', 'Bcc', 'Delivered-To']
      const headers = names.map((name) => `${name}: ${unit.repeat(Math.floor(1900 / unit.length))}`)
      const message = bytes(`${headers.join('\r\n')}\r\nContent-Type: text/plain\r\n\r\ncorpo\r\n`)
      expect(hasBoundedMimeHeaders(message)).toBe(true)

      const startedAt = performance.now()
      await dkimVerify(message, { resolver: dnsNotFound })
      await PostalMime.parse(message, {
        attachmentEncoding: 'arraybuffer',
        maxHeadersSize: 64 * 1024,
      })
      expect(performance.now() - startedAt).toBeLessThan(500)
    },
  )
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
