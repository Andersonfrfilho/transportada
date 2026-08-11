/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Teto de CT-es **por fatura**. A fatura é um documento comercial só: o tomador recebe uma cobrança
 * com o total do período, e fatiar a seleção criaria duas dívidas para a mesma coisa. O número
 * existe pelo corpo de 1 MiB do servidor e pelo tempo que a transação segura a conexão — quem
 * divide em blocos é a gravação dos itens, não o documento.
 */
export const BILLING_MAX_CTES_PER_INVOICE = 1000

/**
 * Itens gravados por sentença dentro da transação. Um `insert` por CT-e faz mil idas ao banco com o
 * bloqueio aberto; a sentença única esbarraria no teto de parâmetros do Postgres.
 */
export const BILLING_INVOICE_ITEM_INSERT_CHUNK = 100
