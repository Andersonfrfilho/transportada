/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A policy de estado final é cópia por valor da API (as apps não importam código uma da outra). Se
 * as duas divergirem, o worker chama a API num momento e a API decide por outra régua — e o pedido
 * fica sendo chamado a cada batida sem nunca liquidar, ou liquida antes de o worker perguntar.
 */
import { describe, expect, test } from 'bun:test'

import {
  classifyWhatsAppCommandDocument,
  decideWhatsAppCommandSettlement,
} from '../../src/whatsapp-command-settlement/domain/whatsapp-command-settlement.policy.js'

const MARKER = '// ── corpo compartilhado ──'
const WORKER_POLICY = new URL(
  '../../src/whatsapp-command-settlement/domain/whatsapp-command-settlement.policy.ts',
  import.meta.url,
)
const API_POLICY = new URL(
  '../../../api-transportada/src/whatsapp-commands/domain/whatsapp-command-settlement.policy.ts',
  import.meta.url,
)

async function sharedBody(url: URL): Promise<string> {
  const source = await Bun.file(url).text()
  const index = source.indexOf(MARKER)
  if (index < 0) throw new Error(`marca do corpo compartilhado ausente em ${url.pathname}`)
  return source.slice(index)
}

describe('policy de liquidação: paridade com a API (spec 144 T014)', () => {
  test('o corpo abaixo da marca é idêntico nas duas apps', async () => {
    expect(await sharedBody(WORKER_POLICY)).toBe(await sharedBody(API_POLICY))
  })

  test('reconciliation_required é pendente e cancelled é falha também aqui', () => {
    expect(classifyWhatsAppCommandDocument('reconciliation_required')).toBe('pending')
    expect(classifyWhatsAppCommandDocument('cancelled')).toBe('failure')
    expect(classifyWhatsAppCommandDocument('authorized')).toBe('success')
  })

  test('confirming parado há mais de quinze minutos é retomado', () => {
    const now = new Date('2026-09-12T12:00:00.000Z')
    expect(
      decideWhatsAppCommandSettlement({
        confirmedAt: new Date(now.getTime() - 16 * 60_000),
        documents: [],
        now,
        status: 'confirming',
      }),
    ).toBe('resume')
  })
})
