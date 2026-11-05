/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 S5/C4: a pergunta do canhoto que ninguém respondeu em 30 minutos é cancelada e a foto sai do bucket, mesmo
 * que o motorista nunca mais escreva (antes, só quem lia a pergunta a vencia).
 */
import { describe, expect, test } from 'bun:test'

import { CANHOTO_QUESTION_TTL_MILLISECONDS } from '../../src/whatsapp-commands/application/whatsapp-canhoto-recognition.service.js'
import { startCanhotoQuestionExpiryWatcher } from '../../src/whatsapp-commands/infrastructure/whatsapp-canhoto-question-expiry.watcher.js'

const NOW = new Date('2026-11-05T15:00:00.000Z')

describe('vigia da pergunta do canhoto (spec 294 S5)', () => {
  test('cancela as vencidas há 30 minutos e apaga a foto de cada uma', async () => {
    const asked: { readonly before: Date; readonly limit: number }[] = []
    const removed: { readonly companyId: string; readonly objectKey: string }[] = []
    const watcher = startCanhotoQuestionExpiryWatcher({
      intervalMs: 3_600_000,
      logger: { info() {}, warn() {} } as never,
      media: {
        remove: async (input) => {
          removed.push(input)
        },
      },
      now: () => NOW,
      questions: {
        expireOpen: async (input) => {
          asked.push(input)
          return asked.length === 1
            ? [
                { companyId: 'C1', objectKey: 'k1' },
                { companyId: 'C2', objectKey: 'k2' },
              ]
            : []
        },
      },
    })
    await watcher.tick()
    watcher.stop()

    expect(asked[0]?.before).toEqual(new Date(NOW.getTime() - CANHOTO_QUESTION_TTL_MILLISECONDS))
    expect(removed).toEqual([
      { companyId: 'C1', objectKey: 'k1' },
      { companyId: 'C2', objectKey: 'k2' },
    ])
  })

  test('uma foto que não sai do bucket não impede as outras nem derruba o vigia', async () => {
    const removed: string[] = []
    const watcher = startCanhotoQuestionExpiryWatcher({
      intervalMs: 3_600_000,
      logger: { info() {}, warn() {} } as never,
      media: {
        remove: async ({ objectKey }) => {
          if (objectKey === 'k1') throw new Error('bucket')
          removed.push(objectKey)
        },
      },
      now: () => NOW,
      questions: {
        expireOpen: async () => [
          { companyId: 'C1', objectKey: 'k1' },
          { companyId: 'C1', objectKey: 'k2' },
        ],
      },
    })
    await watcher.tick()
    watcher.stop()
    expect(removed).toEqual(['k2'])
  })

  test('falha do banco não derruba o vigia', async () => {
    const watcher = startCanhotoQuestionExpiryWatcher({
      intervalMs: 3_600_000,
      logger: { info() {}, warn() {} } as never,
      media: { remove: async () => undefined },
      now: () => NOW,
      questions: {
        expireOpen: async () => {
          throw new Error('db')
        },
      },
    })
    await expect(watcher.tick()).resolves.toBeUndefined()
    watcher.stop()
  })
})
