/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RegisterCargoArrivalInput } from './cargoArrival.types'
import {
  formatLocalDate,
  formatLocalTime,
  isValidTime,
  resolveArrivalMoment,
} from './cargoArrivalTime.service'
import { CARGO_ARRIVAL_LIMITS } from './cargoReceiving.constant'

export type ArrivalDraft = Readonly<{
  contractorId: string
  date: string
  palletCount: string
  reference: string
  time: string
}>

export type CargoFormIssue = Readonly<{ code: string; max?: number; min?: number }>

export type ArrivalFieldName =
  | 'arrivedAt'
  | 'contractorId'
  | 'documents'
  | 'palletCount'
  | 'reference'

export type ArrivalFormIssues = Partial<Record<ArrivalFieldName, CargoFormIssue>>

const INTEGER_PATTERN = /^\d+$/u

/** Data e hora de agora, no fuso do navegador: é o padrão de quem registra a chegada do caminhão. */
export function createArrivalDraft(now: Date): ArrivalDraft {
  return {
    contractorId: '',
    date: formatLocalDate(now),
    palletCount: '',
    reference: '',
    time: formatLocalTime(now),
  }
}

function validateArrivedAt(
  input: Readonly<{ draft: ArrivalDraft; now: Date }>,
): CargoFormIssue | undefined {
  const { date, time } = input.draft
  if (date === '' || time === '') return { code: 'required' }
  if (!isValidTime(time)) return { code: 'invalidTime' }
  const moment = resolveArrivalMoment({ date, time })
  if (moment === undefined) return { code: 'required' }
  const isFuture = moment.getTime() - input.now.getTime() > CARGO_ARRIVAL_LIMITS.futureToleranceMs
  return isFuture ? { code: 'future' } : undefined
}

function validatePalletCount(value: string): CargoFormIssue | undefined {
  const typed = value.trim()
  if (typed === '') return undefined
  const range = { max: CARGO_ARRIVAL_LIMITS.palletCountMax, min: 0 }
  if (!INTEGER_PATTERN.test(typed)) return { code: 'integer', ...range }
  return Number(typed) > CARGO_ARRIVAL_LIMITS.palletCountMax
    ? { code: 'integer', ...range }
    : undefined
}

function validateReference(value: string): CargoFormIssue | undefined {
  const max = CARGO_ARRIVAL_LIMITS.referenceMaxLength
  return value.trim().length > max ? { code: 'tooLong', max } : undefined
}

function validateDocumentCount(count: number): CargoFormIssue | undefined {
  const max = CARGO_ARRIVAL_LIMITS.documentsPerRequest
  if (count < 1) return { code: 'noDocuments' }
  return count > max ? { code: 'tooMany', max } : undefined
}

/** As mesmas faixas do servidor (`cargo-arrival.schema.ts`), todas de uma vez — nunca só a primeira. */
export function validateArrivalDraft(
  input: Readonly<{ documentCount: number; draft: ArrivalDraft; now: Date }>,
): ArrivalFormIssues {
  const entries: readonly (readonly [ArrivalFieldName, CargoFormIssue | undefined])[] = [
    ['contractorId', input.draft.contractorId === '' ? { code: 'required' } : undefined],
    ['arrivedAt', validateArrivedAt(input)],
    ['palletCount', validatePalletCount(input.draft.palletCount)],
    ['reference', validateReference(input.draft.reference)],
    ['documents', validateDocumentCount(input.documentCount)],
  ]
  return Object.fromEntries(entries.filter(([, issue]) => issue !== undefined))
}

/**
 * Só se monta depois de `validateArrivalDraft` sem problema. Paletes e referência em branco ficam de
 * fora: para a API, ausente é diferente de zero ou de texto vazio.
 */
export function toRegisterArrivalInput(
  input: Readonly<{ documentIds: readonly string[]; draft: ArrivalDraft }>,
): RegisterCargoArrivalInput {
  const { draft } = input
  const moment = resolveArrivalMoment({ date: draft.date, time: draft.time })
  if (moment === undefined) throw new Error('ARRIVAL_DRAFT_NOT_VALIDATED')
  const reference = draft.reference.trim()
  const palletCount = draft.palletCount.trim()
  return {
    arrivedAt: moment.toISOString(),
    contractorId: draft.contractorId,
    documentIds: input.documentIds,
    ...(palletCount === '' ? {} : { palletCount: Number(palletCount) }),
    ...(reference === '' ? {} : { reference }),
  }
}

/** A rota é texto livre do operador, de 1 a 40; em branco limpa a rota das notas (o servidor aceita `null`). */
export function validateRouteName(value: string): CargoFormIssue | undefined {
  const max = CARGO_ARRIVAL_LIMITS.routeNameMaxLength
  return value.trim().length > max ? { code: 'tooLong', max } : undefined
}
