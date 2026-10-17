/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 (ADR-0106): os valores que o modelo `occurrence` do cadastro de modelos recebe — o que a nota, a
 * ocorrência e os itens dizem, com as chaves `{snake_case}` do catálogo. O servidor é quem os monta; o
 * cliente nunca manda preço nem unidade.
 *
 * ⚠️ **Valor ausente vira vazio, nunca `undefined`:** o renderizador imprime o `{nome}` cru quando a chave
 * falta, e marcador cru no e-mail do cliente parece defeito do sistema.
 */
import {
  formatBrazilianAmount,
  formatBrazilianQuantity,
  parseAmountToCents,
  resolveOccurrenceAmounts,
} from './occurrence-amount.policy.js'
import { OCCURRENCE_ITEM_LINES_LIMIT } from '../../occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import type {
  OccurrenceMailItem,
  OccurrenceMailLine,
  OccurrenceMailValues,
} from './occurrence-mail-values.types.js'

type MailValues = Readonly<Record<string, string>>

export type OccurrenceMailValuesResult = {
  /** Um mapa por item marcado, na ordem em que foram marcados; vazio é a nota inteira. */
  readonly items: readonly MailValues[]
  readonly mail: MailValues
}

function formatCents(cents: bigint | null): string {
  return cents === null ? '' : formatBrazilianAmount(cents)
}

function buildItemValues(
  line: OccurrenceMailLine,
  amount: ReturnType<typeof resolveOccurrenceAmounts>['lines'][number],
): MailValues {
  return {
    codigo_item: line.code,
    item: line.description,
    quantidade_item: formatBrazilianQuantity(line.quantity ?? line.nfeQuantity),
    soma_item: formatBrazilianAmount(amount.lineAmountCents),
    unidade_item: line.unit,
    valor_item: formatBrazilianAmount(amount.itemAmountCents),
    valor_unitario_item: formatBrazilianAmount(parseAmountToCents(line.unitValue)),
  }
}

export function buildOccurrenceMailValues(
  values: OccurrenceMailValues,
): OccurrenceMailValuesResult {
  const lines = values.lines ?? []
  const amounts = resolveOccurrenceAmounts({
    declaredAmount: values.declaredAmount ?? null,
    lines,
  })
  return {
    items: lines.flatMap((line, index) => {
      const amount = amounts.lines[index]
      return amount === undefined ? [] : [buildItemValues(line, amount)]
    }),
    mail: {
      codigos_itens: values.itemCode,
      contratante: values.contractorName,
      data: values.occurredOn,
      itens: values.itemLabel,
      motorista: values.driverName,
      numero_nota: values.documentLabel,
      numero_nota_sem_serie: values.documentNumber ?? '',
      numero_referencia: values.referenceNumber ?? '',
      observacao: values.note,
      parada: values.stopLabel,
      quantidades_itens: values.itemQuantity,
      razao_social: values.recipientName,
      soma_itens: formatCents(amounts.itemsSumCents),
      valor_declarado: formatCents(amounts.declaredAmountCents),
      valor_nota:
        values.totalValue === '' ? '' : formatCents(parseAmountToCents(values.totalValue)),
    },
  }
}

/**
 * ⚠️ **O e-mail cita todos os itens marcados, não só o primeiro:** um texto que nomeia um só manda o
 * cliente conferir a carga errada. Nota inteira imprime vazio nos três marcadores, nunca o marcador
 * cru. A quantidade é a da ocorrência, em formato brasileiro e sem zeros à direita (`2,5`).
 */
export function buildOccurrenceItemValues(items: readonly OccurrenceMailItem[]): {
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

export type ContractorMailValuesResult = {
  /** Uma linha por item marcado, na ordem em que foram marcados — todas, sem o teto; quem monta o corpo encurta. */
  readonly itemLines: readonly string[]
  /** As variáveis `{{camelCase}}` do modelo do módulo de notificação; ausente é `''`, nunca `undefined`. */
  readonly mail: MailValues
}

/** `{codigo} – {item} – {quantidade} {unidade} – R$ {valor}`; o segmento que a nota não tem some. */
function buildItemLine(
  line: OccurrenceMailLine,
  amount: ReturnType<typeof resolveOccurrenceAmounts>['lines'][number],
): string {
  const quantity = [formatBrazilianQuantity(line.quantity ?? line.nfeQuantity), line.unit]
    .filter((part) => part !== '')
    .join(' ')
  return [
    line.code,
    line.description,
    quantity,
    `R$ ${formatBrazilianAmount(amount.itemAmountCents)}`,
  ]
    .filter((part) => part !== '')
    .join(' – ')
}

/** O bloco que `{{linhasItens}}` imprime: até o teto de linhas e, por fim, "e mais N itens". */
function joinItemLines(itemLines: readonly string[]): string {
  const shown = itemLines.slice(0, OCCURRENCE_ITEM_LINES_LIMIT)
  const omitted = itemLines.length - shown.length
  const omittedLine = omitted > 0 ? [`e mais ${omitted} ${omitted === 1 ? 'item' : 'itens'}`] : []
  return [...shown, ...omittedLine].join('\n')
}

/**
 * Spec 271 (ADR-0108, D4): os valores do modelo do módulo de notificação, com as chaves `{{camelCase}}` da
 * lista fechada (`OCCURRENCE_CONTRACTOR_MAIL_VARIABLES`). Os mesmos valores da 269, mais `tipoOcorrencia` e
 * `linhasItens`.
 */
export function buildContractorMailValues(
  values: OccurrenceMailValues,
): ContractorMailValuesResult {
  const lines = values.lines ?? []
  const amounts = resolveOccurrenceAmounts({
    declaredAmount: values.declaredAmount ?? null,
    lines,
  })
  const itemLines = lines.flatMap((line, index) => {
    const amount = amounts.lines[index]
    return amount === undefined ? [] : [buildItemLine(line, amount)]
  })
  return {
    itemLines,
    mail: {
      codigosItens: values.itemCode,
      contratante: values.contractorName,
      data: values.occurredOn,
      itens: values.itemLabel,
      linhasItens: joinItemLines(itemLines),
      motorista: values.driverName,
      numeroNota: values.documentLabel,
      numeroNotaSemSerie: values.documentNumber ?? '',
      numeroReferencia: values.referenceNumber ?? '',
      observacao: values.note,
      parada: values.stopLabel,
      quantidadesItens: values.itemQuantity,
      razaoSocial: values.recipientName,
      somaItens: formatCents(amounts.itemsSumCents),
      tipoOcorrencia: values.occurrenceTypeName ?? '',
      valorDeclarado: formatCents(amounts.declaredAmountCents),
      valorNota: values.totalValue === '' ? '' : formatCents(parseAmountToCents(values.totalValue)),
    },
  }
}
