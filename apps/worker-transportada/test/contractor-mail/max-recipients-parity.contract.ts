/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T302 — o teto de destinatários por e-mail é cópia por valor entre as apps: a API o cobra
 * no Zod de quem escolhe os contatos, o worker de novo no gateway, antes da rede. Divergiu e a API
 * aceita um pedido que o worker recusa, ou o worker deixa passar o que o Resend recusaria.
 */
import { describe, expect, test } from 'bun:test'

const API_SOURCE = new URL(
  '../../../api-transportada/src/contractor-mail/domain/contractor-mail.constant.ts',
  import.meta.url,
)
const WORKER_SOURCE = new URL(
  '../../src/contractor-mail/domain/contractor-mail.constant.ts',
  import.meta.url,
)

const MAX_RECIPIENTS_LITERAL = 'export const CONTRACTOR_MAIL_MAX_RECIPIENTS = 50'

describe('a paridade do teto de destinatários do e-mail com contratantes (spec 150 T302)', () => {
  test('a API e o worker declaram o mesmo teto', async () => {
    const [apiSource, workerSource] = await Promise.all([
      Bun.file(API_SOURCE).text(),
      Bun.file(WORKER_SOURCE).text(),
    ])

    expect(apiSource).toContain(MAX_RECIPIENTS_LITERAL)
    expect(workerSource).toContain(MAX_RECIPIENTS_LITERAL)
  })
})
