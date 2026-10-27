/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T3b (D11/D12): o vocabulário do canal com o cliente e dos contatos é um só. A CHECK da migration, o schema
 * da API e o painel (que não importa código da API) listam os mesmos valores, na mesma ordem; o padrão de WhatsApp da
 * CHECK é o mesmo E.164 que a API usa; e o envio de e-mail da API e do worker lê só as linhas `email` da tabela nova.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { inList } from '../../src/database/schema-check.constant.js'
import {
  CLIENT_CHANNEL_DEFAULT,
  CLIENT_CHANNELS,
  DELIVERY_CLIENT_CONTACT_CHANNEL_DEFAULT,
  DELIVERY_CLIENT_CONTACT_CHANNELS,
  DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN,
} from '../../src/shared/delivery-client-email.constant.js'

const MIGRATION = new URL(
  '../../drizzle/20261027180000_delivery_client_contacts/migration.sql',
  import.meta.url,
)
const PANEL_CONSTANT = new URL(
  '../../../frontend-transportada/src/modules/trip/shared/occurrenceContractorReply.constant.ts',
  import.meta.url,
)
const CLIENT_EMAIL_FORWARD =
  'src/occurrence-conversation/infrastructure/contractor-reply-client-email-forward.support.ts'
const API_FORWARD = new URL(`../../${CLIENT_EMAIL_FORWARD}`, import.meta.url)
const WORKER_FORWARD = new URL(
  `../../../worker-transportada/${CLIENT_EMAIL_FORWARD}`,
  import.meta.url,
)

function readArrayLiteral(source: string, name: string): readonly string[] {
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const`).exec(source)
  if (match?.[1] === undefined) throw new Error(`${name} not found`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1] ?? '')
}

describe('canal com o cliente e contatos do cliente: um vocabulário só (spec 281 T3b)', () => {
  test('a migration grava os padrões e as CHECKs com os valores da API', async () => {
    const migration = await readFile(MIGRATION, 'utf8')

    expect(migration).toContain(
      `"client_channel" varchar(16) DEFAULT '${CLIENT_CHANNEL_DEFAULT}' NOT NULL`,
    )
    expect(migration).toContain(`CHECK ("client_channel" in (${inList(CLIENT_CHANNELS)}))`)
    expect(migration).toContain(
      `"channel" varchar(16) DEFAULT '${DELIVERY_CLIENT_CONTACT_CHANNEL_DEFAULT}' NOT NULL`,
    )
    expect(migration).toContain(
      `CHECK ("channel" in (${inList(DELIVERY_CLIENT_CONTACT_CHANNELS)}))`,
    )
    expect(migration).toContain(`"address" ~ '${DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN}'`)
  })

  test('o painel lista os mesmos canais da API, na mesma ordem', async () => {
    const panel = await readFile(PANEL_CONSTANT, 'utf8')
    expect(readArrayLiteral(panel, 'CLIENT_CHANNELS')).toEqual([...CLIENT_CHANNELS])
  })

  test.each([
    ['+5511987654321', true],
    ['+12025550123', true],
    ['11987654321', false],
    ['+0511987654321', false],
    ['+55 11 98765-4321', false],
    ['+55119', false],
  ] as const)('o número %s %s cabe no E.164 da CHECK', (address, accepted) => {
    expect(new RegExp(DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN).test(address)).toBe(accepted)
  })

  test('o envio de e-mail ao cliente lê a tabela nova, só as linhas de e-mail, igual na API e no worker', async () => {
    const [api, worker] = await Promise.all([
      readFile(API_FORWARD, 'utf8'),
      readFile(WORKER_FORWARD, 'utf8'),
    ])

    expect(worker).toBe(api)
    expect(api).toContain('join delivery_client_contacts email')
    expect(api).toContain("email.channel = 'email'")
    expect(api).not.toContain('delivery_client_emails')
  })
})
