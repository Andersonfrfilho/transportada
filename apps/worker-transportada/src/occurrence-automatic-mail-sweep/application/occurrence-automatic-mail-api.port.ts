/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type SendAutomaticMailParams = Readonly<{ companyId: string; occurrenceId: string }>

export type SendAutomaticMailResult = Readonly<{ outcome: 'already_sent' | 'sent' | 'skipped' }>

export type OccurrenceAutomaticMailApiPort = Readonly<{
  send: (params: SendAutomaticMailParams) => Promise<SendAutomaticMailResult>
}>
