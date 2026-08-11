/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Teto de notas **por requisição** de projeção e de criação — não teto de seleção. A emissão em
 * massa fatia a seleção abaixo deste número e cria um lote por fatia, então a quantidade de notas
 * que o operador seleciona não tem teto. Este número existe por causa do corpo de 1 MiB do servidor
 * (cerca de 25 mil UUIDs) e do tamanho da resposta da projeção, e porque o agrupamento
 * `sender_recipient` precisa enxergar todas as notas de uma vez: fatiar separaria notas do mesmo par
 * remetente/destinatário em CT-es diferentes, então esse modo vai numa requisição só.
 */
export const CTE_BATCH_MAX_DOCUMENTS = 1000
