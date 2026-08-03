/* Copyright (c) 2026 Ada Technology. MIT License. */
export const BILLING_CANCEL_REASON_MIN_LENGTH = 3

const CANCELLED_STATUS = 'cancelled'

export type BillingCancellationState = Readonly<{
  isDisabled: boolean
  messageKey: null | string
}>

type ResolveBillingCancellationStateInput = Readonly<{
  canCancel: boolean
  invoiceStatus: string
  isPending: boolean
  reason: string
}>

export function resolveBillingCancellationState(
  input: ResolveBillingCancellationStateInput,
): BillingCancellationState {
  if (!input.canCancel) {
    return { isDisabled: true, messageKey: 'invoiceDetail.cancelForbidden' }
  }
  if (input.invoiceStatus === CANCELLED_STATUS) {
    return { isDisabled: true, messageKey: 'invoiceDetail.cancelAlready' }
  }
  if (input.reason.trim().length < BILLING_CANCEL_REASON_MIN_LENGTH) {
    return { isDisabled: true, messageKey: 'invoiceDetail.cancelReasonHint' }
  }
  return { isDisabled: input.isPending, messageKey: null }
}
