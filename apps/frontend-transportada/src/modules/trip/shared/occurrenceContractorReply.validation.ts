/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CLIENT_CHANNELS,
  CLIENT_EMAIL_SEND_MODES,
  CLIENT_RETURN_CHANNELS,
  CLIENT_RETURN_SEND_MODES,
  CLIENT_EMAIL_TYPES,
  CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES_RANGE,
  CONTRACTOR_REPLY_ALERT_MAX_COUNT_RANGE,
  CONTRACTOR_REPLY_ALERT_MODES,
  CONTRACTOR_REPLY_ATTACHMENT_KINDS,
  CONTRACTOR_REPLY_MODES,
  DUPLICATE_REQUEST_POLICIES,
  CONTRACTOR_REPLY_WAIT_HOURS_RANGE,
  DRIVER_REPLY_CHANNELS,
  DRIVER_REPLY_WINDOW_CLOSED_ACTIONS,
  INFORMED_EMAIL_FORWARD_MODES,
  NOTE_RECIPIENT_FORWARD_MODES,
} from './occurrenceContractorReply.constant'
import { isOneOf, isRecord, isString } from './tripGuards.validation'

type FieldCheck = (value: unknown) => boolean
type IntegerRange = Readonly<{ min: number; max: number }>

function isIntegerInRange(value: unknown, range: IntegerRange): boolean {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max
  )
}

function allowingNull(check: FieldCheck): FieldCheck {
  return (value) => value === null || check(value)
}

function isClientReturnSetting(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    isOneOf(value.sendMode, CLIENT_RETURN_SEND_MODES) &&
    (value.templateKey === null || isString(value.templateKey))
  )
}

/** Spec 286 (RF2): a matriz traz os dois canais, cada um inteiro; qualquer outra forma reprova o tipo. */
function isClientReturnMatrix(value: unknown): boolean {
  return (
    isRecord(value) &&
    CLIENT_RETURN_CHANNELS.every((channel) => isClientReturnSetting(value[channel]))
  )
}

const TYPE_FIELD_CHECKS = {
  /** Spec 286 (RF2): a matriz por canal, ou `null` (API sem a matriz resolvida). Aceita antes da API mandar. */
  clientChannels: allowingNull(isClientReturnMatrix),
  /** Spec 279 RF9: `off` ou o tipo de e-mail do cliente. Aceito antes da API mandar. */
  clientEmailType: (value: unknown) => isOneOf(value, CLIENT_EMAIL_TYPES),
  /** Spec 279 RF10: `manual` ou `automatic`. Aceito antes da API mandar. */
  clientEmailSendMode: (value: unknown) => isOneOf(value, CLIENT_EMAIL_SEND_MODES),
  /** Spec 281 RF8: `off`, `email`, `whatsapp` ou `both`. Aceito antes da API mandar. */
  clientChannel: (value: unknown) => isOneOf(value, CLIENT_CHANNELS),
  /** Spec 281 T8b: o pedido de contato na abertura é ligado ou desligado. Aceito antes da API mandar. */
  asksClientContact: (value: unknown) => typeof value === 'boolean',
  /** O campo opcional "nova data de vencimento" no app do motorista. Aceito antes da API mandar. */
  asksNewDueDate: (value: unknown) => typeof value === 'boolean',
  /** Spec 276 T5: o id da resposta rápida da resposta automática, ou `null`. Aceito antes da API mandar. */
  contractorReplyAcknowledgementQuickReplyId: allowingNull(isString),
  contractorReplyAlertMaxCount: (value: unknown) =>
    isIntegerInRange(value, CONTRACTOR_REPLY_ALERT_MAX_COUNT_RANGE),
  contractorReplyAlertIntervalMinutes: (value: unknown) =>
    isIntegerInRange(value, CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES_RANGE),
  contractorReplyAlertMode: (value: unknown) => isOneOf(value, CONTRACTOR_REPLY_ALERT_MODES),
  contractorReplyAttachmentKind: (value: unknown) =>
    isOneOf(value, CONTRACTOR_REPLY_ATTACHMENT_KINDS),
  contractorReplyMode: (value: unknown) => isOneOf(value, CONTRACTOR_REPLY_MODES),
  /** Spec 276 T3b: fechar a ocorrência sozinha depois de entregar ao motorista. Aceito antes da API mandar. */
  contractorReplyResolveOnDelivery: (value: unknown) => typeof value === 'boolean',
  contractorReplyWaitHours: allowingNull((value: unknown) =>
    isIntegerInRange(value, CONTRACTOR_REPLY_WAIT_HOURS_RANGE),
  ),
  driverReplyChannel: (value: unknown) => isOneOf(value, DRIVER_REPLY_CHANNELS),
  /** Spec 276 T4: a trava de pedido repetido. Aceita antes da API mandar. */
  duplicateRequestPolicy: (value: unknown) => isOneOf(value, DUPLICATE_REQUEST_POLICIES),
  /** A trava de motorista do tipo, em minutos (1 a 10080) ou `null`. Aceita antes da API mandar. */
  driverLockMinutes: allowingNull((value: unknown) =>
    isIntegerInRange(value, { max: 10_080, min: 1 }),
  ),
  driverReplyTemplate: isString,
  driverReplyWindowClosedAction: (value: unknown) =>
    isOneOf(value, DRIVER_REPLY_WINDOW_CLOSED_ACTIONS),
  forwardEmailBody: isString,
  forwardEmailSubject: isString,
  forwardToInformedEmail: (value: unknown) => isOneOf(value, INFORMED_EMAIL_FORWARD_MODES),
  forwardToNoteRecipient: (value: unknown) => isOneOf(value, NOTE_RECIPIENT_FORWARD_MODES),
}

const CONTRACTOR_OVERRIDE_FIELD_CHECKS = {
  contractorReplyMode: allowingNull(TYPE_FIELD_CHECKS.contractorReplyMode),
  contractorReplyWaitHours: TYPE_FIELD_CHECKS.contractorReplyWaitHours,
  forwardToNoteRecipient: allowingNull(TYPE_FIELD_CHECKS.forwardToNoteRecipient),
}

export const CONTRACTOR_REPLY_TYPE_KEYS: readonly string[] = Object.keys(TYPE_FIELD_CHECKS)

export const CONTRACTOR_REPLY_OVERRIDE_KEYS: readonly string[] = Object.keys(
  CONTRACTOR_OVERRIDE_FIELD_CHECKS,
)

function hasValidFieldsBy(
  value: Record<string, unknown>,
  checks: Readonly<Record<string, FieldCheck>>,
): boolean {
  return Object.entries(checks).every(
    ([key, check]) => value[key] === undefined || check(value[key]),
  )
}

/** Ausentes são API anterior ao campo; presentes, só no vocabulário e na faixa. */
export function hasValidContractorReplyTypeFields(value: Record<string, unknown>): boolean {
  return hasValidFieldsBy(value, TYPE_FIELD_CHECKS)
}

/** Na exceção, nulo herda do tipo, campo a campo. */
export function hasValidContractorOverrideReplyFields(value: Record<string, unknown>): boolean {
  return hasValidFieldsBy(value, CONTRACTOR_OVERRIDE_FIELD_CHECKS)
}

/** O formato interno do retorno ainda não é lido pelo painel: só se confere que é objeto. */
export function hasValidContractorReplyObject(value: unknown): boolean {
  return value === undefined || value === null || isRecord(value)
}
