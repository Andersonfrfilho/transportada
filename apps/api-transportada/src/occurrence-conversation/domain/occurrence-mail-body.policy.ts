/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 (ADR-0106, D5): o texto do e-mail da ocorrência a partir do modelo `occurrence` do cadastro de
 * modelos — abertura, uma linha por item e encerramento, separados por linha em branco. A assinatura
 * (operador e transportadora) **não** vem do modelo: `buildOccurrenceMail` a anexa, como no envio de hoje.
 * Tudo aqui é texto puro; o HTML escapa em `buildOccurrenceMail`.
 */
import {
  MAIL_TEMPLATE_CATALOG,
  OCCURRENCE_MAIL_TYPE,
  type MailTemplateContent,
} from '../../contractor-mail/domain/mail-template-catalog.constant.js'
import { renderMailTemplate } from '../../contractor-mail/domain/mail-template-render.policy.js'
import { OCCURRENCE_MAIL_LIMITS } from './occurrence-conversation.constant.js'
import { buildOccurrenceMail, type OccurrenceMail } from './occurrence-mail.template.js'

/** O teto de linhas de item num e-mail; o que passa dele vira "e mais N itens". */
export const OCCURRENCE_MAIL_ITEM_LINES_LIMIT = 200

const SECTION_SEPARATOR = '\n\n'
const WHITESPACE_RUN = /\s+/gu

type MailValues = Readonly<Record<string, string>>

export type ComposeOccurrenceMailParams = {
  /** Os valores de cada item (variáveis de item); as de e-mail também valem no texto do item. */
  readonly items: readonly MailValues[]
  readonly template: MailTemplateContent
  readonly values: MailValues
}

export type ComposedOccurrenceMail = {
  readonly bodyText: string
  readonly subject: string
}

/**
 * ⚠️ `renderMailTemplate` imprime o `{nome}` cru quando falta o valor, e o e-mail do cliente não pode
 * sair com marcador: toda variável do catálogo entra, vazia quando a nota não a tem.
 */
function withEveryCatalogVariable(values: MailValues, level: 'item' | 'mail'): MailValues {
  const entry = MAIL_TEMPLATE_CATALOG[OCCURRENCE_MAIL_TYPE]
  const variables = level === 'item' ? entry.itemVariables : entry.mailVariables
  return { ...Object.fromEntries(variables.map((variable) => [variable.name, ''])), ...values }
}

function renderText(text: string, values: MailValues): string {
  return renderMailTemplate({ format: 'text', text, values })
}

function buildItemBlock(lines: readonly string[], omitted: number): string {
  const omittedLine = omitted > 0 ? [`e mais ${omitted} ${omitted === 1 ? 'item' : 'itens'}`] : []
  return [...lines, ...omittedLine].join('\n')
}

function joinSections(sections: readonly string[]): string {
  return sections
    .map((section) => section.trim())
    .filter((section) => section !== '')
    .join(SECTION_SEPARATOR)
}

export function composeOccurrenceMail(params: ComposeOccurrenceMailParams): ComposedOccurrenceMail {
  const { items, template } = params
  const mailValues = withEveryCatalogVariable(params.values, 'mail')
  const subject = renderText(template.subject, mailValues)
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .slice(0, OCCURRENCE_MAIL_LIMITS.subject)
  const intro = renderText(template.intro, mailValues)
  const closing = renderText(template.closing, mailValues)
  const itemLines =
    template.itemText.trim() === ''
      ? []
      : items.slice(0, OCCURRENCE_MAIL_ITEM_LINES_LIMIT).map((item) =>
          renderText(template.itemText, {
            ...mailValues,
            ...withEveryCatalogVariable(item, 'item'),
          }),
        )
  const omittedByLimit = template.itemText.trim() === '' ? 0 : items.length - itemLines.length

  function assemble(shownLines: number): string {
    const omitted = omittedByLimit + (itemLines.length - shownLines)
    return joinSections([intro, buildItemBlock(itemLines.slice(0, shownLines), omitted), closing])
  }

  let shown = itemLines.length
  let bodyText = assemble(shown)
  while (bodyText.length > OCCURRENCE_MAIL_LIMITS.body && shown > 0) {
    shown -= 1
    bodyText = assemble(shown)
  }
  return { bodyText: bodyText.slice(0, OCCURRENCE_MAIL_LIMITS.body), subject }
}

const SAMPLE_VALUES: MailValues = {
  codigos_itens: '7000001 01, 7000002 02',
  contratante: 'Contratante Exemplo',
  data: '01/01/2026',
  itens: 'PRODUTO EXEMPLO A 500G, PRODUTO EXEMPLO B 1KG',
  motorista: 'Motorista Exemplo',
  numero_nota: '123456/1',
  numero_nota_sem_serie: '123456',
  numero_referencia: '45029',
  observacao: 'Avaria identificada no momento da conferência das mercadorias',
  parada: 'Rua Exemplo, 100',
  quantidades_itens: '1, 3',
  razao_social: 'Supermercado Exemplo Ltda',
  soma_itens: '632,00',
  valor_declarado: '632,00',
  valor_nota: '7.840,64',
}

const SAMPLE_ITEMS: readonly MailValues[] = [
  {
    codigo_item: '7000001 01',
    item: 'PRODUTO EXEMPLO A 500G',
    quantidade_item: '1',
    soma_item: '57,20',
    unidade_item: 'FD',
    valor_item: '57,20',
    valor_unitario_item: '57,20',
  },
  {
    codigo_item: '7000002 02',
    item: 'PRODUTO EXEMPLO B 1KG',
    quantidade_item: '3',
    soma_item: '60,00',
    unidade_item: 'CX',
    valor_item: '60,00',
    valor_unitario_item: '20,00',
  },
]

const SAMPLE_SIGNATURE = { carrierName: 'Transportadora Exemplo', operatorName: 'Operador Exemplo' }

/** A prévia do cadastro de modelos: o mesmo caminho do envio, com valores de exemplo fixos. */
export function renderOccurrenceMailPreview(template: MailTemplateContent): OccurrenceMail {
  const { bodyText, subject } = composeOccurrenceMail({
    items: SAMPLE_ITEMS,
    template,
    values: SAMPLE_VALUES,
  })
  return buildOccurrenceMail({ ...SAMPLE_SIGNATURE, bodyText, subject })
}
