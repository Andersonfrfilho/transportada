/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T3.2: cada CHECK do tipo, contra a migration real — o que ela aceita nas bordas e o que
 * recusa logo além, com o nome da CHECK que recusou. Inclui as quatro cruzadas.
 */
import type { SQL } from 'bun'

import { expectQueryToFail } from './support.js'

type TypeRow = Record<string, boolean | number | string | null>

type Probe = Readonly<{ companyId: string; database: SQL }>

const FILLED_TEXT = 'Texto de prova'

const BASE_REPLY: TypeRow = {
  contractor_reply_mode: 'forward_after_approval',
  driver_reply_template: FILLED_TEXT,
  emails_contractor: true,
  forward_email_body: FILLED_TEXT,
  forward_email_subject: FILLED_TEXT,
}

const PREFIX = 'company_occurrence_types_'

/** Cada caso muda só o que precisa para violar a CHECK, sobre uma linha que as satisfaz. */
const REJECTED_CASES: readonly (readonly [string, TypeRow])[] = [
  ['contractor_reply_mode_check', { contractor_reply_mode: 'forward_always' }],
  ['contractor_reply_attachment_kind_check', { contractor_reply_attachment_kind: 'docx' }],
  ['driver_reply_channel_check', { driver_reply_channel: 'sms' }],
  ['driver_reply_window_action_check', { driver_reply_window_closed_action: 'ignore' }],
  ['driver_reply_template_check', { driver_reply_template: 'a'.repeat(1001) }],
  ['contractor_reply_wait_hours_check', { contractor_reply_wait_hours: 0 }],
  ['contractor_reply_wait_hours_check', { contractor_reply_wait_hours: 169 }],
  ['contractor_reply_alert_mode_check', { contractor_reply_alert_mode: 'page_everyone' }],
  ['contractor_reply_alert_interval_check', { contractor_reply_alert_interval_minutes: 14 }],
  ['contractor_reply_alert_interval_check', { contractor_reply_alert_interval_minutes: 1441 }],
  ['contractor_reply_alert_max_count_check', { contractor_reply_alert_max_count: 0 }],
  ['contractor_reply_alert_max_count_check', { contractor_reply_alert_max_count: 97 }],
  ['forward_to_note_recipient_check', { forward_to_note_recipient: 'always' }],
  ['forward_to_informed_email_check', { forward_to_informed_email: 'automatic' }],
  ['forward_email_subject_check', { forward_email_subject: 'a'.repeat(201) }],
  ['forward_email_body_check', { forward_email_body: 'a'.repeat(4001) }],
  ['contractor_reply_requires_mail_check', { emails_contractor: false }],
  ['contractor_reply_requires_mail_check', { driver_reply_template: '   ' }],
  [
    'contractor_reply_alert_wait_check',
    { contractor_reply_alert_mode: 'alert_operator', contractor_reply_wait_hours: null },
  ],
  [
    'forward_automatic_needs_reply_check',
    { contractor_reply_mode: 'off', forward_to_note_recipient: 'automatic' },
  ],
  ['forward_needs_text_check', { forward_to_note_recipient: 'manual', forward_email_subject: ' ' }],
  ['forward_needs_text_check', { forward_to_informed_email: 'manual', forward_email_body: '' }],
]

const ACCEPTED_CASES: readonly (readonly [string, TypeRow])[] = [
  ['wait hours 1', { contractor_reply_wait_hours: 1 }],
  ['wait hours 168', { contractor_reply_wait_hours: 168 }],
  ['template 1000 characters', { driver_reply_template: 'a'.repeat(1000) }],
  ['alert interval 15', { contractor_reply_alert_interval_minutes: 15 }],
  ['alert interval 1440', { contractor_reply_alert_interval_minutes: 1440 }],
  ['alert max count 1', { contractor_reply_alert_max_count: 1 }],
  ['alert max count 96', { contractor_reply_alert_max_count: 96 }],
  ['subject 200 characters', { forward_email_subject: 'a'.repeat(200) }],
  ['body 4000 characters', { forward_email_body: 'a'.repeat(4000) }],
  ['pdf or image', { contractor_reply_attachment_kind: 'pdf_or_image' }],
  [
    'both channels, wait for driver',
    { driver_reply_channel: 'both', driver_reply_window_closed_action: 'wait_for_driver' },
  ],
  [
    'alert with a wait',
    { contractor_reply_alert_mode: 'alert_operator', contractor_reply_wait_hours: 24 },
  ],
  [
    'automatic forward with a reply',
    { contractor_reply_mode: 'forward_automatic', forward_to_note_recipient: 'automatic' },
  ],
  ['informed e-mail manual', { forward_to_informed_email: 'manual' }],
  [
    'everything off with blank texts',
    {
      contractor_reply_mode: 'off',
      driver_reply_template: '',
      forward_email_body: '',
      forward_email_subject: '',
    },
  ],
]

function insertType(probe: Probe, patch: TypeRow): PromiseLike<unknown> {
  const id = crypto.randomUUID()
  const row: TypeRow = {
    company_id: probe.companyId,
    id,
    items_mode: 'off',
    name: `Prova 248 ${id}`,
    redelivery_policy: 'unset',
    stage: 'delivery',
    ...BASE_REPLY,
    ...patch,
  }
  return probe.database`insert into company_occurrence_types ${probe.database(row)}`
}

export async function assertOccurrenceContractorReplyTypeConstraints(probe: Probe): Promise<void> {
  for (const [name, patch] of ACCEPTED_CASES) {
    try {
      await insertType(probe, patch)
    } catch (error) {
      throw new Error(`expected the type to be accepted (${name}): ${String(error)}`)
    }
  }
  for (const [constraint, patch] of REJECTED_CASES) {
    await expectQueryToFail(insertType(probe, patch), '23514', `${PREFIX}${constraint}`)
  }
}
