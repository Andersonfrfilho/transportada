/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const WHATSAPP_INBOX_CHAT_EXPIRE_JOB = 'whatsapp-inbox.chat.expire' as const

/** Lotes curtos: cada um é um `UPDATE` que trava só as conversas que devolve. */
export const WHATSAPP_INBOX_CHAT_EXPIRE_BATCH_SIZE = 100

/** Teto de lotes por ciclo: o que sobrar espera a próxima batida, e o log diz que sobrou. */
export const WHATSAPP_INBOX_CHAT_EXPIRE_MAX_BATCHES = 20
