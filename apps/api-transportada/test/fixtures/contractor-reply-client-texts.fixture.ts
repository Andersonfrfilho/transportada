/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3: o `resolveClientTexts` das portas de envio manual, para os contratos com dublê. Sem `template`, a regra da
 * leitura tolerante (o texto livre copiado no retorno, como antes da 286); com ele, o modelo do canal já renderizado;
 * `'missing'` é o modelo escolhido que não serve.
 */
import type { ContractorReplyEmailTransactionPort } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.port.js'

export type ClientTextsTemplate =
  | 'missing'
  /** O tipo não escolheu modelo: sem texto antigo, o canal fica desligado. */
  | 'none'
  | Readonly<Partial<Record<'email' | 'whatsapp', { body: string; subject: string }>>>

/** Sem `template`, o dublê usa o modelo padrão dos contratos: a regra de envio é testada, não o texto. */
const DEFAULT_TEXTS = {
  email: { body: 'Segue o boleto com o novo vencimento.', subject: 'Boleto prorrogado' },
  whatsapp: { body: 'Boleto prorrogado\n\nSegue o boleto com o novo vencimento.', subject: '' },
} as const

export function createClientTextsResolver(
  template?: ClientTextsTemplate,
): ContractorReplyEmailTransactionPort['resolveClientTexts'] {
  return async ({ channel }) => {
    if (template === 'missing') return { kind: 'template_missing', legacy: false }
    if (template === 'none') return { kind: 'template_missing', legacy: true }
    const chosen = template?.[channel] ?? DEFAULT_TEXTS[channel]
    return { kind: 'texts', texts: chosen }
  }
}
