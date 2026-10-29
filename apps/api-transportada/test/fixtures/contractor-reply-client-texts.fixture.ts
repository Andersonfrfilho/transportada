/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T3: o `resolveClientTexts` das portas de envio manual, para os contratos com dublê. Sem `template`, a regra da
 * leitura tolerante (o texto livre copiado no retorno, como antes da 286); com ele, o modelo do canal já renderizado;
 * `'missing'` é o modelo escolhido que não serve.
 */
import type { ContractorReplyEmailTransactionPort } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.port.js'
import { readContractorReplyLegacyTexts } from '../../src/occurrence-conversation/infrastructure/contractor-reply-client-template.support.js'

export type ClientTextsTemplate =
  | 'missing'
  | Readonly<Partial<Record<'email' | 'whatsapp', { body: string; subject: string }>>>

export function createClientTextsResolver(
  template?: ClientTextsTemplate,
): ContractorReplyEmailTransactionPort['resolveClientTexts'] {
  return async ({ channel, config }) => {
    if (template === 'missing') return { kind: 'template_missing', legacy: false }
    const chosen = template?.[channel]
    if (chosen !== undefined) return { kind: 'texts', texts: chosen }
    const legacy = readContractorReplyLegacyTexts(config)
    if (legacy === null) return { kind: 'template_missing', legacy: true }
    return {
      kind: 'texts',
      texts:
        channel === 'whatsapp'
          ? { body: `${legacy.subject}\n\n${legacy.body}`, subject: '' }
          : legacy,
    }
  }
}
