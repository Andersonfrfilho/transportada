/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3 (RF3): o despacho do boleto por WhatsApp que a entrega automática reservou, depois do commit. Nunca lança:
 * o e-mail da contratante já foi gravado, e o que falhar fica na entrega (e cai para o e-mail do cliente).
 */
export type ContractorReplyClientWhatsAppDispatcherPort = {
  dispatch(params: { readonly companyId: string }): Promise<void>
}
