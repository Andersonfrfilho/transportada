/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const TRIP_OCCURRENCE_ATTACHMENT_PURGE_JOB = 'trip.occurrence-attachment.purge'

/**
 * Spec 161 RF21: os dois purposes da foto de ocorrência — original e miniatura, D12 — que a
 * varredura considera. `retention_until` é gravado por quem cria o objeto; a rotina só o lê.
 */
export const TRIP_OCCURRENCE_ATTACHMENT_STORAGE_PURPOSES = [
  'trip_occurrence_attachment',
  'trip_occurrence_thumbnail',
] as const

/**
 * Lotes curtos: cada candidato pode abrir I/O de rede contra o bucket dentro de uma transação
 * própria — um lote de 500, como as varreduras que só tocam o banco, deixaria muita transação
 * aberta esperando resposta de storage.
 */
export const TRIP_OCCURRENCE_ATTACHMENT_PURGE_BATCH_SIZE = 25

/** Teto de lotes por ciclo: o que sobrar espera a próxima batida, e o log diz que sobrou. */
export const TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_BATCHES = 200

/**
 * Teto de falhas de storage seguidas dentro do ciclo: acima disso o bucket está fora do ar, e
 * insistir contra os 200 lotes só atrasa a próxima batida sem apagar nada a mais.
 */
export const TRIP_OCCURRENCE_ATTACHMENT_PURGE_MAX_CONSECUTIVE_STORAGE_FAILURES = 5

/**
 * Prazo do `deleteObject`: a transação da unidade fica aberta durante o I/O de rede, então ele não
 * pode pendurar — um bucket lento trava a linha do anexo até o timeout do Postgres em vez do nosso.
 */
export const TRIP_OCCURRENCE_ATTACHMENT_PURGE_DELETE_TIMEOUT_MS = 10_000
