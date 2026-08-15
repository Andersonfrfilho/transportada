import {
  describeRangeValue,
  SELECTION_SEPARATOR,
  selectionDiffersFromDefault,
} from '@/modules/shared/filterPill.service'

import {
  EMPTY_NFSE_INVOICE_FILTERS,
  type NfseInvoiceTableFilters,
} from './nfseInvoiceTable.service'

export const NFSE_INVOICE_PILL_FIELDS = ['takerTaxId', 'statuses', 'createdRange'] as const
export type NfseInvoicePillField = (typeof NFSE_INVOICE_PILL_FIELDS)[number]

export type NfseInvoiceFilterPill = Readonly<{
  field: NfseInvoicePillField
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

const FIELD_LABEL_KEY: Readonly<Record<NfseInvoicePillField, string>> = {
  createdRange: 'filters.createdRange',
  statuses: 'filters.statuses',
  takerTaxId: 'filters.takerTaxId',
}

type DescribeInput = Readonly<{
  filters: NfseInvoiceTableFilters
  formatDay: (value: string) => string
}>

/**
 * A pílula é descrita sem tradução: o status vira chave, e quem monta a UI resolve o texto. Assim o
 * mesmo descritor serve a pt-BR e a en sem duplicar a lista.
 */
export function describeNfseInvoiceFilterPills(
  input: DescribeInput,
): readonly NfseInvoiceFilterPill[] {
  const pills: NfseInvoiceFilterPill[] = []

  if (input.filters.takerTaxId.length > 0) {
    pills.push({
      field: 'takerTaxId',
      labelKey: FIELD_LABEL_KEY.takerTaxId,
      value: input.filters.takerTaxId,
    })
  }

  if (
    selectionDiffersFromDefault({
      defaults: EMPTY_NFSE_INVOICE_FILTERS.statuses,
      values: input.filters.statuses,
    })
  ) {
    pills.push({
      field: 'statuses',
      labelKey: FIELD_LABEL_KEY.statuses,
      value: input.filters.statuses.join(SELECTION_SEPARATOR),
      valueKeys: input.filters.statuses.map((status) => `status.${status}`),
    })
  }

  const createdRange = describeRangeValue({
    format: input.formatDay,
    from: input.filters.createdFrom,
    to: input.filters.createdUntil,
  })
  if (createdRange.length > 0) {
    pills.push({
      field: 'createdRange',
      labelKey: FIELD_LABEL_KEY.createdRange,
      value: createdRange,
    })
  }

  return pills
}

export function clearNfseInvoiceFilterField(
  input: Readonly<{ field: NfseInvoicePillField; filters: NfseInvoiceTableFilters }>,
): NfseInvoiceTableFilters {
  if (input.field === 'createdRange') {
    return { ...input.filters, createdFrom: '', createdUntil: '' }
  }
  if (input.field === 'statuses') {
    return { ...input.filters, statuses: EMPTY_NFSE_INVOICE_FILTERS.statuses }
  }
  return { ...input.filters, takerTaxId: '' }
}
