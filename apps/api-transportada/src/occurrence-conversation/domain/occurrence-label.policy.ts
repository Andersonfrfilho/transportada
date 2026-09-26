/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Como a ocorrência se chama num aviso (ao motorista, T601; ao portal, T654): a nota, ou o tipo na
 * ocorrência de parada. Nunca PII — o aviso atravessa caixa de e-mail e log de terceiro.
 */
export function describeOccurrenceLabel(item: {
  readonly invoiceNumber: null | string
  readonly invoiceSeries: null | string
  readonly typeName: string
}): string {
  if (item.invoiceNumber === null || item.invoiceNumber === '') return item.typeName
  return item.invoiceSeries === null || item.invoiceSeries === ''
    ? `NF ${item.invoiceNumber}`
    : `NF ${item.invoiceNumber}/${item.invoiceSeries}`
}
