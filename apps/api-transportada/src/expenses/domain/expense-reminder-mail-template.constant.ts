/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3 (RF25, RF27): os modelos do aviso de conta a vencer e do resumo diário moram no módulo de notificação
 * (Notificações, editáveis sem deploy), com a sintaxe `{{camelCase}}` e uma lista fechada de variáveis por modelo. Os
 * arquivos-fonte são `expense-mail-templates/*.html` e `expense-whatsapp-templates/*.txt`, publicados por
 * `scripts/occurrence-mail-templates-publish.ts` (o mesmo publicador dos modelos de ocorrência e da correção de endereço).
 */

/** O prefixo das chaves das contas no módulo de notificação; a chave é `contas.<arquivo>`. */
export const EXPENSE_TEMPLATE_KEY_PREFIX = 'contas.'

/** O aviso de uma conta: e-mail (HTML) e WhatsApp (texto), a mesma chave nos dois canais. */
export const EXPENSE_REMINDER_TEMPLATE_KEY = 'contas.aviso-vencimento'
/** O resumo diário (RF27): só e-mail. */
export const EXPENSE_DAILY_SUMMARY_TEMPLATE_KEY = 'contas.resumo-diario'

export type ExpenseMailVariable = {
  readonly description: string
  readonly name: string
}

/** Texto: entra escapado no HTML e cru no WhatsApp. */
const SHARED_TEXT_VARIABLES: readonly ExpenseMailVariable[] = [
  { description: 'Nome de exibição da transportadora.', name: 'transportadora' },
  {
    description: 'Nome de quem recebe o aviso (o responsável ou o administrador).',
    name: 'responsavel',
  },
]

export const EXPENSE_REMINDER_TEXT_VARIABLES: readonly ExpenseMailVariable[] = [
  ...SHARED_TEXT_VARIABLES,
  { description: 'Nome da conta, como cadastrado em Contas.', name: 'conta' },
  { description: 'Categoria da conta.', name: 'categoria' },
  {
    description: 'Motorista, agregado ou ajudante que recebe o pagamento, ou "—" quando não há.',
    name: 'favorecido',
  },
  { description: 'Mês de competência, "11/2026".', name: 'competencia' },
  { description: 'Data do vencimento, "17/11/2026".', name: 'vencimento' },
  { description: 'Valor previsto, "R$ 1.234,56".', name: 'valor' },
  {
    description:
      'A frase do prazo: "vence em 3 dias", "vence amanhã", "vence hoje", "venceu há 2 dias".',
    name: 'situacao',
  },
]

/** HTML montado só pela API; entra sem escape e nunca dentro da área de mensagem. Vazio quando não se aplica. */
export const EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES = ['botaoJaPaguei', 'botaoAbrirContas'] as const

export const EXPENSE_DAILY_SUMMARY_TEXT_VARIABLES: readonly ExpenseMailVariable[] = [
  ...SHARED_TEXT_VARIABLES,
  { description: 'Data do resumo, "17/11/2026".', name: 'dia' },
  { description: 'Quantas contas, com a palavra: "1 conta", "3 contas".', name: 'quantidade' },
  {
    description: 'Soma do valor previsto das contas listadas, "R$ 4.500,00".',
    name: 'totalAberto',
  },
]

export const EXPENSE_DAILY_SUMMARY_SYSTEM_HTML_VARIABLES = [
  'tabelaContas',
  'botaoAbrirContas',
] as const

export type ExpenseMailSystemHtmlVariable =
  | (typeof EXPENSE_DAILY_SUMMARY_SYSTEM_HTML_VARIABLES)[number]
  | (typeof EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES)[number]

/** A régua de cada modelo: as variáveis de texto e as de HTML do sistema que ele aceita. */
export type ExpenseTemplateRules = {
  readonly systemHtml: readonly string[]
  readonly text: readonly ExpenseMailVariable[]
}

export const EXPENSE_MAIL_TEMPLATE_RULES: Readonly<Record<string, ExpenseTemplateRules>> = {
  [EXPENSE_DAILY_SUMMARY_TEMPLATE_KEY]: {
    systemHtml: EXPENSE_DAILY_SUMMARY_SYSTEM_HTML_VARIABLES,
    text: EXPENSE_DAILY_SUMMARY_TEXT_VARIABLES,
  },
  [EXPENSE_REMINDER_TEMPLATE_KEY]: {
    systemHtml: EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES,
    text: EXPENSE_REMINDER_TEXT_VARIABLES,
  },
}

/** No WhatsApp não há HTML: só as variáveis de texto do aviso. */
export const EXPENSE_WHATSAPP_TEMPLATE_RULES: Readonly<Record<string, ExpenseTemplateRules>> = {
  [EXPENSE_REMINDER_TEMPLATE_KEY]: { systemHtml: [], text: EXPENSE_REMINDER_TEXT_VARIABLES },
}
