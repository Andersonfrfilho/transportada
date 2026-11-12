/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const PHONE_DIGITS = /^\d{8,15}$/u

/**
 * A marca do grupo: o corpo abre com `@número` (o WhatsApp mostra o nome do contato) e o número vai em `mentioned`.
 * Sem telefone válido o texto sai sem marca, nunca falha.
 */
export function withGroupMention(input: {
  readonly body: string
  readonly mentionNumber?: string | undefined
}): {
  readonly body: string
  readonly mentionNumber?: string
} {
  const { body, mentionNumber } = input
  if (mentionNumber === undefined || !PHONE_DIGITS.test(mentionNumber)) return { body }
  return { body: `@${mentionNumber} ${body}`, mentionNumber }
}
