/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * RNF4: a BrasilAPI é serviço **público e gratuito**. Lote pequeno com intervalo entre eles é
 * cortesia e é robustez — rajada de milhares de requisições é bloqueio merecido, e um bloqueio
 * derruba o degrau 1 da instalação inteira.
 */
export const GEOCODING_BACKFILL_BATCH_SIZE = 50

/**
 * Teto por ciclo. A batida é de cinco minutos, então a fila anda 500 endereços a cada janela e uma
 * base grande converge em horas — sem que uma única execução segure o lease por tempo indefinido.
 */
export const GEOCODING_BACKFILL_MAX_BATCHES = 10

/** Intervalo entre lotes. */
export const GEOCODING_BACKFILL_PAUSE_MILLISECONDS = 1_000
