/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 * ⚠️ The same file, byte for byte, lives in the API and in the worker (no app imports another): the
 * parity contract of the worker (`contractor-reply-parity.contract.ts`) holds both copies equal.
 *
 * Spec 248 CA03: the table of `decideContractorReply` (RF4) and `decideAlert` (RF5).
 */
import { describe, expect, test } from 'bun:test'

import {
  decideAlert,
  decideContractorReply,
  type ContractorReplyAlertInput,
  type ContractorReplyDecision,
  type ContractorReplyDecisionInput,
} from '../../src/occurrence-conversation/domain/contractor-reply.policy.js'
import {
  CONTRACTOR_REPLY_STATUSES,
  type ContractorReplyStatus,
} from '../../src/shared/occurrence-contractor-reply.constant.js'

const PDF = { contentType: 'application/pdf', id: 'attachment-pdf' }
const SECOND_PDF = { contentType: 'application/pdf', id: 'attachment-second-pdf' }
const PNG = { contentType: 'image/png', id: 'attachment-png' }
const SPREADSHEET = {
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  id: 'attachment-spreadsheet',
}

type ReplyConfig = ContractorReplyDecisionInput['reply']['config']

const AUTOMATIC_PDF: ReplyConfig = { attachmentKind: 'pdf', mode: 'forward_automatic' }
const APPROVAL_PDF: ReplyConfig = { attachmentKind: 'pdf', mode: 'forward_after_approval' }
const AUTOMATIC_PDF_OR_IMAGE: ReplyConfig = {
  attachmentKind: 'pdf_or_image',
  mode: 'forward_automatic',
}

function decide(
  status: ContractorReplyStatus,
  config: ReplyConfig,
  attachments: ContractorReplyDecisionInput['attachments'],
): ContractorReplyDecision {
  return decideContractorReply({ attachments, reply: { config, status } })
}

type DecisionCase = {
  readonly attachments: ContractorReplyDecisionInput['attachments']
  readonly config: ReplyConfig
  readonly expected: ContractorReplyDecision
  readonly name: string
  readonly status: ContractorReplyStatus
}

const NEEDS_NO_ATTACHMENT: ContractorReplyDecision = {
  kind: 'needs_operator',
  reason: 'no_accepted_attachment',
}
const NEEDS_MULTIPLE: ContractorReplyDecision = {
  kind: 'needs_operator',
  reason: 'multiple_attachments',
}

const OPEN_STATUS_CASES: readonly DecisionCase[] = [
  {
    attachments: [],
    config: AUTOMATIC_PDF,
    expected: NEEDS_NO_ATTACHMENT,
    name: '0 attachments',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PDF],
    config: AUTOMATIC_PDF,
    expected: { attachmentId: PDF.id, kind: 'accept', nextStep: 'deliver' },
    name: '1 pdf, automatic',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PDF],
    config: AUTOMATIC_PDF,
    expected: { attachmentId: PDF.id, kind: 'accept', nextStep: 'deliver' },
    name: '1 pdf, already overdue',
    status: 'overdue',
  },
  {
    attachments: [PDF],
    config: APPROVAL_PDF,
    expected: { attachmentId: PDF.id, kind: 'accept', nextStep: 'await_operator' },
    name: '1 pdf, after approval',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PDF, SECOND_PDF],
    config: AUTOMATIC_PDF,
    expected: NEEDS_MULTIPLE,
    name: '2 pdfs',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PDF, SECOND_PDF, PNG],
    config: AUTOMATIC_PDF,
    expected: NEEDS_MULTIPLE,
    name: 'N attachments with 2 pdfs among them',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PNG],
    config: AUTOMATIC_PDF,
    expected: NEEDS_NO_ATTACHMENT,
    name: 'only an image when the type wants pdf',
    status: 'awaiting_contractor',
  },
  {
    attachments: [SPREADSHEET],
    config: AUTOMATIC_PDF_OR_IMAGE,
    expected: NEEDS_NO_ATTACHMENT,
    name: 'only a spreadsheet, never accepted',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PDF, PNG],
    config: AUTOMATIC_PDF,
    expected: { attachmentId: PDF.id, kind: 'accept', nextStep: 'deliver' },
    name: 'pdf plus a signature image when the type wants pdf: the image does not count',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PNG],
    config: AUTOMATIC_PDF_OR_IMAGE,
    expected: { attachmentId: PNG.id, kind: 'accept', nextStep: 'deliver' },
    name: '1 image when the type accepts pdf or image',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PDF, PNG],
    config: AUTOMATIC_PDF_OR_IMAGE,
    expected: NEEDS_MULTIPLE,
    name: 'pdf and image when the type accepts both',
    status: 'awaiting_contractor',
  },
  {
    attachments: [PDF],
    config: { attachmentKind: 'pdf', mode: 'off' },
    expected: { kind: 'ignore', reason: 'mode_off' },
    name: 'mode off',
    status: 'awaiting_contractor',
  },
]

const CLOSED_STATUS_CASES: readonly DecisionCase[] = [
  {
    attachments: [PDF],
    config: AUTOMATIC_PDF,
    expected: { kind: 'ignore', reason: 'already_delivered' },
    name: 'already delivered',
    status: 'delivered',
  },
  {
    attachments: [PDF],
    config: AUTOMATIC_PDF,
    expected: { kind: 'ignore', reason: 'cancelled' },
    name: 'cancelled',
    status: 'cancelled',
  },
  {
    attachments: [PDF],
    config: AUTOMATIC_PDF,
    expected: { kind: 'ignore', reason: 'handled' },
    name: 'handled',
    status: 'handled',
  },
  {
    attachments: [PDF],
    config: AUTOMATIC_PDF,
    expected: { kind: 'ignore', reason: 'already_answered' },
    name: 'reply already received',
    status: 'reply_received',
  },
  {
    attachments: [PDF],
    config: AUTOMATIC_PDF,
    expected: { kind: 'ignore', reason: 'already_answered' },
    name: 'already waiting for the operator',
    status: 'awaiting_operator',
  },
  {
    attachments: [],
    config: AUTOMATIC_PDF,
    expected: { kind: 'ignore', reason: 'already_answered' },
    name: 'already needs the operator, no new alert for a message without attachment',
    status: 'needs_operator',
  },
  {
    attachments: [PDF, SECOND_PDF],
    config: AUTOMATIC_PDF,
    expected: { kind: 'ignore', reason: 'cancelled' },
    name: 'cancelled, even with 2 pdfs',
    status: 'cancelled',
  },
]

describe('decideContractorReply (spec 248 RF4, CA03)', () => {
  for (const { attachments, config, expected, name, status } of [
    ...OPEN_STATUS_CASES,
    ...CLOSED_STATUS_CASES,
  ]) {
    test(`${status}: ${name}`, () => {
      expect(decide(status, config, attachments)).toEqual(expected)
    })
  }

  test('only the waiting statuses can accept a reply', () => {
    const accepting = CONTRACTOR_REPLY_STATUSES.filter(
      (status) => decide(status, AUTOMATIC_PDF, [PDF]).kind === 'accept',
    )

    expect(accepting).toEqual(['awaiting_contractor', 'overdue'])
  })

  test('the type is decided by the bytes the attachment carries, never by the file name', () => {
    const namedPdfButPng = { contentType: 'image/png', fileName: 'boleto.pdf', id: 'a-1' }
    const namedPngButPdf = { contentType: 'application/pdf', fileName: 'foto.png', id: 'a-2' }
    const namedPdfButExecutable = {
      contentType: 'application/octet-stream',
      fileName: 'boleto.pdf',
      id: 'a-3',
    }

    expect(decide('awaiting_contractor', AUTOMATIC_PDF, [namedPdfButPng])).toEqual(
      NEEDS_NO_ATTACHMENT,
    )
    expect(decide('awaiting_contractor', AUTOMATIC_PDF, [namedPngButPdf])).toEqual({
      attachmentId: 'a-2',
      kind: 'accept',
      nextStep: 'deliver',
    })
    expect(decide('awaiting_contractor', AUTOMATIC_PDF, [namedPdfButExecutable])).toEqual(
      NEEDS_NO_ATTACHMENT,
    )
  })

  test('the copy of the reply decides, not the type as it is today', () => {
    const typeReconfiguredLater = {
      type: { attachmentKind: 'pdf_or_image', contractorReplyMode: 'off' },
    }
    const input = Object.assign(
      {
        attachments: [PNG],
        reply: { config: AUTOMATIC_PDF_OR_IMAGE, status: 'awaiting_contractor' },
      },
      typeReconfiguredLater,
    ) as ContractorReplyDecisionInput

    expect(decideContractorReply(input)).toEqual({
      attachmentId: PNG.id,
      kind: 'accept',
      nextStep: 'deliver',
    })

    const typeWantedPdfWhenReplyWasOpened = Object.assign(
      { attachments: [PNG], reply: { config: AUTOMATIC_PDF, status: 'awaiting_contractor' } },
      { type: { attachmentKind: 'pdf_or_image', contractorReplyMode: 'forward_automatic' } },
    ) as ContractorReplyDecisionInput

    expect(decideContractorReply(typeWantedPdfWhenReplyWasOpened)).toEqual(NEEDS_NO_ATTACHMENT)
  })
})

const NOW = new Date('2026-10-08T18:00:00.000Z')

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000)
}

type AlertReply = ContractorReplyAlertInput['reply']

function alertReply(overrides: Partial<AlertReply> = {}): AlertReply {
  return {
    alertCount: 0,
    config: { alertIntervalMinutes: 60, alertMaxCount: 24, alertMode: 'alert_operator' },
    deadlineAt: minutesBefore(1),
    lastAlertAt: null,
    status: 'awaiting_contractor',
    ...overrides,
  }
}

function alertDecision(
  reply: AlertReply,
  pendingWindowSince: Date | null = null,
): ReturnType<typeof decideAlert> {
  return decideAlert({ now: NOW, pendingWindowSince, reply })
}

describe('decideAlert (spec 248 RF5, CA05)', () => {
  test('before the deadline there is no alert', () => {
    expect(alertDecision(alertReply({ deadlineAt: new Date(NOW.getTime() + 1) }))).toEqual({
      kind: 'none',
      reason: 'not_due',
    })
  })

  test('at the deadline the first alert fires and the reply becomes overdue', () => {
    expect(alertDecision(alertReply({ deadlineAt: NOW }))).toEqual({
      alertNumber: 1,
      becomesOverdue: true,
      kind: 'alert',
    })
  })

  test('without a deadline there is nothing to wait for', () => {
    expect(alertDecision(alertReply({ deadlineAt: null }))).toEqual({
      kind: 'none',
      reason: 'no_deadline',
    })
  })

  test('alert mode off never alerts', () => {
    const config = { alertIntervalMinutes: 60, alertMaxCount: 24, alertMode: 'off' } as const

    expect(alertDecision(alertReply({ config }))).toEqual({
      kind: 'none',
      reason: 'alert_mode_off',
    })
  })

  const INTERVAL_CASES = [
    { elapsedMinutes: 59, expected: { kind: 'none', reason: 'interval_not_elapsed' } },
    { elapsedMinutes: 60, expected: { alertNumber: 2, becomesOverdue: false, kind: 'alert' } },
    { elapsedMinutes: 61, expected: { alertNumber: 2, becomesOverdue: false, kind: 'alert' } },
  ] as const

  for (const { elapsedMinutes, expected } of INTERVAL_CASES) {
    test(`${elapsedMinutes} min after the last alert (interval 60)`, () => {
      const reply = alertReply({
        alertCount: 1,
        deadlineAt: minutesBefore(600),
        lastAlertAt: minutesBefore(elapsedMinutes),
        status: 'overdue',
      })

      expect(alertDecision(reply)).toEqual(expected)
    })
  }

  test('the interval comes from the copied configuration', () => {
    const config = {
      alertIntervalMinutes: 15,
      alertMaxCount: 24,
      alertMode: 'alert_operator',
    } as const
    const reply = alertReply({
      alertCount: 3,
      config,
      deadlineAt: minutesBefore(600),
      lastAlertAt: minutesBefore(15),
      status: 'overdue',
    })

    expect(alertDecision(reply)).toEqual({ alertNumber: 4, becomesOverdue: false, kind: 'alert' })
  })

  test('the last allowed alert fires and the next one never does (cap)', () => {
    const config = {
      alertIntervalMinutes: 60,
      alertMaxCount: 3,
      alertMode: 'alert_operator',
    } as const
    const base = {
      config,
      deadlineAt: minutesBefore(900),
      lastAlertAt: minutesBefore(600),
      status: 'overdue',
    } as const

    expect(alertDecision(alertReply({ ...base, alertCount: 2 }))).toEqual({
      alertNumber: 3,
      becomesOverdue: false,
      kind: 'alert',
    })
    expect(alertDecision(alertReply({ ...base, alertCount: 3 }))).toEqual({
      kind: 'none',
      reason: 'max_count_reached',
    })
    expect(alertDecision(alertReply({ ...base, alertCount: 4 }))).toEqual({
      kind: 'none',
      reason: 'max_count_reached',
    })
  })

  const STOP_CASES = [
    { expected: 'reply_arrived', status: 'reply_received' },
    { expected: 'reply_arrived', status: 'awaiting_operator' },
    { expected: 'reply_arrived', status: 'needs_operator' },
    { expected: 'reply_arrived', status: 'delivered' },
    { expected: 'handled', status: 'handled' },
    { expected: 'cancelled', status: 'cancelled' },
  ] as const

  for (const { expected, status } of STOP_CASES) {
    test(`stops when the reply is ${status}, even past the deadline`, () => {
      const reply = alertReply({ alertCount: 1, deadlineAt: minutesBefore(900), status })

      expect(alertDecision(reply)).toEqual({ kind: 'none', reason: expected })
    })
  }

  test('a delivery waiting for the driver window keeps the alarm going', () => {
    const reply = alertReply({ deadlineAt: minutesBefore(900), status: 'reply_received' })

    expect(alertDecision(reply, minutesBefore(5))).toEqual({
      alertNumber: 1,
      becomesOverdue: false,
      kind: 'alert',
    })
    expect(
      alertDecision({ ...reply, alertCount: 1, lastAlertAt: minutesBefore(30) }, minutesBefore(90)),
    ).toEqual({
      kind: 'none',
      reason: 'interval_not_elapsed',
    })
  })

  test('a received reply with no pending window never alerts', () => {
    const reply = alertReply({ deadlineAt: minutesBefore(900), status: 'reply_received' })

    expect(alertDecision(reply, null)).toEqual({ kind: 'none', reason: 'reply_arrived' })
  })
})
