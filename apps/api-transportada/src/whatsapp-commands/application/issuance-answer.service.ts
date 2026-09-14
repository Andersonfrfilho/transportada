/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 (D8) — o único texto livre que vira estado é o parâmetro pedido, validado na hora.
 * Resposta de lista é conferida contra a lista **relida**: id que não foi oferecido é recusado.
 */
import { WHATSAPP_COMMAND_PERIOD_MAX_LENGTH } from '../../database/whatsapp-command.schema.js'
import {
  buildEmitterKey,
  formatBrazilianDate,
  parseBrazilianDate,
  parseDocumentNumber,
  type SelectionState,
} from '../domain/document-selection.policy.js'
import {
  ISSUANCE_DUE_DAYS_OPTIONS,
  ISSUANCE_FLOW_CONTEXT_KEY as KEY,
  ISSUANCE_PERIOD_SKIP_ANSWER,
} from '../domain/whatsapp-issuance-flow.constant.js'
import {
  type IssuanceFlowActionDependencies,
  listEmittersFor,
  resolveEmitterTaxId,
  tripWindowStart,
} from './issuance-flow-context.service.js'

export type IssuanceAnswerVerdict =
  | Readonly<{ kind: 'accepted'; patch: Record<string, unknown> }>
  | Readonly<{ kind: 'rejected'; message: string }>

type AnswerInput = Readonly<{
  answer: string
  companyId: string
  deps: IssuanceFlowActionDependencies
  state: SelectionState
  step: string
}>

const CHOOSE_FROM_LIST = 'Toque numa das opções da lista.'
const INVALID_NUMBER = 'Digite só o número da nota, como 1200.'
const INVALID_DATE = 'Data inválida. Use dd/mm/aaaa, como 01/09/2026.'

export async function acceptIssuanceAnswer(input: AnswerInput): Promise<IssuanceAnswerVerdict> {
  switch (input.step) {
    case 'emitter':
    case 'date_emitter':
      return acceptEmitter(input)
    case 'series':
      return acceptSeries(input)
    case 'first_number':
      return acceptFirstNumber(input.answer)
    case 'last_number':
      return acceptLastNumber(input.answer, input.state)
    case 'trip':
      return acceptTrip(input)
    case 'start_date':
      return acceptStartDate(input.answer)
    case 'end_date':
      return acceptEndDate(input.answer, input.state)
    case 'due_date':
      return acceptDueDays(input.answer)
    case 'period':
      return acceptPeriod(input.answer)
    default:
      return rejected(CHOOSE_FROM_LIST)
  }
}

async function acceptEmitter(input: AnswerInput): Promise<IssuanceAnswerVerdict> {
  const emitters = await listEmittersFor(input.deps, input.companyId, input.state)
  const offered = emitters.some((emitter) => buildEmitterKey(emitter.taxId) === input.answer)
  return offered ? accepted({ [KEY.emitterKey]: input.answer }) : rejected(CHOOSE_FROM_LIST)
}

async function acceptSeries(input: AnswerInput): Promise<IssuanceAnswerVerdict> {
  const emitterTaxId = await resolveEmitterTaxId(input.deps, input.companyId, input.state)
  if (emitterTaxId === undefined) return rejected(CHOOSE_FROM_LIST)
  const series = await input.deps.listPendingSeries({ companyId: input.companyId, emitterTaxId })
  return series.includes(input.answer)
    ? accepted({ [KEY.series]: input.answer })
    : rejected(CHOOSE_FROM_LIST)
}

async function acceptTrip(input: AnswerInput): Promise<IssuanceAnswerVerdict> {
  const trips = await input.deps.listRecentTrips({
    companyId: input.companyId,
    since: tripWindowStart(input.deps),
  })
  return trips.some((trip) => trip.id === input.answer)
    ? accepted({ [KEY.tripId]: input.answer })
    : rejected(CHOOSE_FROM_LIST)
}

function acceptFirstNumber(answer: string): IssuanceAnswerVerdict {
  const number = parseDocumentNumber(answer)
  return number === undefined ? rejected(INVALID_NUMBER) : accepted({ [KEY.firstNumber]: number })
}

function acceptLastNumber(answer: string, state: SelectionState): IssuanceAnswerVerdict {
  const number = parseDocumentNumber(answer)
  if (number === undefined) return rejected(INVALID_NUMBER)
  if (state.firstNumber !== undefined && number < state.firstNumber) {
    return rejected(`O número final precisa ser igual ou maior que ${state.firstNumber}.`)
  }
  return accepted({ [KEY.lastNumber]: number })
}

function acceptStartDate(answer: string): IssuanceAnswerVerdict {
  const date = parseBrazilianDate(answer)
  return date === undefined ? rejected(INVALID_DATE) : accepted({ [KEY.startDate]: date })
}

function acceptEndDate(answer: string, state: SelectionState): IssuanceAnswerVerdict {
  const date = parseBrazilianDate(answer)
  if (date === undefined) return rejected(INVALID_DATE)
  if (state.startDate !== undefined && date < state.startDate) {
    return rejected(
      `A data final precisa ser igual ou posterior a ${formatBrazilianDate(state.startDate)}.`,
    )
  }
  return accepted({ [KEY.endDate]: date })
}

function acceptDueDays(answer: string): IssuanceAnswerVerdict {
  const days = ISSUANCE_DUE_DAYS_OPTIONS.find((option) => String(option) === answer)
  return days === undefined ? rejected(CHOOSE_FROM_LIST) : accepted({ [KEY.dueDays]: days })
}

/** "Pular" grava em branco, que a prévia omite — o mesmo que o campo vazio na tela. */
function acceptPeriod(answer: string): IssuanceAnswerVerdict {
  if (answer === ISSUANCE_PERIOD_SKIP_ANSWER) return accepted({ [KEY.period]: '' })
  const period = answer.trim()
  if (period.length > WHATSAPP_COMMAND_PERIOD_MAX_LENGTH) {
    return rejected(
      `O período passa de ${WHATSAPP_COMMAND_PERIOD_MAX_LENGTH} caracteres. Digite de novo, ou toque em Pular.`,
    )
  }
  return accepted({ [KEY.period]: period })
}

function accepted(patch: Record<string, unknown>): IssuanceAnswerVerdict {
  return { kind: 'accepted', patch }
}

function rejected(message: string): IssuanceAnswerVerdict {
  return { kind: 'rejected', message }
}
