/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  NfseDescriptionTemplateInvalidError,
  NfseDescriptionTooLongError,
} from './nfse-issuance.error.js'

const VARIABLE_PATTERN = /\{\{([^{}]*)\}\}/g
/** Quebra de linha e tabulação viram espaço: a prefeitura recebe uma linha só. */
const BLANK_RUN_PATTERN = /\s+/gu
const ENTRY_SEPARATOR = '; '

export type NfseDescriptionDocument = {
  readonly number: string
  readonly series: string
}

export type BuildNfseDescriptionParams = {
  readonly documents: readonly NfseDescriptionDocument[]
  readonly maxLength: number
  readonly municipalityName: string
  readonly observations?: string
  readonly period?: string
  readonly template: string
}

export type NfseDescription = {
  readonly description: string
  readonly listedDocuments: number
  readonly omittedDocuments: number
}

/**
 * A lista de notas é cortada na fronteira entre notas — nunca no meio de uma — e o excedente vira
 * resumo. `quantidadeNotas` conta a seleção inteira mesmo quando a lista foi cortada: o número que o
 * tomador lê é o número de notas que o serviço cobre.
 *
 * `periodo` é digitado pelo operador na emissão e sai daqui como veio — o domínio não deriva janela
 * nenhuma. A regra automática só nasce quando a transportadora souber **qual** janela ela cobra, e
 * a resposta não está nos dados que temos: a data de emissão da NF-e não é a data do serviço, e o
 * período que a prefeitura lê é o da prestação. Para definir a regra é preciso, nesta ordem:
 * 1. escolher a data-fonte (emissão da NF-e, entrega/canhoto, ou competência declarada no contrato);
 * 2. escolher o recorte (semana seg–sex anterior à emissão, quinzena, mês de competência);
 * 3. decidir o que fazer com a seleção que atravessa dois recortes — recusar ou cobrir os dois.
 * Enquanto os três estiverem em aberto, digitar é mais honesto que adivinhar: o texto vai para a
 * prefeitura e a nota é documento fiscal.
 */
export function buildNfseDescription({
  documents,
  maxLength,
  municipalityName,
  observations,
  period,
  template,
}: BuildNfseDescriptionParams): NfseDescription {
  const entries = documents.map(formatEntry)
  const render = (listed: number): string =>
    renderTemplate({
      entries,
      listed,
      municipalityName,
      observations,
      period,
      template,
      total: entries.length,
    })

  const complete = render(entries.length)
  if (complete.length <= maxLength) {
    return { description: complete, listedDocuments: entries.length, omittedDocuments: 0 }
  }

  const listed = findLargestFittingList({ maxLength, render, total: entries.length })
  if (listed === null) throw new NfseDescriptionTooLongError()

  return {
    description: render(listed),
    listedDocuments: listed,
    omittedDocuments: entries.length - listed,
  }
}

/**
 * Cada nota a mais só faz o texto crescer, então a busca binária vale — e evita renderizar o
 * texto inteiro uma vez por nota numa seleção grande.
 */
function findLargestFittingList({
  maxLength,
  render,
  total,
}: {
  readonly maxLength: number
  readonly render: (listed: number) => string
  readonly total: number
}): number | null {
  let low = 1
  let high = total - 1
  let fitting: number | null = null

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (render(middle).length <= maxLength) {
      fitting = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return fitting
}

function renderTemplate({
  entries,
  listed,
  municipalityName,
  observations,
  period,
  template,
  total,
}: {
  readonly entries: readonly string[]
  readonly listed: number
  readonly municipalityName: string
  readonly observations: string | undefined
  readonly period: string | undefined
  readonly template: string
  readonly total: number
}): string {
  const variables: Readonly<Record<string, string>> = {
    municipio: municipalityName,
    notas: buildList({ entries: entries.slice(0, listed), omitted: total - listed }),
    observacoes: observations ?? '',
    periodo: period ?? '',
    quantidadeNotas: String(total),
  }

  const resolved = template.replace(VARIABLE_PATTERN, (_match, name: string) => {
    const value = variables[name.trim()]
    if (value === undefined) throw new NfseDescriptionTemplateInvalidError(name.trim())

    return value
  })

  return collapseBlanks(resolved)
}

function buildList({
  entries,
  omitted,
}: {
  readonly entries: readonly string[]
  readonly omitted: number
}): string {
  const listed = entries.join(ENTRY_SEPARATOR)
  if (omitted === 0) return listed

  const summary = `… e mais ${omitted} ${omitted === 1 ? 'nota' : 'notas'}`

  return listed.length === 0 ? summary : `${listed}${ENTRY_SEPARATOR}${summary}`
}

/** Número e série identificam a nota para o tomador; a chave de 44 dígitos só enchia a linha. */
function formatEntry(document: NfseDescriptionDocument): string {
  return `NF-e ${document.number}/${document.series}`
}

function collapseBlanks(value: string): string {
  return value.replace(BLANK_RUN_PATTERN, ' ').trim()
}
