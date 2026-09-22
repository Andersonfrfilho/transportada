/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { MAIL_SEND_READINESS_REASONS } from '../../src/modules/delivery-clients/shared/mailSendReadiness.service'

/**
 * `resolveMailSendReadinessView` (T404) espelha `resolveMailSendReadiness` da API sem importar
 * dela (o bundle do frontend não carrega código de outra app). Restatar a lista de motivos como
 * literal guardaria só o lado do frontend: se a API ganhasse um motivo novo, este teste continuaria
 * verde e a tela nunca mostraria o aviso novo. Por isso a paridade lê o **arquivo da API**, que é a
 * fonte — caminho relativo entre apps do mesmo monorepo, num teste, não um `import` de código, que
 * é o que a arquitetura proíbe.
 */
const API_POLICY_SOURCE = new URL(
  '../../../api-transportada/src/contractor-mail/domain/mail-send-readiness.policy.ts',
  import.meta.url,
)

async function readReasonUnion(source: URL): Promise<readonly string[]> {
  const text = await Bun.file(source).text()
  const declaration = /export const MAIL_SEND_READINESS_REASONS = \[([^\]]*)\] as const/u.exec(text)
  if (declaration?.[1] === undefined)
    throw new Error('API_CONSTANT_NOT_FOUND_MAIL_SEND_READINESS_REASONS')

  return [...declaration[1].matchAll(/'([a-z_]+)'/gu)].map((match) => match[1] ?? '')
}

describe('paridade dos motivos de liberação do envio (spec 150 T404)', () => {
  test('a lista do frontend é a mesma união de motivos da política da API', async () => {
    expect<readonly string[]>([...MAIL_SEND_READINESS_REASONS]).toEqual(
      await readReasonUnion(API_POLICY_SOURCE),
    )
  })
})
