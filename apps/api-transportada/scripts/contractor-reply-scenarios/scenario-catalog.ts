/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: the seven manual test scenarios of the contractor reply. Each one is one occurrence type and
 * one or more notes; the roteiro (`specs/248-*\/roteiro-de-teste.md`) names them by the same titles.
 */
import {
  ALERT_INTERVAL_MINUTES,
  ALERT_MAX_COUNT,
  CONTENT_TYPE,
  REPLY_MODE,
  SCENARIO_MAIL_DOMAIN,
} from './scenario.constant.js'
import { applyReply, markReplyOverdue, openReply, receiveReply } from './scenario-reply.js'
import {
  createOccurrenceType,
  registerOccurrence,
  scenarioTypeName,
  seedNote,
} from './scenario-fixtures.js'
import type { OccurrenceTypeInput, ScenarioContext } from './scenario-fixtures.js'

type ReplyBehaviour =
  | { readonly kind: 'overdue' }
  | { readonly contentTypes: readonly string[]; readonly kind: 'answered' }

type NoteDefinition = {
  readonly behaviour: ReplyBehaviour
  readonly hasDriverAccount: boolean
  readonly recipientEmail?: string
}

export type ScenarioDefinition = {
  readonly notes: readonly NoteDefinition[]
  readonly shows: string
  readonly type: OccurrenceTypeInput
}

const ONE_PDF = [CONTENT_TYPE.pdf]
const withApproval = {
  alertMode: 'alert_operator',
  forwardToNoteRecipient: 'off',
  mode: REPLY_MODE.afterApproval,
} as const
const automatic = {
  alertMode: 'off',
  forwardToNoteRecipient: 'off',
  mode: REPLY_MODE.automatic,
} as const

export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    notes: [{ behaviour: { contentTypes: ONE_PDF, kind: 'answered' }, hasDriverAccount: true }],
    shows:
      'retorno em awaiting_operator: a contratante respondeu com PDF e o operador ainda não enviou',
    type: { ...withApproval, name: scenarioTypeName('com aprovação') },
  },
  {
    notes: [{ behaviour: { contentTypes: ONE_PDF, kind: 'answered' }, hasDriverAccount: true }],
    shows: 'retorno em delivered: o boleto já foi ao chat do motorista sozinho',
    type: { ...automatic, name: scenarioTypeName('automático') },
  },
  {
    notes: [{ behaviour: { kind: 'overdue' }, hasDriverAccount: true }],
    shows: 'retorno em overdue: prazo vencido há 3 h, 2 alertas já enviados, sem resposta',
    type: { ...withApproval, name: scenarioTypeName('prazo vencido') },
  },
  {
    notes: [
      {
        behaviour: { contentTypes: [CONTENT_TYPE.jpeg], kind: 'answered' },
        hasDriverAccount: true,
      },
    ],
    shows: 'retorno em needs_operator (no_accepted_attachment): a resposta veio só com foto',
    type: { ...automatic, name: scenarioTypeName('resposta sem PDF') },
  },
  {
    notes: [
      {
        behaviour: { contentTypes: [CONTENT_TYPE.pdf, CONTENT_TYPE.pdf], kind: 'answered' },
        hasDriverAccount: true,
      },
    ],
    shows: 'retorno em needs_operator (multiple_attachments): a resposta veio com dois PDFs',
    type: { ...automatic, name: scenarioTypeName('dois PDFs') },
  },
  {
    notes: [
      {
        behaviour: { contentTypes: ONE_PDF, kind: 'answered' },
        hasDriverAccount: true,
        recipientEmail: `cliente@${SCENARIO_MAIL_DOMAIN}`,
      },
      { behaviour: { contentTypes: ONE_PDF, kind: 'answered' }, hasDriverAccount: true },
    ],
    shows: 'duas notas em awaiting_operator: a primeira com e-mail do destinatário, a segunda sem',
    type: {
      ...withApproval,
      forwardToNoteRecipient: 'manual',
      name: scenarioTypeName('envia ao cliente da nota'),
    },
  },
  {
    notes: [{ behaviour: { contentTypes: ONE_PDF, kind: 'answered' }, hasDriverAccount: false }],
    shows:
      'retorno em reply_received com entrega pulada (driver_without_account): motorista sem conta',
    type: { ...automatic, name: scenarioTypeName('motorista sem conta') },
  },
]

async function seedReply(
  context: ScenarioContext,
  input: { readonly behaviour: ReplyBehaviour; readonly occurrenceId: string },
): Promise<void> {
  const opened = await openReply(context, input.occurrenceId)
  if (input.behaviour.kind === 'overdue') {
    await markReplyOverdue(context, opened.replyId)
    return
  }
  const messageId = await receiveReply(context, {
    contentTypes: input.behaviour.contentTypes,
    conversationId: opened.conversationId,
  })
  await applyReply(context, { conversationId: opened.conversationId, messageId })
}

/** Creates the type and every note of the scenario; returns how many occurrences it opened. */
export async function seedScenario(
  context: ScenarioContext,
  definition: ScenarioDefinition,
  firstSequence: number,
): Promise<number> {
  const typeId = await createOccurrenceType(context, definition.type, {
    alertIntervalMinutes: ALERT_INTERVAL_MINUTES,
    alertMaxCount: ALERT_MAX_COUNT,
  })
  for (const [index, note] of definition.notes.entries()) {
    const seeded = await seedNote(context, {
      hasDriverAccount: note.hasDriverAccount,
      sequence: firstSequence + index,
      ...(note.recipientEmail === undefined ? {} : { recipientEmail: note.recipientEmail }),
    })
    const occurrenceId = await registerOccurrence(context, {
      note: seeded,
      typeId,
      typeName: definition.type.name,
    })
    await seedReply(context, { behaviour: note.behaviour, occurrenceId })
  }
  return definition.notes.length
}
