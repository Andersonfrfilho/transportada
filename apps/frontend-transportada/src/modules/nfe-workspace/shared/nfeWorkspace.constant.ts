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

/**
 * T14 (revisão final, BAIXO, §16 code-standards): último recurso quando a réplica falha sem código
 * vindo da API (rede caiu) — repetido em `packageBoxClient.service.ts` e
 * `usePackageBoxQueue.hook.ts`.
 */
export const PACKAGE_BOX_REPLICATE_FAILED_CODE = 'PACKAGE_BOX_REPLICATE_FAILED'

/** T14 (revisão final, BAIXO, §16): corpo das irmãs que não bate o formato esperado, duas vezes no mesmo arquivo. */
export const PACKAGE_BOX_SIBLINGS_MALFORMED_CODE = 'PACKAGE_BOX_SIBLINGS_MALFORMED'

/**
 * Re-revisão (M1, spec 155 T3.5): último recurso quando a busca de irmãs do "aplicar a todos"
 * falha sem código vindo da API — mesmo padrão de `PACKAGE_BOX_REPLICATE_FAILED_CODE`.
 */
export const PACKAGE_BOX_FAMILY_APPLY_FAILED_CODE = 'PACKAGE_BOX_FAMILY_APPLY_FAILED'
