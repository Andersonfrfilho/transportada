/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 (D10, T1b): o modelo geral do botão "Avisar a contratante", `ocorrencia.contratante-aviso-manual`, para o
 * botão nunca ficar sem texto. Ordem de escolha, só no aviso manual: o modelo do tipo (ou a versão WhatsApp da chave
 * do tipo, no grupo) → o modelo do grupo da 318 (`ocorrencia.contratante-grupo`, só no grupo) → este. O aviso
 * automático nunca o lê: lá, sem modelo, continua `no_template_selected`/`template_missing`.
 *
 * Duas versões da mesma chave no módulo de notificação (`pt-BR`): `email` (assunto + HTML, mesma família visual dos
 * modelos de ocorrência, em `occurrence-mail-templates/contratante-aviso-manual.html`) e `whatsapp` (texto, em
 * `occurrence-whatsapp-templates/contratante-aviso-manual.txt`).
 *
 * A régua de variáveis é a lista fechada do aviso no grupo (tipo, contratante, nota, cliente, endereço, valor, data,
 * momento, observação) mais, no e-mail, a moldura do sistema (identidade da transportadora, assinatura, rodapé).
 * CPF, CNPJ e telefone **nunca** entram, nem o da transportadora: o modelo é geral e vale para qualquer contratante.
 */
import { extractTemplatePlaceholders } from '@adatechnology/notification-contracts'

import { CONTRACTOR_OCCURRENCE_GROUP_VARIABLES } from './contractor-occurrence-group.policy.js'
import { HTML_BODY_REGEX } from './occurrence-contractor-mail.constant.js'

export const CONTRACTOR_MANUAL_NOTICE_TEMPLATE_KEY = 'ocorrencia.contratante-aviso-manual'

/**
 * As variáveis que o e-mail do modelo geral pode usar: as do aviso no grupo com o nome do catálogo do e-mail
 * (`razaoSocial` é o cliente; o e-mail não tem endereço de entrega nem momento) e a moldura do sistema.
 */
export const CONTRACTOR_MANUAL_NOTICE_EMAIL_VARIABLES: ReadonlySet<string> = new Set([
  'contratante',
  'data',
  'numeroNota',
  'numeroNotaSemSerie',
  'observacao',
  'razaoSocial',
  'tipoOcorrencia',
  'valorNota',
  // moldura do sistema: identidade da transportadora, assinatura e rodapé (sem CNPJ)
  'assinaturaCargo',
  'assinaturaNome',
  'avisoNovaData',
  'cidadeTransportadora',
  'faixaResposta',
  'logoAssinatura',
  'logoTransportadora',
  'marcasRodape',
  'nomeExibicao',
  'razaoSocialTransportadora',
])

/** O texto WhatsApp usa só a lista fechada do aviso no grupo (318), a mesma que o leitor do grupo monta. */
export const CONTRACTOR_MANUAL_NOTICE_WHATSAPP_VARIABLES: ReadonlySet<string> = new Set(
  CONTRACTOR_OCCURRENCE_GROUP_VARIABLES,
)

export type ManualNoticeTemplateProblem =
  | { readonly code: 'empty_body' }
  | { readonly code: 'html_not_allowed' }
  | { readonly code: 'malformed_placeholder' }
  | { readonly code: 'variables_outside_manual_notice'; readonly variables: readonly string[] }

/** Uma `{{` que o renderizador do módulo não casa: o texto sairia com o marcador cru. */
const MALFORMED_PLACEHOLDER_REGEX = /\{\{(?!\s*[A-Za-z0-9_]+\s*\}\})/u

function variablesOutside(texts: readonly string[], allowed: ReadonlySet<string>): string[] {
  return [
    ...new Set(
      texts
        .flatMap((text) => extractTemplatePlaceholders(text))
        .filter((name) => !allowed.has(name)),
    ),
  ]
}

/**
 * A régua do e-mail do modelo geral, somada à validação de sempre do e-mail de ocorrência
 * (`assessContractorTemplate`): nenhuma variável fora da lista do aviso manual.
 */
export function assessManualNoticeEmailTemplate(template: {
  readonly body: string
  readonly subject: string
}): readonly ManualNoticeTemplateProblem[] {
  const outside = variablesOutside(
    [template.subject, template.body],
    CONTRACTOR_MANUAL_NOTICE_EMAIL_VARIABLES,
  )
  return outside.length > 0 ? [{ code: 'variables_outside_manual_notice', variables: outside }] : []
}

/** O texto WhatsApp: não vazio, sem HTML, marcadores bem formados e só variáveis da lista do grupo. */
export function assessManualNoticeWhatsappTemplate(template: {
  readonly body: string
}): readonly ManualNoticeTemplateProblem[] {
  const { body } = template
  const outside = variablesOutside([body], CONTRACTOR_MANUAL_NOTICE_WHATSAPP_VARIABLES)
  return [
    ...(body.trim() === '' ? [{ code: 'empty_body' } as const] : []),
    ...(HTML_BODY_REGEX.test(body) ? [{ code: 'html_not_allowed' } as const] : []),
    ...(MALFORMED_PLACEHOLDER_REGEX.test(body) ? [{ code: 'malformed_placeholder' } as const] : []),
    ...(outside.length > 0
      ? [{ code: 'variables_outside_manual_notice', variables: outside } as const]
      : []),
  ]
}
