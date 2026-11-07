/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DRIVER_STOP_REMINDER_CHOICE_ACTION as ACTION,
  DRIVER_STOP_REMINDER_IDLE_VARIANT,
  DRIVER_STOP_REMINDER_MAX_POSTPONEMENTS,
  DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME,
  DRIVER_STOP_REMINDER_SPEECH_NODE,
  DRIVER_STOP_REMINDER_STAGE,
} from './driver-stop-reminder.constant.js'
import type { DriverStopReminderStage } from '../../shared/driver-stop-reminder.constant.js'
import type {
  DecideStopReminderPostponementParams,
  DriverStopReminderIdleVariant,
  StopReminderChoiceAction,
  StopReminderMessage,
  StopReminderMessageInput,
  StopReminderPostponementResult,
} from './driver-stop-reminder.types.js'

export type { StopReminderMessageInput } from './driver-stop-reminder.types.js'

const TRUNCATION_MARK = '…'
const MILLISECONDS_PER_DAY = 86_400_000
const ARRIVAL_ACTIONS = [ACTION.ARRIVED, ACTION.DELIVERED, ACTION.OCCURRENCE, ACTION.POSTPONE]
const SETTLEMENT_ACTIONS = [
  ACTION.DELIVERED,
  ACTION.NOT_DELIVERED,
  ACTION.OCCURRENCE,
  ACTION.POSTPONE,
]

const IDLE_START_ACTIONS = [ACTION.DEPARTED, ACTION.CHOOSE_STOP, ACTION.POSTPONE]
const IDLE_ROUTE_ACTIONS = [
  ACTION.DEPARTED,
  ACTION.ARRIVED,
  ACTION.DELIVERED,
  ACTION.OCCURRENCE,
  ACTION.POSTPONE,
]

function pickActions(
  stage: DriverStopReminderStage,
  idleVariant: DriverStopReminderIdleVariant | undefined,
): readonly StopReminderChoiceAction[] {
  if (stage === DRIVER_STOP_REMINDER_STAGE.IDLE) {
    return idleVariant === DRIVER_STOP_REMINDER_IDLE_VARIANT.ROUTE
      ? IDLE_ROUTE_ACTIONS
      : IDLE_START_ACTIONS
  }
  return stage === DRIVER_STOP_REMINDER_STAGE.SETTLEMENT ? SETTLEMENT_ACTIONS : ARRIVAL_ACTIONS
}

function formatLocalTime(moment: Date | undefined, timeZone: string): string {
  if (!moment) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(moment)
}

function formatLocalDay(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(moment)
}

function localDayNumber(moment: Date, timeZone: string): number {
  const [year = 0, month = 1, day = 1] = formatLocalDay(moment, timeZone).split('-').map(Number)
  return Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY
}

/**
 * "às *19:01*", "*ontem* às *19:01*" ou "em *06/11* às *19:01*", no dia local da empresa. Variável montada pelo
 * sistema (já traz a marcação do WhatsApp), para o texto do nó seguir sem literal de data: "Saída {{saidaQuando}}".
 */
function describeLocalMoment(params: {
  readonly moment: Date | undefined
  readonly now: Date
  readonly timeZone: string
}): string {
  const { moment, now, timeZone } = params
  if (!moment) return ''
  const time = `às *${formatLocalTime(moment, timeZone)}*`
  const daysAgo = localDayNumber(now, timeZone) - localDayNumber(moment, timeZone)
  if (daysAgo <= 0) return time
  if (daysAgo === 1) return `*ontem* ${time}`
  const [, month = '', day = ''] = formatLocalDay(moment, timeZone).split('-')
  return `em *${day}/${month}* ${time}`
}

function buildOptions(
  actions: readonly StopReminderChoiceAction[],
): StopReminderMessage['options'] {
  return actions.map((action, index) => ({ choice: String(index + 1), action }))
}

/** A ação da opção numerada (1–4) daquela etapa; `undefined` fora do cardápio da mensagem. */
export function resolveStopReminderChoice(params: {
  readonly stage: DriverStopReminderStage
  readonly idleVariant?: DriverStopReminderIdleVariant | undefined
  readonly choice: number
}): StopReminderChoiceAction | undefined {
  return pickActions(params.stage, params.idleVariant)[params.choice - 1]
}

const WHATSAPP_MARKUP_CHARACTERS = ['*', '_', '~']

/** Corta por pontos de código (nunca no meio de um emoji) e tira a marcação do WhatsApp que ficou sem par. */
function cutBalanced(text: string, maxUnits: number): string {
  let kept = ''
  for (const character of Array.from(text)) {
    if (kept.length + character.length > maxUnits) break
    kept += character
  }
  for (const marker of WHATSAPP_MARKUP_CHARACTERS) {
    if (kept.split(marker).length % 2 === 1) continue
    const last = kept.lastIndexOf(marker)
    kept = `${kept.slice(0, last)}${kept.slice(last + 1)}`
  }
  return kept.trimEnd()
}

/** Tira `excess` caracteres da linha mais longa do bloco (a das NFs) e marca o corte com "…"; as demais linhas ficam. */
export function shortenStopBlock(params: {
  readonly stopBlock: string
  readonly excess: number
}): string {
  const lines = params.stopBlock.split('\n')
  const longest = lines.reduce(
    (best, line, index) => (line.length > (lines[best]?.length ?? 0) ? index : best),
    0,
  )
  const line = lines[longest] ?? ''
  const keep = Math.max(0, line.length - params.excess - TRUNCATION_MARK.length)
  lines[longest] = `${cutBalanced(line, keep)}${TRUNCATION_MARK}`
  return lines.join('\n')
}

/** Teto final: quando encurtar o bloco não bastou, corta o corpo inteiro, ainda por pontos de código. */
export function capStopReminderBody(params: {
  readonly body: string
  readonly limit: number
}): string {
  if (params.body.length <= params.limit) return params.body
  return `${cutBalanced(params.body, params.limit - TRUNCATION_MARK.length)}${TRUNCATION_MARK}`
}

export function buildStopReminderMessage(input: StopReminderMessageInput): StopReminderMessage {
  const base = { nome: input.driverName, blocoParada: input.stopBlock }
  if (input.stage === DRIVER_STOP_REMINDER_STAGE.IDLE) {
    const isRoute = input.idleVariant === DRIVER_STOP_REMINDER_IDLE_VARIANT.ROUTE
    return {
      nodeKey: isRoute
        ? DRIVER_STOP_REMINDER_SPEECH_NODE.idleRoute
        : DRIVER_STOP_REMINDER_SPEECH_NODE.idleStart,
      variables: base,
      options: buildOptions(pickActions(input.stage, input.idleVariant)),
    }
  }
  if (input.stage === DRIVER_STOP_REMINDER_STAGE.SETTLEMENT) {
    return {
      nodeKey: DRIVER_STOP_REMINDER_SPEECH_NODE.settlement,
      variables: {
        ...base,
        chegada: formatLocalTime(input.arrivedAt, input.timeZone),
        chegadaQuando: describeLocalMoment({
          moment: input.arrivedAt,
          now: input.now,
          timeZone: input.timeZone,
        }),
      },
      options: buildOptions(SETTLEMENT_ACTIONS),
    }
  }
  const departure = {
    ...base,
    saida: formatLocalTime(input.departedAt, input.timeZone),
    saidaQuando: describeLocalMoment({
      moment: input.departedAt,
      now: input.now,
      timeZone: input.timeZone,
    }),
  }
  if (!input.isSharedPoint) {
    return {
      nodeKey: DRIVER_STOP_REMINDER_SPEECH_NODE.arrivalWithoutEstimate,
      variables: departure,
      options: buildOptions(ARRIVAL_ACTIONS),
    }
  }
  return {
    nodeKey: DRIVER_STOP_REMINDER_SPEECH_NODE.arrival,
    variables: { ...departure, previsao: formatLocalTime(input.expectedAt, input.timeZone) },
    options: buildOptions(ARRIVAL_ACTIONS),
  }
}

export function decideStopReminderPostponement(
  params: DecideStopReminderPostponementParams,
): StopReminderPostponementResult {
  const { postponements } = params
  if (postponements >= DRIVER_STOP_REMINDER_MAX_POSTPONEMENTS) {
    return {
      outcome: DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME.NO_ANSWER,
      postponements,
      consumesAttempt: true,
    }
  }
  return {
    outcome: DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME.POSTPONED,
    postponements: postponements + 1,
    consumesAttempt: false,
  }
}
