/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Emitir CT-e vincula a nota e muda o que a lista deve mostrar: quem emite precisa da mesma chave. */
export const NFE_DOCUMENTS_QUERY_KEY = 'nfe-documents'

/** Salvar um pedido de correção muda o estado da própria lista de pedidos (spec 150, T201). */
export const ADDRESS_CORRECTION_REQUESTS_QUERY_KEY = 'address-correction-requests'

/**
 * A razão de bloqueio é vocabulário do servidor e chega como texto. Esta é a única que vira ícone
 * com link, porque é a única que aponta para um documento que existe e pode ser aberto.
 */
export const NFSE_LINK_BLOCK_REASON = 'CTE_BATCH_DOCUMENT_LINKED_TO_NFSE'
