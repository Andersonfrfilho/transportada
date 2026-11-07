/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 (RF1–RF3c, RF7b): o formato único das mensagens do bot ao motorista e ao atendente. Funções puras: o texto
 * de cada mensagem sai daqui, nunca montado à mão no fluxo.
 */

export const STOP_LIST_VISIBLE_LIMIT = 10

/** RF3c: os desfechos curtos que não registram nada. */
export const NOTHING_RECORDED_TEXT = '👍 *Certo, nada foi registrado.*'
export const DISCARDED_TEXT = '↩️ *Descartado.* Nada foi registrado.'

const QUOTE_PREFIX = '> '
const DIRECTIONS_URL_BASE = 'https://www.google.com/maps/dir/?api=1&destination='

export type MessageCoordinate = {
  readonly latitude: number
  readonly longitude: number
}

export type MessageStop = {
  readonly sequence: number
  readonly total: number
  readonly invoiceNumber: string
  /** As outras notas da mesma parada: entram na mesma linha, "NF `a`, `b`". */
  readonly otherInvoiceNumbers?: readonly string[] | undefined
  readonly clientName: string
  readonly contractorName?: string | undefined
  readonly district?: string | undefined
  readonly city?: string | undefined
  readonly address?: string | undefined
  readonly volumes?: string | undefined
  readonly distance?: string | undefined
  readonly duration?: string | undefined
  readonly coordinate?: MessageCoordinate | undefined
}

export type FormatStopBlockParams = {
  readonly stop: MessageStop
  readonly detail: 'list' | 'card'
  readonly header?: string | undefined
  readonly quote?: 'right' | 'off-route' | undefined
}

export type MessageOption = {
  readonly icon: string
  readonly action: string
}

export type SpokenChoice = {
  readonly action: string
}

export type FormatNotUnderstoodParams = {
  readonly reason: string
  readonly options?: readonly MessageOption[] | undefined
}

export function formatDirectionsUrl(coordinate: MessageCoordinate): string {
  return `${DIRECTIONS_URL_BASE}${coordinate.latitude},${coordinate.longitude}`
}

function describeStopPlace(params: FormatStopBlockParams): string | undefined {
  const { stop, detail } = params
  if (detail === 'card') return stop.address
  const place = [stop.district, stop.city].filter((part): part is string => Boolean(part))
  return place.length > 0 ? place.join(', ') : undefined
}

function describeStopTravel(stop: MessageStop): string | undefined {
  const parts = [
    stop.distance ? `📏 *${stop.distance}*` : undefined,
    stop.duration ? `⏱️ _${stop.duration}_` : undefined,
  ].filter((part): part is string => part !== undefined)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function describeStopInvoice(stop: MessageStop): string | undefined {
  if (stop.invoiceNumber === '')
    return stop.clientName === '' ? undefined : `🧾 *${stop.clientName}*`
  const numbers = [stop.invoiceNumber, ...(stop.otherInvoiceNumbers ?? [])]
  const invoice = `🧾 NF ${numbers.map((number) => `\`${number}\``).join(', ')}`
  return stop.clientName === '' ? invoice : `${invoice} · *${stop.clientName}*`
}

function buildStopLines(params: FormatStopBlockParams): string[] {
  const { stop, detail } = params
  const place = describeStopPlace(params)
  const lines: (string | undefined)[] = [
    params.header ?? `*PARADA ${stop.sequence} de ${stop.total}*`,
    describeStopInvoice(stop),
    detail === 'card' && stop.contractorName ? `🏢 Contratante: ${stop.contractorName}` : undefined,
    place ? `📍 ${place}` : undefined,
    detail === 'card' && stop.volumes ? `📦 ${stop.volumes}` : undefined,
    describeStopTravel(stop),
    stop.coordinate ? `🗺️ *Como chegar:* ${formatDirectionsUrl(stop.coordinate)}` : undefined,
  ]
  return lines.filter((line): line is string => line !== undefined)
}

export function formatStopBlock(params: FormatStopBlockParams): string {
  const lines = buildStopLines(params)
  const prefix = params.quote ? QUOTE_PREFIX : ''
  return lines.map((line) => `${prefix}${line}`).join('\n')
}

export function formatOptions(options: readonly MessageOption[]): string {
  return options
    .map((option, index) => `*${index + 1}* - ${option.icon} ${option.action}`)
    .join('\n')
}

export function formatSpokenChoices(choices: readonly SpokenChoice[]): string {
  const spoken = choices.map((choice, index) => `*${index + 1}* para ${choice.action}`)
  const last = spoken.pop()
  if (last === undefined) return ''
  const joined = spoken.length > 0 ? `${spoken.join(', ')} ou ${last}` : last
  return `Responda ${joined}.`
}

export function formatNotUnderstood(params: FormatNotUnderstoodParams): string {
  const head = `🤔 *Não entendi.* ${params.reason}`
  if (!params.options || params.options.length === 0) return head
  return `${head}\n${formatOptions(params.options)}`
}

export function formatNextStep(text: string): string {
  return `➡️ _Próximo passo:_ ${text}`
}

export function formatReplyHint(text: string): string {
  return `_${text}_`
}

function formatDocumentNumbers(numbers: readonly string[]): string {
  const shown = numbers.slice(0, STOP_LIST_VISIBLE_LIMIT).map((number) => `NF \`${number}\``)
  const rest = numbers.length - shown.length
  if (rest > 0) return `${shown.join(', ')} e mais ${rest}`
  const last = shown.pop()
  return shown.length > 0 ? `${shown.join(', ')} e ${last}` : `${last}`
}

/** RF11: a linha da pergunta de encerrar a rota; dos números, até o corte da lista e "e mais K". */
export function formatOpenDocumentsLine(numbers: readonly string[]): string {
  if (numbers.length === 0) return '✅ Todas as notas já estão fechadas.'
  const count = numbers.length === 1 ? '*1 nota em aberto*' : `*${numbers.length} notas em aberto*`
  return `⚠️ Ainda há ${count}: ${formatDocumentNumbers(numbers)}.`
}

/** RF11: o desfecho de encerrar a rota; a nota em aberto fica sem baixa, nunca "volta ao escritório". */
export function formatTripClosed(openNumbers: readonly string[]): string {
  const head = '🏁 *Rota encerrada.*'
  if (openNumbers.length === 0) return head
  return `${head} Ficaram sem baixa: ${formatDocumentNumbers(openNumbers)}.`
}
