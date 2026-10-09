/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TFunction } from 'i18next'

import { formatDeliveryDeadlineDate } from './tripDeliveryDeadlineView.service'
import type { HolidayReason, HolidayWarning } from './trip.types'

const KEY_PREFIX = 'holidayWarning'
const NATIONAL_SCOPE = 'national'
const KNOWN_SCOPES: ReadonlySet<string> = new Set([NATIONAL_SCOPE, 'state', 'municipal'])
/** `code` é o calendário do sistema (nacional): não há de onde dizer "importado" ou "cadastrado". */
const ORIGIN_KEY_BY_ORIGIN: Readonly<Record<string, string>> = {
  imported: 'imported',
  rule: 'typed',
  typed: 'typed',
}
const REASON_SEPARATOR = '; '

type Input = Readonly<{
  language: string
  /** A cidade como a tela a conhece (rótulo da parada); a que a API manda vale mais. */
  placeLabel?: string | undefined
  t: TFunction<'trip'>
  warning: HolidayWarning
}>

function scopeLabel(input: Readonly<{ reason: HolidayReason; t: TFunction<'trip'> }>): string {
  const { reason, t } = input
  return KNOWN_SCOPES.has(reason.scope) ? t(`${KEY_PREFIX}.scope.${reason.scope}`) : reason.scope
}

/** O feriado nacional chega como chave estável (`christmas`): o texto é do locale. */
function reasonName(input: Readonly<{ reason: HolidayReason; t: TFunction<'trip'> }>): string {
  const { reason, t } = input
  if (reason.scope !== NATIONAL_SCOPE) return reason.name
  const key = `${KEY_PREFIX}.national.${reason.name}`
  return t(key, { defaultValue: reason.name })
}

function describeReason(input: Readonly<{ reason: HolidayReason; t: TFunction<'trip'> }>): string {
  const { reason, t } = input
  const originKey = ORIGIN_KEY_BY_ORIGIN[reason.origin]
  return t(`${KEY_PREFIX}.reason`, {
    name: reasonName(input),
    origin:
      originKey === undefined
        ? ''
        : t(`${KEY_PREFIX}.origin`, { origin: t(`${KEY_PREFIX}.originName.${originKey}`) }),
    scope: scopeLabel({ reason, t }),
  })
}

/** O local da frase: o nome que a API mandou, senão o rótulo da tela, senão nenhum — a cidade nunca é inventada. */
function describePlace(input: Input): string {
  const city = input.warning.cityName ?? input.placeLabel
  return city === undefined || city === '' ? '' : input.t(`${KEY_PREFIX}.place`, { city })
}

/**
 * A frase única do aviso, neutra: o dia previsto, o lugar, o escopo, o nome e a origem de cada causa, e o pedido de
 * conferência. Serve à linha da montagem, ao selo do detalhe e ao leitor de tela — nunca diz que algo está
 * bloqueado.
 */
export function buildHolidayWarningText(input: Input): string {
  const { language, t, warning } = input
  return t(`${KEY_PREFIX}.sentence`, {
    date: formatDeliveryDeadlineDate({ language, value: warning.date }),
    place: describePlace(input),
    reasons: warning.reasons.map((reason) => describeReason({ reason, t })).join(REASON_SEPARATOR),
  })
}

/** O rótulo curto do selo: só o dia. */
export function buildHolidayBadgeLabel(input: Pick<Input, 'language' | 't' | 'warning'>): string {
  return input.t(`${KEY_PREFIX}.badge`, {
    date: formatDeliveryDeadlineDate({ language: input.language, value: input.warning.date }),
  })
}
