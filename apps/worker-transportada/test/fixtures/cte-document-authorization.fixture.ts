/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteBatchDocumentAuthorizationCheck } from '../../src/cte-issuance/application/cte-issuance-consumer.effect.js'

/** Primeira transmissão de um item cujas notas continuam autorizadas: o caminho feliz da emissão. */
export const AUTHORIZED_DOCUMENT_CHECK: CteBatchDocumentAuthorizationCheck = {
  isAuthorized: async () => true,
  mayHaveReachedSefaz: async () => false,
}
