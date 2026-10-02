/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** O código de barras é o único leitor: o único `readSource` que a máquina pode reportar (ADR-0092 §1). */
export const CANHOTO_BARCODE_READ_SOURCE = 'barcode'

/**
 * A fila anda em lotes de consulta pequenos porque cada item custa um download e uma decodificação
 * de CPU: o lote curto deixa `isStopRequested()` ser lido com frequência.
 */
export const CANHOTO_READ_BATCH_SIZE = 10

/**
 * Teto de comprovantes por ciclo. Foto de 12 MP leva ~100 ms em JPEG (spike T4.1); quarenta cabem com
 * folga numa batida de 300 s, e o que sobrar espera a próxima — o log diz que sobrou.
 */
export const CANHOTO_READ_MAX_PROOFS_PER_CYCLE = 40

/**
 * RNF3 / ADR-0092 §4: conferido **antes** do download, contra o tamanho gravado em `stored_objects`.
 * O PNG de 12 MP do spike deu 10,7 MB e levou o worker a ~300 MB de RSS.
 */
export const CANHOTO_READ_MAX_OBJECT_BYTES = 8 * 1024 * 1024

/** Orçamento de tempo da decodificação no `worker_thread`: estourou, o thread é encerrado. */
export const CANHOTO_DECODE_BUDGET_MILLISECONDS = 15_000

/** Os formatos que o decodificador wasm lê (spike T4.1). */
export const CANHOTO_SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type CanhotoSupportedMediaType = (typeof CANHOTO_SUPPORTED_MEDIA_TYPES)[number]

/**
 * Resultados contados por falha **de um comprovante** (RF-B8) — não desfecho de execução: o ciclo
 * fecha `succeeded` mesmo com falha aqui, e por isso o catálogo de `trip.canhoto.read` não os lista.
 */
export const CANHOTO_READ_FAILURE_OUTCOMES = [
  'object_unavailable',
  'unsupported_media',
  'too_large',
  'decode_timeout',
  'api_unreachable',
  'report_rejected',
  'api_unauthorized',
] as const
export type CanhotoReadFailureOutcome = (typeof CANHOTO_READ_FAILURE_OUTCOMES)[number]
