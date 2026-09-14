/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T002 — a política do telefone é cópia por valor da API, e as duas têm de ser o mesmo
 * texto. A API casa o remetente com o número verificado; o worker casa o destinatário da resposta. Se
 * uma aceitar uma grafia que a outra recusa, a mensagem chega e a resposta vai para ninguém.
 */
import { describe, expect, test } from 'bun:test'

import {
  WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS,
  WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS,
} from '../../src/whatsapp/domain/whatsapp-phone-verification.constant.js'

const API_SOURCE = new URL(
  '../../../api-transportada/src/whatsapp-commands/domain/whatsapp-phone.policy.ts',
  import.meta.url,
)
const WORKER_SOURCE = new URL('../../src/whatsapp/domain/whatsapp-phone.policy.ts', import.meta.url)
const API_VERIFICATION_SOURCE = new URL(
  '../../../api-transportada/src/whatsapp-commands/domain/whatsapp-phone-verification.constant.ts',
  import.meta.url,
)
const VALIDITY_DECLARATION =
  /export const WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS = (\d+)\nexport const WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS =\n {2}WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS \* 86_400_000\n/u

describe('a paridade da política do telefone (spec 144 T002)', () => {
  test('worker e API têm a mesma política, byte a byte', async () => {
    const apiSource = await Bun.file(API_SOURCE).text()
    const workerSource = await Bun.file(WORKER_SOURCE).text()

    expect(workerSource).toBe(apiSource)
  })

  /**
   * T014b (M2): a API aceita o remetente só com verificação de até 90 dias, e o worker entrega o
   * resumo pela mesma régua. Se uma mudar sozinha, o resumo sai para um chip que a API já não aceita.
   */
  test('a validade da verificação é a mesma nos dois lados, e com a mesma conta', async () => {
    const apiSource = await Bun.file(API_VERIFICATION_SOURCE).text()
    const declaration = VALIDITY_DECLARATION.exec(apiSource)

    expect(declaration?.[1]).toBe(String(WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS))
    expect(WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS).toBe(
      WHATSAPP_PHONE_VERIFICATION_VALIDITY_DAYS * 86_400_000,
    )
  })
})
