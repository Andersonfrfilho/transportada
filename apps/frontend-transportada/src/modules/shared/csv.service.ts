/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Ponto e vírgula, CRLF e BOM: mesmo padrão nos três exports (câmera, regiões de frete, veículos)
 * — é o que o Excel em pt-BR abre sem assistente de importação e sem comer o acento. Vírgula como
 * separador brigaria com a vírgula decimal do próprio valor.
 */
export const CSV_FIELD_SEPARATOR = ';'
export const CSV_LINE_SEPARATOR = '\r\n'
export const CSV_BYTE_ORDER_MARK = '﻿'

const QUOTE_PATTERN = /"/g
/**
 * T14 item 2: dado de XML fiscal de terceiro (código de produto, GTIN da caixa) entra direto numa
 * coluna. Um campo começando com `=`, `+`, `-`, `@` ou tab/CR é fórmula para o Excel — injeção de
 * fórmula clássica em CSV. O prefixo `'` neutraliza sem mudar o texto visível: o Excel mostra o
 * campo como texto puro em vez de calcular.
 */
const FORMULA_TRIGGER_PATTERN = /^[=+\-@\t\r]/u

/**
 * Escapa um campo de CSV: aspas duplicadas (RFC 4180) e, quando o primeiro caractere dispararia
 * fórmula na planilha, um `'` de prefixo. Único ponto de escape para os três exports do frontend —
 * segunda implementação diverge calada.
 */
export function escapeCsvField(value: string): string {
  const neutralized = FORMULA_TRIGGER_PATTERN.test(value) ? `'${value}` : value
  return `"${neutralized.replace(QUOTE_PATTERN, '""')}"`
}
