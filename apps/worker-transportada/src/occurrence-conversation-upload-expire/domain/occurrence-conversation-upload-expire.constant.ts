/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702c2: os números da rotina que expira o pedido de upload do anexo da conversa. São os
 * mesmos da rotina irmã da spec 179 (`trip-occurrence-upload-expire.constant.ts`), pelos mesmos
 * motivos — ficam aqui, com nome próprio, para uma não mudar a outra por tabela.
 */

export const OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_JOB = 'occurrence-conversation.upload.expire'

/**
 * A URL de subida vive `CONVERSATION_UPLOAD_EXPIRES_IN_SECONDS` (900s, API). A folga não estica a
 * janela em que o upload vale — só atrasa a varredura, para o relógio entre API e worker nunca apagar
 * um objeto no instante em que um envio legítimo, já em voo, ainda liga o anexo à mensagem.
 */
export const OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_GRACE_SECONDS = 900

/** Lotes curtos: cada candidato abre I/O de rede contra o bucket numa transação própria. */
export const OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_BATCH_SIZE = 25

/** Teto de lotes por ciclo: o que sobrar espera a próxima batida, e o log diz que sobrou. */
export const OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_BATCHES = 200

/** Acima disso o bucket está fora do ar; insistir só atrasa a próxima batida. */
export const OCCURRENCE_CONVERSATION_UPLOAD_EXPIRE_MAX_CONSECUTIVE_STORAGE_FAILURES = 5
