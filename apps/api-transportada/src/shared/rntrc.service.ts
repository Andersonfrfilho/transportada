/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** O certificado da ANTT escreve o registro com nove posições (058151044); o XML fiscal leva oito. */
export const RNTRC_LENGTH = 8

/**
 * O cadastro guarda o registro como o documento o imprime — oito posições, ou nove quando a folha
 * põe o zero na frente. Encurtar na entrada faria a tela contar uma história diferente do papel.
 * O texto é a fonte única: o `~` do Postgres e o `regex` do Zod não podem divergir.
 */
export const RNTRC_INPUT_PATTERN = '^0?[0-9]{8}$'

export const RNTRC_INPUT = new RegExp(RNTRC_INPUT_PATTERN)

/**
 * Só descarta zero à esquerda enquanto sobra dígito: 00123456 é um registro legítimo de oito,
 * e limpar a zeros cegamente o transformaria em outro registro.
 */
export function normalizeRntrc(value: string): string {
  const digits = value.replace(/\D/g, '')
  let normalized = digits
  while (normalized.length > RNTRC_LENGTH && normalized.startsWith('0')) {
    normalized = normalized.slice(1)
  }
  return normalized
}
