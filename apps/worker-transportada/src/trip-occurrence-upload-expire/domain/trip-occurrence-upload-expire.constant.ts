/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const TRIP_OCCURRENCE_UPLOAD_EXPIRE_JOB = 'trip.occurrence-upload.expire'

/**
 * Achado [3] da revisão de código de 23/09 (spec 179): a URL assinada de upload vive
 * `OCCURRENCE_UPLOAD_EXPIRES_IN_SECONDS` (900s, `create-occurrence-upload.use-case.ts` da API) a
 * partir da emissão — depois disso nem o motorista consegue subir o arquivo, nem `confirm` aceita
 * (`confirm-occurrence-upload.use-case.ts` recusa por `expiresAt <= now`, achado [1]/[2] do mesmo
 * lote). A folga aqui **não estica** a janela em que o upload vale — só atrasa quando a varredura
 * mexe na linha, para relógio e latência entre API e worker nunca apagarem um objeto no instante
 * exato em que um `confirm` legítimo, já em voo, ainda pode fechar `pending → confirmed`.
 */
export const TRIP_OCCURRENCE_UPLOAD_EXPIRE_GRACE_SECONDS = 900

/**
 * Lotes curtos: cada candidato abre I/O de rede contra o bucket dentro de uma transação própria —
 * igual à varredura irmã (`trip-occurrence-attachment-purge`), pelo mesmo motivo.
 */
export const TRIP_OCCURRENCE_UPLOAD_EXPIRE_BATCH_SIZE = 25

/** Teto de lotes por ciclo: o que sobrar espera a próxima batida, e o log diz que sobrou. */
export const TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_BATCHES = 200

/**
 * Teto de falhas de storage seguidas dentro do ciclo: acima disso o bucket está fora do ar, e
 * insistir contra os 200 lotes só atrasa a próxima batida sem expirar nada a mais.
 */
export const TRIP_OCCURRENCE_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES = 5

/**
 * Prazo do `deleteObject`: a transação da unidade fica aberta durante o I/O de rede, então ele não
 * pode pendurar — um bucket lento trava a linha até o timeout do Postgres em vez do nosso.
 */
export const TRIP_OCCURRENCE_UPLOAD_EXPIRE_DELETE_TIMEOUT_MS = 10_000
