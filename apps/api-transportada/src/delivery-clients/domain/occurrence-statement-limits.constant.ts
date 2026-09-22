/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20 (Risco 5 do `plan.md`): o demonstrativo de ressarcimento pode ficar pesado — cinco
 * fotos por ocorrência, dezenas de ocorrências no lote. Os números daqui são o teto e as travas que
 * impedem um PDF de 40 MB de nascer.
 */

/**
 * ⚠️ **O teto vale para o PDF final**, não para a soma das imagens: é o arquivo que trafega, que o
 * bucket guarda e que a contratante abre. A soma dos bytes embutidos é só o termo dominante, e a
 * política antecipa o estouro por ela para não gastar a montagem inteira antes de recusar — a
 * medida que decide continua sendo `bytes.byteLength` do documento montado.
 */
export const OCCURRENCE_STATEMENT_MAX_BYTES = 8 * 1024 * 1024

/** Uma imagem por linha no corpo; as outras fotos da mesma ocorrência entram por contagem textual. */
export const OCCURRENCE_STATEMENT_PHOTOS_PER_ROW = 1

/**
 * Downloads simultâneos do bucket ao montar o demonstrativo. Cinquenta fotos em série estouram o
 * prazo da requisição antes de estourar o tamanho; cinquenta em paralelo materializam o lote
 * inteiro em memória e afogam a conexão com o storage.
 */
export const OCCURRENCE_STATEMENT_PHOTO_CONCURRENCY = 4

/** Prazo por foto. Foto que não chega vira selo textual — o demonstrativo não espera pelo bucket. */
export const OCCURRENCE_STATEMENT_PHOTO_TIMEOUT_MS = 10_000

/** Linhas por página: cada uma leva um bloco com foto, não uma linha de tabela. */
export const OCCURRENCE_STATEMENT_ROWS_PER_PAGE = 5
