/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T010, passo (c) do Objetivo: "descobre o token pelo local-part do destinatário que casa
 * com o `replyDomain` da configuração". O `to` do e-mail recebido pode trazer mais de um endereço
 * (cópia, encaminhamento) e vir tanto como `token@dominio` quanto `Nome <token@dominio>` — pura, sem
 * I/O, para o caso de uso só decidir o que fazer com o resultado.
 */
export function extractReplyToken(input: {
  readonly replyDomain: string
  readonly toAddresses: readonly string[]
}): string | undefined {
  const replyDomain = input.replyDomain.toLowerCase()

  for (const address of input.toAddresses) {
    const email = extractEmailAddress(address)
    if (email === undefined) continue

    const atIndex = email.lastIndexOf('@')
    if (atIndex <= 0) continue

    const localPart = email.slice(0, atIndex)
    const domain = email.slice(atIndex + 1).toLowerCase()
    if (domain === replyDomain && localPart.length > 0) return localPart
  }

  return undefined
}

function extractEmailAddress(value: string): string | undefined {
  const angleMatch = /<([^<>]+)>/.exec(value)
  const candidate = (angleMatch?.[1] ?? value).trim()
  return candidate.length > 0 ? candidate : undefined
}
