/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (T6, RF6): o modelo do e-mail de correção de endereço vem do módulo de notificação
 * (`notification.templates`), com a sintaxe `{{camelCase}}` do módulo e uma lista fechada de variáveis. Substitui o
 * cadastro `contractor_mail_templates` da spec 150 e a sintaxe `{snake_case}`.
 */

/** A chave do modelo do sistema; o arquivo-fonte é `address-correction-mail-templates/correcao-endereco.html`. */
export const ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY = 'correcao-endereco.padrao'

/** O modelo é de e-mail em português do Brasil, o idioma único do produto. */
export const ADDRESS_CORRECTION_MAIL_TEMPLATE_CHANNEL = 'email'
export const ADDRESS_CORRECTION_MAIL_TEMPLATE_LOCALE = 'pt-BR'

export type AddressCorrectionMailVariable = {
  readonly description: string
  readonly name: string
}

export const ADDRESS_CORRECTION_MAIL_VARIABLES: readonly AddressCorrectionMailVariable[] = [
  { description: 'Nome da contratante que recebe o e-mail.', name: 'contratante' },
  { description: 'Quantos endereços vão neste e-mail, só o número.', name: 'quantidade' },
  {
    description: 'A quantidade com a palavra no singular ou no plural: "1 cliente", "3 clientes".',
    name: 'clientes',
  },
  { description: 'Nome da transportadora que envia o e-mail.', name: 'transportadora' },
  { description: 'Nome de quem está enviando o e-mail.', name: 'operador' },
  {
    description:
      'Um bloco por endereço: como veio na nota, endereço correto e motivo (HTML do sistema).',
    name: 'blocosEnderecos',
  },
]

export const ADDRESS_CORRECTION_MAIL_VARIABLE_NAMES: ReadonlySet<string> = new Set(
  ADDRESS_CORRECTION_MAIL_VARIABLES.map((variable) => variable.name),
)

/** As únicas chaves cujo valor entra sem escape: o HTML é montado só pela API (mesma regra da 272). */
export const ADDRESS_CORRECTION_MAIL_SYSTEM_HTML_VARIABLES = ['blocosEnderecos'] as const
export type AddressCorrectionMailSystemHtmlVariable =
  (typeof ADDRESS_CORRECTION_MAIL_SYSTEM_HTML_VARIABLES)[number]

/** O teto do assunto do cabeçalho do e-mail. */
export const ADDRESS_CORRECTION_MAIL_SUBJECT_MAX_LENGTH = 200
