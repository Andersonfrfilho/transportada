/* Copyright (c) 2026 Ada Technology. MIT License. */

const DOCUMENT_AMOUNT_FORMATTER = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  style: 'currency',
})
const DOCUMENT_WEIGHT_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

/** `Intl.NumberFormat` aceita a string decimal direto — nada passa por número binário. */
function toNumericLiteral(value: string): `${number}` {
  return value as `${number}`
}

/** O valor da nota (`totalAmount`, string decimal da API) em R$ — sem somar, só exibir. */
export function formatDocumentAmount(totalAmount: string): string {
  return DOCUMENT_AMOUNT_FORMATTER.format(toNumericLiteral(totalAmount))
}

/** O peso bruto da nota em quilos, com vírgula pt-BR e sem zero à direita fingindo precisão. */
export function formatDocumentWeight(grossWeight: string): string {
  return DOCUMENT_WEIGHT_FORMATTER.format(toNumericLiteral(grossWeight))
}
