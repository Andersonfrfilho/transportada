/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o ramo da prévia baixa o MIME com teto menor que os 25 MiB do provedor — e o teto
 * pedido nunca SOBE o do gateway.
 */
import { describe, expect, test } from 'bun:test'

import { ResendDownloadTooLargeError } from '../../src/contractor-mail/domain/resend-provider.error.js'
import { createResendMailGateway } from '../../src/contractor-mail/infrastructure/resend-mail.gateway.js'

const URL_OK = 'https://abc123.cloudfront.net/raw/1'
const gatewayWith = (size: number) =>
  createResendMailGateway({ fetch: async () => new Response(new Uint8Array(size)) })

describe('o teto do download do MIME bruto (spec 237 T4.6)', () => {
  test('sem teto pedido, segue o do gateway', async () => {
    const body = await gatewayWith(3000).downloadRawEmail({ downloadUrl: URL_OK })
    expect(body.byteLength).toBe(3000)
  })

  test('com teto pedido, o corpo além dele é recusado', async () => {
    await expect(
      gatewayWith(3001).downloadRawEmail({ downloadUrl: URL_OK, maxBytes: 3000 }),
    ).rejects.toBeInstanceOf(ResendDownloadTooLargeError)
    expect(
      (await gatewayWith(3000).downloadRawEmail({ downloadUrl: URL_OK, maxBytes: 3000 }))
        .byteLength,
    ).toBe(3000)
  })

  test('teto pedido acima de 25 MiB não vale', async () => {
    await expect(
      gatewayWith(25 * 1024 * 1024 + 1).downloadRawEmail({
        downloadUrl: URL_OK,
        maxBytes: 10 ** 9,
      }),
    ).rejects.toBeInstanceOf(ResendDownloadTooLargeError)
  })

  test.each([[Number.NaN], [Number.POSITIVE_INFINITY]])(
    'teto pedido %p não desliga o do gateway',
    async (maxBytes) => {
      await expect(
        gatewayWith(25 * 1024 * 1024 + 1).downloadRawEmail({ downloadUrl: URL_OK, maxBytes }),
      ).rejects.toBeInstanceOf(ResendDownloadTooLargeError)
      expect(
        (await gatewayWith(3000).downloadRawEmail({ downloadUrl: URL_OK, maxBytes })).byteLength,
      ).toBe(3000)
    },
  )
})
