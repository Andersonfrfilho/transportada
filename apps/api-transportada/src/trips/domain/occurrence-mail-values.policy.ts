/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108): os valores que o modelo do módulo de notificação recebe — o que a nota, a ocorrência e os
 * itens dizem, com as chaves `{{camelCase}}` da lista fechada. O servidor é quem os monta; o cliente nunca
 * manda preço nem unidade.
 *
 * ⚠️ **Valor ausente vira vazio, nunca `undefined`:** o renderizador do módulo troca `{{campo}}` ausente por
 * vazio, mas o mapa completo é a lista fechada validada ao salvar o tipo.
 */
import {
  formatBrazilianAmount,
  formatBrazilianQuantity,
  parseAmountToCents,
  resolveOccurrenceAmounts,
} from './occurrence-amount.policy.js'
import { toDisplayPersonName } from '../../shared/person-name.service.js'
import { OCCURRENCE_ITEM_LINES_LIMIT } from '../../occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import type {
  OccurrenceMailItem,
  OccurrenceMailLine,
  OccurrenceMailValues,
} from './occurrence-mail-values.types.js'

type MailValues = Readonly<Record<string, string>>

/** `AAAA-MM-DD` → `DD/MM/AAAA`; ausente (ou fora da forma) é vazio. */
export function formatIsoDate(value: string | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value ?? '')
  return match === null ? '' : `${match[3]}/${match[2]}/${match[1]}`
}

function formatCents(cents: bigint | null): string {
  return cents === null ? '' : formatBrazilianAmount(cents)
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

type ItemAmount = ReturnType<typeof resolveOccurrenceAmounts>['lines'][number]

/** A quantidade da ocorrência (senão a da nota) em formato brasileiro, com a unidade quando há. */
function buildItemQuantity(line: OccurrenceMailLine): string {
  return [formatBrazilianQuantity(line.quantity ?? line.nfeQuantity), line.unit]
    .filter((part) => part !== '')
    .join(' ')
}

/** `{codigo} – {item} – {quantidade} {unidade} – R$ {valor}`; o segmento que a nota não tem some. */
function buildItemLine(line: OccurrenceMailLine, amount: ItemAmount): string {
  return [
    line.code,
    line.description,
    buildItemQuantity(line),
    `R$ ${formatBrazilianAmount(amount.itemAmountCents)}`,
  ]
    .filter((part) => part !== '')
    .join(' – ')
}

/**
 * Spec 272 (ADR-0110 §5): as mesmas linhas, em colunas, para a tabela do e-mail em HTML — os mesmos números do texto,
 * e a soma da 247 (`''` sem linha). Todas, sem o teto: quem monta a tabela corta e conta o resto.
 */
export function buildOccurrenceItemRows(values: OccurrenceMailValues): {
  readonly itemsSum: string
  readonly rows: readonly {
    readonly amount: string
    readonly code: string
    readonly description: string
    readonly quantity: string
  }[]
} {
  const lines = values.lines ?? []
  const amounts = resolveOccurrenceAmounts({ declaredAmount: values.declaredAmount ?? null, lines })
  return {
    itemsSum: formatCents(amounts.itemsSumCents),
    rows: lines.flatMap((line, index) => {
      const amount = amounts.lines[index]
      return amount === undefined
        ? []
        : [
            {
              amount: `R$ ${formatBrazilianAmount(amount.itemAmountCents)}`,
              code: line.code,
              description: line.description,
              quantity: buildItemQuantity(line),
            },
          ]
    }),
  }
}

/** O bloco que `{{linhasItens}}` imprime: até `maxLines` linhas (padrão, o teto) e, por fim, "e mais N itens". */
export function joinItemLines(
  itemLines: readonly string[],
  maxLines: number = OCCURRENCE_ITEM_LINES_LIMIT,
): string {
  const shown = itemLines.slice(0, Math.min(maxLines, OCCURRENCE_ITEM_LINES_LIMIT))
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
      motorista: toDisplayPersonName(values.driverName),
      numeroNota: values.documentLabel,
      numeroNotaSemSerie: values.documentNumber ?? '',
      novaDataVencimento: formatIsoDate(values.requestedDueDate),
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

const OCCURRENCE_MOMENT_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
})

/** A data do e-mail da ocorrência leva a hora, no horário de Brasília (o servidor roda em UTC): `20/10/2026 10:35`. */
export function formatOccurrenceMoment(moment: Date): string {
  return OCCURRENCE_MOMENT_FORMAT.format(moment).replace(', ', ' ')
}
