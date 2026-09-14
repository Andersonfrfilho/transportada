/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T010, passo (c) do Objetivo, reescrito na revisão do `architect`. O `to`/`cc` do e-mail
 * recebido pode trazer mais de um endereço (cópia, encaminhamento, "responder a todos"), e mais de
 * um pode até bater com o `replyDomain` — a extração original parava no primeiro que casasse, o que
 * escondia o caso de duas conversas concorrendo pelo mesmo e-mail. Agora ela devolve **todos** os
 * candidatos, e é o caso de uso (com o repositório) quem decide se um deles resolve sozinho.
 *
 * O filtro final por `REPLY_TOKEN_PATTERN` (base32 minúsculo de 128 bits, sem padding — 26
 * caracteres, o mesmo formato de `reply-token.policy.ts#deriveReplyToken`) é o que descarta
 * `token+sufixo@…` (alias do Gmail) e qualquer outro lixo que caia no domínio certo por acidente:
 * nenhum token de verdade tem `+`, maiúscula ou tamanho diferente de 26.
 */
const REPLY_TOKEN_LENGTH = 26
const REPLY_TOKEN_PATTERN = new RegExp(`^[a-z2-7]{${REPLY_TOKEN_LENGTH}}$`)

export function extractReplyTokenCandidates(input: {
  readonly ccAddresses?: readonly string[]
  readonly replyDomain: string
  readonly toAddresses: readonly string[]
}): readonly string[] {
  const replyDomain = input.replyDomain.toLowerCase()
  const addresses = [...input.toAddresses, ...(input.ccAddresses ?? [])]
  const candidates = new Set<string>()

  for (const address of addresses) {
    const email = extractEmailAddress(address)
    if (email === undefined) continue

    const atIndex = email.lastIndexOf('@')
    if (atIndex <= 0) continue

    // Caixa não distingue: o local-part do e-mail é comparado em minúsculo, como o RF2 já previa.
    const localPart = email.slice(0, atIndex).toLowerCase()
    const domain = email.slice(atIndex + 1).toLowerCase()
    if (domain !== replyDomain) continue
    if (!REPLY_TOKEN_PATTERN.test(localPart)) continue

    candidates.add(localPart)
  }

  return [...candidates]
}

function extractEmailAddress(value: string): string | undefined {
  const angleMatch = /<([^<>]+)>/.exec(value)
  const candidate = (angleMatch?.[1] ?? value).trim()
  return candidate.length > 0 ? candidate : undefined
}
