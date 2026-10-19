/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 274 D1: o composer da contratante abre com nota + contratante + permissão, haja portal ou não. */
export function resolveContractorComposer(input: {
  canSend: boolean
  contractorId: null | string
  hasDocument: boolean
}): { canWrite: boolean; status: 'closed' | 'open' } {
  const canWrite = input.canSend && input.hasDocument && input.contractorId !== null
  return { canWrite, status: canWrite ? 'open' : 'closed' }
}

export type ContractorChatErrorKind = 'generic' | 'noRecipients' | 'notConfigured' | 'notVerified'

/** Spec 274 D10: o motivo da falha do chat vem do código da API, nunca do texto. */
export function resolveContractorChatError(code: string | undefined): ContractorChatErrorKind {
  if (code === 'OCCURRENCE_CHAT_MAIL_NO_RECIPIENTS') return 'noRecipients'
  if (code === 'CONTRACTOR_MAIL_NOT_CONFIGURED') return 'notConfigured'
  if (code === 'CONTRACTOR_MAIL_SENDING_NOT_VERIFIED') return 'notVerified'
  return 'generic'
}
