/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T002 — a política do telefone é cópia por valor da API, e as duas têm de ser o mesmo
 * texto. A API casa o remetente com o número verificado; o worker casa o destinatário da resposta. Se
 * uma aceitar uma grafia que a outra recusa, a mensagem chega e a resposta vai para ninguém.
 */
import { describe, expect, test } from 'bun:test'

const API_SOURCE = new URL(
  '../../../api-transportada/src/whatsapp-commands/domain/whatsapp-phone.policy.ts',
  import.meta.url,
)
const WORKER_SOURCE = new URL('../../src/whatsapp/domain/whatsapp-phone.policy.ts', import.meta.url)

describe('a paridade da política do telefone (spec 144 T002)', () => {
  test('worker e API têm a mesma política, byte a byte', async () => {
    const apiSource = await Bun.file(API_SOURCE).text()
    const workerSource = await Bun.file(WORKER_SOURCE).text()

    expect(workerSource).toBe(apiSource)
  })
})
