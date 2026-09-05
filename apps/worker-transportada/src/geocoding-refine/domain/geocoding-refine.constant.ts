/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ⚠️ **Aqui o lote não é cortesia com serviço gratuito — é dinheiro** (ADR-0062). A `geocoding.backfill`
 * pode andar em cem por janela porque a BrasilAPI não cobra; esta paga por chamada.
 *
 * O teto real não é este número, e é o que torna a decisão defensável: cada endereço custa **uma**
 * chamada na vida (`paid_refined_at`), então o gasto total é o tamanho da população — medido em
 * 2026-09-04: quinze endereços em centroide. O lote só decide em quantas janelas isso se dilui.
 */
export const GEOCODING_REFINE_BATCH_SIZE = 25

/** Uma passada por janela: não há fila a esvaziar com pressa, e a próxima janela é em uma hora. */
export const GEOCODING_REFINE_MAX_BATCHES = 1

/** Pausa entre requisições, pela mesma razão da rotina gratuita: rajada é o que faz provedor bloquear. */
export const GEOCODING_REFINE_REQUEST_PAUSE_MILLISECONDS = 300
