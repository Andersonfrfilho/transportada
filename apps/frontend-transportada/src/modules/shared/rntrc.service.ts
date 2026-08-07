/* Copyright (c) 2026 Ada Technology. MIT License. */

/** O certificado da ANTT escreve o registro com nove posições (058151044); o XML fiscal leva oito. */
export const RNTRC_LENGTH = 8

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
