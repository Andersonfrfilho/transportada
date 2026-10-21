/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES_RANGE,
  CONTRACTOR_REPLY_ALERT_MAX_COUNT_RANGE,
  CONTRACTOR_REPLY_WAIT_HOURS_RANGE,
  type ContractorReplyAlertMode,
  type ContractorReplyAttachmentKind,
  type ContractorReplyMode,
  type InformedEmailForwardMode,
  type NoteRecipientForwardMode,
} from './occurrenceContractorReply.constant'
import type { OccurrenceType } from './occurrenceType.types'
import type { OccurrenceTypeEdit } from './occurrenceTypeUpdate.service'

/** Os números ficam como texto no rascunho: apagar o campo para digitar outro valor não pode virar `0`. */
export type ContractorReplyDraft = Readonly<{
  /**
   * Spec 276 T5: a resposta rápida da resposta automática à contratante; `''` é desligada e `undefined` é a API
   * anterior ao campo (o campo nem aparece, e o `PUT` não o manda).
   */
  acknowledgementQuickReplyId: string | undefined
  alertIntervalMinutes: string
  alertMaxCount: string
  alertMode: ContractorReplyAlertMode
  attachmentKind: ContractorReplyAttachmentKind
  driverReplyTemplate: string
  forwardEmailBody: string
  forwardEmailSubject: string
  forwardToInformedEmail: InformedEmailForwardMode
  forwardToNoteRecipient: NoteRecipientForwardMode
  mode: ContractorReplyMode
  /** Spec 276 T3b: entregue ao motorista, a ocorrência fecha sozinha. */
  resolveOnDelivery: boolean
  waitHours: string
}>

export type ContractorReplyProblemCode =
  | 'alertNeedsWaitHours'
  | 'automaticNeedsReply'
  | 'forwardNeedsText'
  | 'intervalOutOfRange'
  | 'maxCountOutOfRange'
  | 'needsContractorMail'
  | 'templateRequired'
  | 'waitHoursOutOfRange'

export type ContractorReplyProblems = Partial<
  Record<
    | 'alertIntervalMinutes'
    | 'alertMaxCount'
    | 'driverReplyTemplate'
    | 'forwardEmailBody'
    | 'forwardEmailSubject'
    | 'forwardToNoteRecipient'
    | 'mode'
    | 'waitHours',
    ContractorReplyProblemCode
  >
>

export function readContractorReplyDraft(type: OccurrenceType): ContractorReplyDraft {
  return {
    acknowledgementQuickReplyId:
      type.contractorReplyAcknowledgementQuickReplyId === undefined
        ? undefined
        : (type.contractorReplyAcknowledgementQuickReplyId ?? ''),
    alertIntervalMinutes: String(type.contractorReplyAlertIntervalMinutes ?? 60),
    alertMaxCount: String(type.contractorReplyAlertMaxCount ?? 24),
    alertMode: type.contractorReplyAlertMode ?? 'off',
    attachmentKind: type.contractorReplyAttachmentKind ?? 'pdf',
    driverReplyTemplate: type.driverReplyTemplate ?? '',
    forwardEmailBody: type.forwardEmailBody ?? '',
    forwardEmailSubject: type.forwardEmailSubject ?? '',
    forwardToInformedEmail: type.forwardToInformedEmail ?? 'off',
    forwardToNoteRecipient: type.forwardToNoteRecipient ?? 'off',
    mode: type.contractorReplyMode ?? 'off',
    resolveOnDelivery: type.contractorReplyResolveOnDelivery ?? false,
    waitHours:
      type.contractorReplyWaitHours === null || type.contractorReplyWaitHours === undefined
        ? ''
        : String(type.contractorReplyWaitHours),
  }
}

function parseInteger(text: string): null | number {
  const trimmed = text.trim()
  if (!/^\d+$/u.test(trimmed)) return null
  return Number(trimmed)
}

function isInRange(value: null | number, range: Readonly<{ max: number; min: number }>): boolean {
  return value !== null && value >= range.min && value <= range.max
}

/** O e-mail ao terceiro só tem texto a escrever quando algum dos dois envios está ligado. */
export function isForwardOn(draft: ContractorReplyDraft): boolean {
  return draft.forwardToNoteRecipient !== 'off' || draft.forwardToInformedEmail !== 'off'
}

/** As mesmas CHECKs do banco (spec 248), ditas no campo antes de o `PUT` voltar `422`. */
export function readContractorReplyProblems(input: {
  draft: ContractorReplyDraft
  emailsContractor: boolean
}): ContractorReplyProblems {
  const { draft, emailsContractor } = input
  const problems: { -readonly [Key in keyof ContractorReplyProblems]: ContractorReplyProblemCode } =
    {}
  const isReplyOn = draft.mode !== 'off'
  const waitHours = parseInteger(draft.waitHours)
  if (isReplyOn && !emailsContractor) problems.mode = 'needsContractorMail'
  if (isReplyOn && draft.driverReplyTemplate.trim() === '')
    problems.driverReplyTemplate = 'templateRequired'
  if (draft.waitHours.trim() !== '' && !isInRange(waitHours, CONTRACTOR_REPLY_WAIT_HOURS_RANGE)) {
    problems.waitHours = 'waitHoursOutOfRange'
  }
  if (draft.alertMode !== 'off' && draft.waitHours.trim() === '')
    problems.waitHours = 'alertNeedsWaitHours'
  if (
    draft.alertMode !== 'off' &&
    !isInRange(
      parseInteger(draft.alertIntervalMinutes),
      CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES_RANGE,
    )
  ) {
    problems.alertIntervalMinutes = 'intervalOutOfRange'
  }
  if (
    draft.alertMode !== 'off' &&
    !isInRange(parseInteger(draft.alertMaxCount), CONTRACTOR_REPLY_ALERT_MAX_COUNT_RANGE)
  ) {
    problems.alertMaxCount = 'maxCountOutOfRange'
  }
  if (draft.forwardToNoteRecipient === 'automatic' && !isReplyOn) {
    problems.forwardToNoteRecipient = 'automaticNeedsReply'
  }
  if (isForwardOn(draft)) {
    if (draft.forwardEmailSubject.trim() === '') problems.forwardEmailSubject = 'forwardNeedsText'
    if (draft.forwardEmailBody.trim() === '') problems.forwardEmailBody = 'forwardNeedsText'
  }
  return problems
}

export function isContractorReplyDraftChanged(
  draft: ContractorReplyDraft,
  saved: ContractorReplyDraft,
): boolean {
  return (Object.keys(draft) as (keyof ContractorReplyDraft)[]).some(
    (key) => draft[key] !== saved[key],
  )
}

/** O `PUT` leva os doze campos de uma vez: a CHECK avalia o conjunto, não cada campo. */
export function buildContractorReplyEdit(draft: ContractorReplyDraft): OccurrenceTypeEdit {
  return {
    ...(draft.acknowledgementQuickReplyId === undefined
      ? {}
      : {
          contractorReplyAcknowledgementQuickReplyId:
            draft.acknowledgementQuickReplyId === '' ? null : draft.acknowledgementQuickReplyId,
        }),
    contractorReplyAlertIntervalMinutes: parseInteger(draft.alertIntervalMinutes) ?? 60,
    contractorReplyAlertMaxCount: parseInteger(draft.alertMaxCount) ?? 24,
    contractorReplyAlertMode: draft.alertMode,
    contractorReplyAttachmentKind: draft.attachmentKind,
    contractorReplyMode: draft.mode,
    contractorReplyResolveOnDelivery: draft.resolveOnDelivery,
    contractorReplyWaitHours: draft.waitHours.trim() === '' ? null : parseInteger(draft.waitHours),
    driverReplyTemplate: draft.driverReplyTemplate,
    forwardEmailBody: draft.forwardEmailBody,
    forwardEmailSubject: draft.forwardEmailSubject,
    forwardToInformedEmail: draft.forwardToInformedEmail,
    forwardToNoteRecipient: draft.forwardToNoteRecipient,
  }
}

export function hasContractorReplyProblems(problems: ContractorReplyProblems): boolean {
  return Object.keys(problems).length > 0
}

const ACKNOWLEDGEMENT_LABEL_MAX_LENGTH = 60

export type AcknowledgementOption = Readonly<{
  /** `off` é "Desligada"; `inactive` é a escolhida que saiu da lista (desativada depois de escolhida). */
  kind: 'inactive' | 'off' | 'quickReply'
  label: string
  value: string
}>

function shortenQuickReplyText(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= ACKNOWLEDGEMENT_LABEL_MAX_LENGTH
    ? flat
    : `${flat.slice(0, ACKNOWLEDGEMENT_LABEL_MAX_LENGTH - 1)}…`
}

/**
 * Spec 276 T5: "Desligada" primeiro, depois as respostas rápidas ativas da contratante, na ordem do cadastro. A
 * escolhida que não está mais na lista continua visível (a API recusa salvar uma inativa, mas a gravada antes fica).
 */
export function buildAcknowledgementOptions(input: {
  quickReplies: readonly Readonly<{ active: boolean; audience: string; id: string; text: string }>[]
  selectedId: string
}): readonly AcknowledgementOption[] {
  const usable = input.quickReplies.filter(
    (quickReply) => quickReply.active && quickReply.audience === 'contractor',
  )
  const options: AcknowledgementOption[] = [
    { kind: 'off', label: '', value: '' },
    ...usable.map((quickReply) => ({
      kind: 'quickReply' as const,
      label: shortenQuickReplyText(quickReply.text),
      value: quickReply.id,
    })),
  ]
  if (input.selectedId !== '' && !usable.some((quickReply) => quickReply.id === input.selectedId)) {
    options.push({ kind: 'inactive', label: '', value: input.selectedId })
  }
  return options
}
