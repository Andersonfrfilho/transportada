/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * RNF4: a BrasilAPI é serviço **público e gratuito**, e a cortesia com ela é número, não intenção.
 *
 * ⚠️ A primeira versão destes valores estava errada por uma ordem de grandeza, e vale ficar escrito
 * por quê: 10 lotes de 50 a cada 5 minutos são **6.000 requisições por hora**, com a pausa no lugar
 * errado — entre lotes, então dentro de cada um saíam 50 chamadas em rajada. Rajada é o que faz um
 * serviço gratuito bloquear, mais que o total do dia.
 *
 * E não havia pressa para justificar: a rotina é **adiantamento**, e a RF2 garante que o que ela não
 * alcançar a sugestão resolve na hora. Correr rápido não melhora nada que alguém perceba.
 */
export const GEOCODING_BACKFILL_BATCH_SIZE = 50

/** Dois lotes por hora: ~100 endereços, folgado para a entrada real de uma transportadora. */
export const GEOCODING_BACKFILL_MAX_BATCHES = 2

/** Pausa **entre requisições**, que é onde ela importa — não entre lotes, como estava. */
export const GEOCODING_BACKFILL_REQUEST_PAUSE_MILLISECONDS = 300

/** Respiro a mais entre lotes, por cima do espaçamento por requisição. */
export const GEOCODING_BACKFILL_BATCH_PAUSE_MILLISECONDS = 2_000
