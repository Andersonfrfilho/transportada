/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T006 — a cópia por valor do serviço da API, no mesmo molde de
 * `test/whatsapp-code/aad-parity.contract.ts` e `test/routing/physical-destination-parity.contract.ts`.
 *
 * ⚠️ Quem **sela** a chave do Resend e o segredo do webhook é a API, na rota de configuração; quem os
 * **abre** é este worker, para enviar e-mail e para conferir a assinatura Svix do recebido. As duas
 * apps não importam código uma da outra, então só este teste impede a divergência. Divergiu de um
 * lado e o envelope não abre do outro — e a falha só aparece na primeira tentativa de envio, com a
 * transportadora do outro lado sem saber por quê.
 */
import { describe, expect, test } from 'bun:test'

const API_SOURCE = new URL(
  '../../../api-transportada/src/contractor-mail/application/contractor-mail-credential-secret.service.ts',
  import.meta.url,
)
const WORKER_SOURCE = new URL(
  '../../src/contractor-mail/application/contractor-mail-credential-secret.service.ts',
  import.meta.url,
)

const AAD_TEMPLATE =
  'transportada:contractor-mail-credential:v1:${input.companyId}:${input.settingsId}'
const WEBHOOK_SECRET_PREFIX_LITERAL = "const WEBHOOK_SIGNING_SECRET_PREFIX = 'whsec_'"
const MAX_LENGTH_LITERAL = 'const MAX_SECRET_LENGTH = 500'
const SECRET_SCHEMA_FIELDS = [
  'apiKey: z.string().min(1).max(MAX_SECRET_LENGTH)',
  '.startsWith(WEBHOOK_SIGNING_SECRET_PREFIX)',
]

describe('a paridade da credencial de e-mail com contratantes (spec 143 T006)', () => {
  test('a API sela com o AAD amarrado ao par empresa+configuração', async () => {
    const source = await Bun.file(API_SOURCE).text()

    expect(source).toContain(AAD_TEMPLATE)
  })

  test('o worker abre com exatamente o mesmo AAD', async () => {
    const source = await Bun.file(WORKER_SOURCE).text()

    expect(source).toContain(AAD_TEMPLATE)
  })

  test('as duas cópias exigem o mesmo formato de segredo do webhook', async () => {
    const [apiSource, workerSource] = await Promise.all([
      Bun.file(API_SOURCE).text(),
      Bun.file(WORKER_SOURCE).text(),
    ])

    for (const source of [apiSource, workerSource]) {
      expect(source).toContain(WEBHOOK_SECRET_PREFIX_LITERAL)
      expect(source).toContain(MAX_LENGTH_LITERAL)
      for (const fragment of SECRET_SCHEMA_FIELDS) {
        expect(source).toContain(fragment)
      }
    }
  })

  /** O worker declara ter só metade da forma da API: nunca sela, só abre. */
  test('the worker exposes decrypt only, never encrypt', async () => {
    const workerSource = await Bun.file(WORKER_SOURCE).text()

    expect(workerSource).toContain('decrypt(')
    expect(workerSource).not.toContain('encrypt(')
    expect(workerSource).not.toContain('async function encryptSecret')
  })
})
