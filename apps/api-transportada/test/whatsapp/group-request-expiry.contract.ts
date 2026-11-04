/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  GROUP_REQUEST_EXPIRY_TEXT,
  startGroupRequestExpiryWatcher,
} from '../../src/whatsapp/infrastructure/whatsapp-group-request-expiry.watcher.js'

describe('vigia de vencimento do pedido do grupo (spec 292, regra 5)', () => {
  test('avisa o grupo do que venceu e do que está perto de vencer, uma resposta por pedido', async () => {
    const answers = [
      [{ company_id: 'C1', group_jid: 'g1@g.us' }],
      [{ company_id: 'C1', group_jid: 'g2@g.us' }],
    ]
    const sent: { groupJid: string; texts: readonly string[] }[] = []
    const watcher = startGroupRequestExpiryWatcher({
      database: { execute: async () => answers.shift() ?? [] },
      intervalMs: 3_600_000,
      logger: { info() {}, warn() {} } as never,
      replies: { send: ({ groupJid, texts }) => sent.push({ groupJid, texts }) },
    })
    await watcher.tick()
    watcher.stop()
    expect(sent).toEqual([
      { groupJid: 'g1@g.us', texts: [GROUP_REQUEST_EXPIRY_TEXT.expired] },
      { groupJid: 'g2@g.us', texts: [GROUP_REQUEST_EXPIRY_TEXT.warning] },
    ])
  })

  test('falha do banco não derruba o vigia nem manda aviso', async () => {
    const sent: unknown[] = []
    const watcher = startGroupRequestExpiryWatcher({
      database: {
        execute: async () => {
          throw new Error('db')
        },
      },
      intervalMs: 3_600_000,
      logger: { info() {}, warn() {} } as never,
      replies: { send: (input) => sent.push(input) },
    })
    await watcher.tick()
    watcher.stop()
    expect(sent).toEqual([])
  })
})
