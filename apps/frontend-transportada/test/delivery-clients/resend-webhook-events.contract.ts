/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 (T402/T406): o webhook do Resend não serve só para a resposta da contratante
 * (`email.received`, 143). O selo de status da conversa depende de `email.sent`,
 * `email.delivered`, `email.bounced` e `email.failed`, e a API os aplica pelo mesmo webhook. A
 * instrução da tela lista os cinco. Sem eles o selo para em "enviada", sem erro nenhum.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const EVENTS = ['email.received', 'email.sent', 'email.delivered', 'email.bounced', 'email.failed']

describe('a instrução do webhook do Resend lista os eventos que a API usa (spec 183)', () => {
  for (const file of ['deliveryClients.locale.json', 'deliveryClients.en.locale.json']) {
    test(file, async () => {
      const text = (
        JSON.parse(
          await readFile(
            new URL(`../../src/modules/delivery-clients/locales/${file}`, import.meta.url),
            'utf8',
          ),
        ) as { contractorMail: { webhookInstructions: string } }
      ).contractorMail.webhookInstructions
      for (const event of EVENTS) expect(text).toContain(event)
    })
  }

  test('a API ainda aplica exatamente esses eventos', async () => {
    const source = await readFile(
      new URL(
        '../../../api-transportada/src/contractor-mail/application/process-inbound-email-webhook.use-case.ts',
        import.meta.url,
      ),
      'utf8',
    )
    for (const event of EVENTS) expect(source).toContain(`'${event}'`)
  })
})
