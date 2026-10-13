/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6b: what the automatic delivery wrote to the driver chat, for the bell notice that goes out
 * after the commit. Ids, protocol and the occurrence label only — never the text, the attachment or the
 * contractor contact.
 */
export type DriverReplyNotice = {
  readonly companyId: string
  readonly driverMessageId: string
  readonly driverUserId: string
  readonly occurrenceId: string
  readonly occurrenceLabel: string
  readonly protocol: string
}

export type DriverReplyNoticePort = {
  notify(notice: DriverReplyNotice): Promise<void>
}
