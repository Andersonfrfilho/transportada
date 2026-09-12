/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { normalizeTaxId } from '../../shared/tax-id.service.js'
import {
  ISSUANCE_CRITERIA,
  ISSUANCE_FLOW_CONTEXT_KEY as KEY,
  type IssuanceCriterion,
} from './whatsapp-issuance-flow.constant.js'

export type SelectionStep =
  | 'complete'
  | 'criterion'
  | 'date_emitter'
  | 'emitter'
  | 'end_date'
  | 'first_number'
  | 'last_number'
  | 'series'
  | 'start_date'
  | 'trip'

export type SelectionState = Readonly<{
  criterion?: IssuanceCriterion
  emitterKey?: string
  endDate?: string
  firstNumber?: number
  lastNumber?: number
  series?: string
  startDate?: string
  tripId?: string
}>

/** Brasil sem horário de verão desde 2019: o dia de emissão é o de -03:00. */
const BRAZIL_OFFSET = '-03:00'
const DAY_MS = 86_400_000
const DOCUMENT_NUMBER_PATTERN = /^[0-9]{1,9}$/
const BRAZILIAN_DATE_PATTERN = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/
const brazilianDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

/** D4: um parâmetro por mensagem, na ordem da tabela de critérios. */
export function nextSelectionStep(state: SelectionState): SelectionStep {
  switch (state.criterion) {
    case undefined:
    default:
      return 'criterion'
    case 'number_range':
      if (state.emitterKey === undefined) return 'emitter'
      if (state.series === undefined) return 'series'
      if (state.firstNumber === undefined) return 'first_number'
      return state.lastNumber === undefined ? 'last_number' : 'complete'
    case 'trip':
      return state.tripId === undefined ? 'trip' : 'complete'
    case 'issue_date':
      if (state.startDate === undefined) return 'start_date'
      if (state.endDate === undefined) return 'end_date'
      return state.emitterKey === undefined ? 'date_emitter' : 'complete'
    case 'sender':
      return state.emitterKey === undefined ? 'emitter' : 'complete'
  }
}

/** O número da NF-e (`nNF`) tem até nove dígitos e começa em 1. */
export function parseDocumentNumber(text: string): number | undefined {
  const trimmed = text.trim()
  if (!DOCUMENT_NUMBER_PATTERN.test(trimmed)) return undefined
  const value = Number(trimmed)
  return value > 0 ? value : undefined
}

/** `dd/mm/aaaa` → `aaaa-mm-dd`, recusando a data que o calendário não tem (31/02). */
export function parseBrazilianDate(text: string): string | undefined {
  const match = BRAZILIAN_DATE_PATTERN.exec(text.trim())
  if (match === null) return undefined
  const [, day, month, year] = match
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString().slice(0, 10) === iso ? iso : undefined
}

export function formatBrazilianDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** A janela de emissão, com o fim exclusivo: o dia final inteiro entra. */
export function toIssueDateWindow(input: {
  readonly endDate: string
  readonly startDate: string
}): Readonly<{ from: Date; until: Date }> {
  const from = new Date(`${input.startDate}T00:00:00${BRAZIL_OFFSET}`)
  const end = new Date(`${input.endDate}T00:00:00${BRAZIL_OFFSET}`)
  return { from, until: new Date(end.getTime() + DAY_MS) }
}

/** O vencimento conta a partir do dia de hoje em Brasília, não do dia UTC. */
export function resolveDueDate(input: { readonly days: number; readonly now: Date }): string {
  const today = new Date(`${brazilianDay.format(input.now)}T00:00:00.000Z`)
  return new Date(today.getTime() + input.days * DAY_MS).toISOString().slice(0, 10)
}

/** A chave que vai para o id da linha e para o `context`: o documento do emitente nunca vai. */
export function buildEmitterKey(taxId: string): string {
  const digest = createHash('sha256').update(normalizeTaxId(taxId)).digest('hex')
  return `em_${digest.slice(0, 16)}`
}

export function readSelectionState(context: Readonly<Record<string, unknown>>): SelectionState {
  const criterion = context[KEY.criterion]
  if (!isCriterion(criterion)) return {}
  return {
    criterion,
    ...readString(context, KEY.emitterKey, 'emitterKey'),
    ...readString(context, KEY.endDate, 'endDate'),
    ...readNumber(context, KEY.firstNumber, 'firstNumber'),
    ...readNumber(context, KEY.lastNumber, 'lastNumber'),
    ...readString(context, KEY.series, 'series'),
    ...readString(context, KEY.startDate, 'startDate'),
    ...readString(context, KEY.tripId, 'tripId'),
  }
}

function isCriterion(value: unknown): value is IssuanceCriterion {
  return typeof value === 'string' && (ISSUANCE_CRITERIA as readonly string[]).includes(value)
}

function readString<TField extends string>(
  context: Readonly<Record<string, unknown>>,
  key: string,
  field: TField,
): Partial<Record<TField, string>> {
  const value = context[key]
  return typeof value === 'string' ? ({ [field]: value } as Record<TField, string>) : {}
}

function readNumber<TField extends string>(
  context: Readonly<Record<string, unknown>>,
  key: string,
  field: TField,
): Partial<Record<TField, number>> {
  const value = context[key]
  return typeof value === 'number' ? ({ [field]: value } as Record<TField, number>) : {}
}
