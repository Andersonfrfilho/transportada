/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const OCCURRENCE_AUTOMATIC_MAIL_SWEEP_JOB = 'occurrence.automatic-mail.sweep' as const

/** Dá tempo ao caminho em linha (app e WhatsApp) de enviar antes de o varredor tentar. */
export const OCCURRENCE_AUTOMATIC_MAIL_GRACE_MILLISECONDS = 10 * 60_000

/** Ocorrência mais velha que isto deixou de ser aviso útil: o varredor não a ressuscita. */
export const OCCURRENCE_AUTOMATIC_MAIL_LOOKBACK_MILLISECONDS = 24 * 60 * 60_000

export const OCCURRENCE_AUTOMATIC_MAIL_BATCH_SIZE = 10
export const OCCURRENCE_AUTOMATIC_MAIL_MAX_PER_CYCLE = 50

/** Espelham a chave e a operação de idempotência que a API grava ao enviar: a fila exclui quem já tem registro. */
export const OCCURRENCE_AUTOMATIC_MAIL_KEY_PREFIX = 'occurrence-auto-mail:'
export const OCCURRENCE_AUTOMATIC_MAIL_SEND_OPERATION = 'occurrence-conversation.mail.send'

/**
 * Spec 271 (ADR-0108): o modelo de e-mail à contratante mora em `notification.templates`. A fila só pede a ocorrência cujo tipo
 * escolheu uma chave com versão ativa utilizável — mesmo critério da API (`blocksContractorMailSend`): e-mail `pt-BR`, assunto
 * preenchido e corpo **sem HTML** (`HTML_BODY_PATTERN` é cópia do da API; os dois contratos fixam o mesmo valor e os mesmos casos).
 */
export const NOTIFICATION_SCHEMA = 'notification'
export const OCCURRENCE_CONTRACTOR_MAIL_CHANNEL = 'email'
export const OCCURRENCE_CONTRACTOR_MAIL_LOCALE = 'pt-BR'
export const HTML_BODY_PATTERN = '</?[A-Za-z][A-Za-z0-9_:-]*[\\s>/]'
