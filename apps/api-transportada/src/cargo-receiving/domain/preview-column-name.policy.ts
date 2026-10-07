/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ADR-0094 §2: o nome de coluna se compara sem espaço nas pontas e sem diferença de caixa. O leitor
 * da planilha (Fase 4a) usa esta mesma função, ou `valor` e `VALOR ` seriam colunas diferentes.
 */
export function normalizePreviewColumnName(columnName: string): string {
  return columnName.trim().normalize('NFC').toUpperCase()
}
