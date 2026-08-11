/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Teto de notas por projeção e por lote. Acompanha a maior página da tabela de notas: um teto abaixo
 * dela transforma "selecionar todos" em 400. A projeção resolve a seleção inteira numa consulta só,
 * e o agrupamento `sender_recipient` precisa enxergar todas as notas de uma vez — fatiar a seleção
 * em blocos separaria notas do mesmo par remetente/destinatário em CT-es diferentes.
 */
export const CTE_BATCH_MAX_DOCUMENTS = 1000
