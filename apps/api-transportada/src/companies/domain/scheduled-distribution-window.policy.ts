/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quando o próximo ciclo do cron acontece. O cron é um processo one-shot agendado pelo Railway,
 * então a API não observa a cadência — ela recebe a expressão por configuração e resolve a
 * próxima ocorrência. Só as formas que o serviço pode realmente ser configurado com são aceitas:
 * uma expressão que a política não sabe resolver derruba o boot em vez de servir uma data
 * inventada para a tela.
 */
const SCHEDULE_FIELD_COUNT = 5
const WILDCARD_FIELD = '*'
const EVERY_MINUTE_FIELD = /^\*$/
const FIXED_MINUTE_FIELD = /^([0-9]|[1-5][0-9])$/
const STEP_MINUTE_FIELD = /^\*\/([1-9]|[1-5][0-9])$/

export class UnsupportedScheduleExpressionError extends Error {
  constructor(cronExpression: string) {
    super(`Unsupported scheduled distribution cadence: ${cronExpression}`)
    this.name = 'UnsupportedScheduleExpressionError'
  }
}

export function isSupportedScheduleExpression(cronExpression: string): boolean {
  return resolveMinuteField(cronExpression) !== undefined
}

export function resolveNextScheduledRunAt(params: {
  readonly cronExpression: string
  readonly from: Date
}): Date {
  const minuteField = resolveMinuteField(params.cronExpression)
  if (minuteField === undefined) {
    throw new UnsupportedScheduleExpressionError(params.cronExpression)
  }

  const next = new Date(params.from.getTime())
  next.setUTCSeconds(0, 0)

  // Zerar os segundos pode ter recuado no tempo: a próxima ocorrência é sempre estritamente à
  // frente do instante perguntado, nunca o próprio instante.
  do {
    next.setUTCMinutes(next.getUTCMinutes() + 1)
  } while (!matchesMinute({ minute: next.getUTCMinutes(), minuteField }))

  return next
}

type MinuteField =
  | { readonly kind: 'every' }
  | { readonly kind: 'fixed'; readonly minute: number }
  | { readonly kind: 'step'; readonly step: number }

function resolveMinuteField(cronExpression: string): MinuteField | undefined {
  const fields = cronExpression.trim().split(/\s+/)
  if (fields.length !== SCHEDULE_FIELD_COUNT) return undefined
  if (fields.slice(1).some((field) => field !== WILDCARD_FIELD)) return undefined

  const [minuteField = ''] = fields
  if (EVERY_MINUTE_FIELD.test(minuteField)) return { kind: 'every' }
  if (FIXED_MINUTE_FIELD.test(minuteField)) {
    return { kind: 'fixed', minute: Number(minuteField) }
  }

  const step = STEP_MINUTE_FIELD.exec(minuteField)?.[1]
  return step === undefined ? undefined : { kind: 'step', step: Number(step) }
}

function matchesMinute(params: {
  readonly minute: number
  readonly minuteField: MinuteField
}): boolean {
  switch (params.minuteField.kind) {
    case 'every':
      return true
    case 'fixed':
      return params.minute === params.minuteField.minute
    case 'step':
      return params.minute % params.minuteField.step === 0
  }
}
