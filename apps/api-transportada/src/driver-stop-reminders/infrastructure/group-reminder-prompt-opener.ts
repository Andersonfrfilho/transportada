/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ReminderPromptOpener } from '../application/reminder-prompt-opener.port.js'

/** A T2.3 troca este abridor pelo que abre o passo `reminder.stage` do registro do grupo; até lá o envio não abre passo. */
export function createGroupReminderPromptOpener(): ReminderPromptOpener {
  return { open: async () => undefined }
}
