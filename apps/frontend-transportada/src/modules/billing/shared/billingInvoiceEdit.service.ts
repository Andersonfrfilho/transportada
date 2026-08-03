/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  AMOUNT_ZERO,
  compareScaledAmounts,
  sumScaledAmounts,
} from '@/modules/shared/decimalAmount.service'

export const BILLING_OBSERVATIONS_MAX_LENGTH = 500

const CANCELLED_STATUS = 'cancelled'
/** Aceita o que o operador digita: vírgula do teclado pt-BR e até duas casas. */
const AMOUNT_INPUT_PATTERN = /^\d{1,12}(?:[.,]\d{1,2})?$/
const AMOUNT_DECIMAL_PLACES = 2

export type BillingInvoiceEditState = Readonly<{
  isDisabled: boolean
  messageKey: null | string
  totalAmount: null | string
}>

type ResolveBillingInvoiceEditStateInput = Readonly<{
  canEdit: boolean
  discountAmount: string
  invoiceStatus: string
  isPending: boolean
  observations: string
  subtotalAmount: string
  surchargeAmount: string
}>

export function normalizeBillingAmountInput(value: string): null | string {
  const trimmedValue = value.trim()
  if (trimmedValue.length === 0) return AMOUNT_ZERO
  if (!AMOUNT_INPUT_PATTERN.test(trimmedValue)) return null

  const [integerPart = '', fractionPart = ''] = trimmedValue.replace(',', '.').split('.')

  return `${BigInt(integerPart)}.${fractionPart.padEnd(AMOUNT_DECIMAL_PLACES, '0')}`
}

export function resolveBillingInvoiceEditState(
  input: ResolveBillingInvoiceEditStateInput,
): BillingInvoiceEditState {
  const discountAmount = normalizeBillingAmountInput(input.discountAmount)
  const surchargeAmount = normalizeBillingAmountInput(input.surchargeAmount)
  const totalAmount =
    discountAmount === null || surchargeAmount === null
      ? null
      : sumScaledAmounts([input.subtotalAmount, `-${discountAmount}`, surchargeAmount])

  if (!input.canEdit) {
    return { isDisabled: true, messageKey: 'invoiceDetail.editForbidden', totalAmount }
  }
  if (input.invoiceStatus === CANCELLED_STATUS) {
    return { isDisabled: true, messageKey: 'invoiceDetail.editCancelled', totalAmount }
  }
  if (discountAmount === null || surchargeAmount === null) {
    return { isDisabled: true, messageKey: 'invoiceDetail.editAmountHint', totalAmount: null }
  }
  if (input.observations.length > BILLING_OBSERVATIONS_MAX_LENGTH) {
    return { isDisabled: true, messageKey: 'invoiceDetail.editObservationsHint', totalAmount }
  }
  /** Mesmo 422 da API: recusar aqui evita gastar rede para receber a recusa de volta. */
  if (compareScaledAmounts(discountAmount, input.subtotalAmount) > 0) {
    return { isDisabled: true, messageKey: 'invoiceDetail.editDiscountHint', totalAmount }
  }

  return { isDisabled: input.isPending, messageKey: null, totalAmount }
}
