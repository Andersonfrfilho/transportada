/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 e spec 247: o texto que a empresa escreve para cada tipo de ocorrência.
 *
 * O e-mail ao embarcador hoje é escrito à mão a cada ocorrência, a partir de um documento de
 * modelos — e é lá que o número da nota entra trocado, o valor fica do pedido anterior e o assunto
 * sai fora do padrão que o SAC do cliente espera.
 */
import {
  OCCURRENCE_DEFAULT_ITEM_LINE_TEMPLATE,
  OCCURRENCE_ITEM_LINE_PLACEHOLDERS,
  OCCURRENCE_ITEM_LINES_LIMIT,
  OCCURRENCE_ITEM_LINES_PLACEHOLDER,
  OCCURRENCE_SUBJECT_PLACEHOLDERS,
  OCCURRENCE_TEMPLATE_CONTEXT,
  OCCURRENCE_TEMPLATE_PLACEHOLDERS,
  type OccurrenceTemplateContext,
} from '../../shared/occurrence-template.constant.js'

import {
  formatBrazilianAmount,
  formatBrazilianQuantity,
  parseAmountToCents,
  resolveOccurrenceAmounts,
  type OccurrenceAmountSummary,
} from './occurrence-amount.policy.js'
import type {
  OccurrenceTemplateItem,
  OccurrenceTemplateLine,
  OccurrenceTemplateValues,
} from './occurrence-template.types.js'

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/gu

const KNOWN_PLACEHOLDERS: Record<OccurrenceTemplateContext, ReadonlySet<string>> = {
  [OCCURRENCE_TEMPLATE_CONTEXT.body]: new Set(OCCURRENCE_TEMPLATE_PLACEHOLDERS),
  [OCCURRENCE_TEMPLATE_CONTEXT.itemLine]: new Set(OCCURRENCE_ITEM_LINE_PLACEHOLDERS),
  [OCCURRENCE_TEMPLATE_CONTEXT.subject]: new Set(OCCURRENCE_SUBJECT_PLACEHOLDERS),
}

function formatCents(cents: bigint | null): string {
  return cents === null ? '' : formatBrazilianAmount(cents)
}

function valueOf(
  placeholder: string,
  values: OccurrenceTemplateValues,
  amounts: OccurrenceAmountSummary,
): null | string {
  switch (placeholder) {
    case 'codigoItem':
      return values.itemCode
    case 'contratante':
      return values.contractorName
    case 'data':
      return values.occurredOn
    case 'item':
      return values.itemLabel
    case 'motorista':
      return values.driverName
    case 'numeroNota':
      return values.documentLabel
    case 'numeroNotaSemSerie':
      return values.documentNumber ?? ''
    case 'numeroReferencia':
      return values.referenceNumber ?? ''
    case 'observacao':
      return values.note
    case 'parada':
      return values.stopLabel
    case 'quantidadeItem':
      return values.itemQuantity
    case 'razaoSocial':
      return values.recipientName
    case 'somaItens':
      return formatCents(amounts.itemsSumCents)
    case 'valorDeclarado':
      return formatCents(amounts.declaredAmountCents)
    case 'valorNota':
      return values.totalValue === '' ? '' : formatCents(parseAmountToCents(values.totalValue))
    default:
      return null
  }
}

function lineValueOf(
  placeholder: string,
  line: OccurrenceTemplateLine,
  amount: OccurrenceAmountSummary['lines'][number],
): null | string {
  switch (placeholder) {
    case 'codigoItem':
      return line.code
    case 'item':
      return line.description
    case 'quantidadeItem':
      return formatBrazilianQuantity(line.quantity ?? line.nfeQuantity)
    case 'somaItem':
      return formatBrazilianAmount(amount.lineAmountCents)
    case 'unidadeItem':
      return line.unit
    case 'valorItem':
      return formatBrazilianAmount(amount.itemAmountCents)
    case 'valorUnitarioItem':
      return formatBrazilianAmount(parseAmountToCents(line.unitValue))
    default:
      return null
  }
}

/**
 * ⚠️ **Cada texto entra uma vez só.** O resultado de um marcador nunca é lido de novo: a descrição
 * do produto vem da NF-e do cliente, e um `{{observacao}}` dentro dela sairia trocado.
 *
 * ⚠️ **Valor ausente vira vazio, nunca o marcador cru.** A nota nem sempre tem item apontado, e
 * imprimir `{{item}}` no e-mail do cliente é pior que imprimir nada. Espaço dentro das chaves é
 * tolerado: é o erro de digitação mais comum de quem escreve o modelo.
 */
function replacePlaceholders(template: string, resolve: (name: string) => null | string): string {
  return template.replace(PLACEHOLDER_PATTERN, (marker, name: string) => resolve(name) ?? marker)
}

function renderItemLines(
  values: OccurrenceTemplateValues,
  amounts: OccurrenceAmountSummary,
): string {
  const lines = values.lines ?? []
  const template =
    values.itemLineTemplate === undefined || values.itemLineTemplate === ''
      ? OCCURRENCE_DEFAULT_ITEM_LINE_TEMPLATE
      : values.itemLineTemplate

  const rendered = amounts.lines.slice(0, OCCURRENCE_ITEM_LINES_LIMIT).flatMap((amount, index) => {
    const line = lines[index]
    if (line === undefined) return []
    return [
      replacePlaceholders(
        template,
        (name) => lineValueOf(name, line, amount) ?? valueOf(name, values, amounts),
      ),
    ]
  })

  const omitted = lines.length - OCCURRENCE_ITEM_LINES_LIMIT
  if (omitted > 0) rendered.push(`e mais ${omitted} ${omitted === 1 ? 'item' : 'itens'}`)
  return rendered.join('\n')
}

export function renderOccurrenceTemplate(input: {
  readonly template: string
  readonly values: OccurrenceTemplateValues
}): string {
  const { template, values } = input
  const amounts = resolveOccurrenceAmounts({
    declaredAmount: values.declaredAmount ?? null,
    lines: values.lines ?? [],
  })

  return replacePlaceholders(template, (name) =>
    name === OCCURRENCE_ITEM_LINES_PLACEHOLDER
      ? renderItemLines(values, amounts)
      : valueOf(name, values, amounts),
  )
}

/**
 * ⚠️ **A recusa é no cadastro, não no envio.** Quem escreve o modelo erra o nome do marcador; se a
 * recusa viesse só na hora de enviar, o operador descobriria com o cliente esperando — e sem
 * recusa nenhuma o e-mail sairia com o marcador cru. Cada contexto tem a sua lista: `{{valorItem}}`
 * no assunto ou `{{linhasItens}}` dentro da linha de item também são recusados.
 */
export function unknownTemplatePlaceholders(input: {
  readonly context: OccurrenceTemplateContext
  readonly template: string
}): readonly string[] {
  const known = KNOWN_PLACEHOLDERS[input.context]

  return [...input.template.matchAll(PLACEHOLDER_PATTERN)]
    .map((match) => match[1] ?? '')
    .filter((name) => !known.has(name))
}

/**
 * ⚠️ **O e-mail cita todos os itens marcados, não só o primeiro:** um texto que nomeia um só manda o
 * cliente conferir a carga errada. Nota inteira imprime vazio nos três marcadores, nunca o marcador
 * cru. A quantidade é a da ocorrência, em formato brasileiro e sem zeros à direita (`2,5`).
 */
export function buildOccurrenceItemValues(items: readonly OccurrenceTemplateItem[]): {
  readonly itemCode: string
  readonly itemLabel: string
  readonly itemQuantity: string
} {
  return {
    itemCode: items.map((item) => item.code).join(', '),
    itemLabel: items.map((item) => item.description).join(', '),
    itemQuantity: items.map((item) => formatBrazilianQuantity(String(item.quantity))).join(', '),
  }
}
