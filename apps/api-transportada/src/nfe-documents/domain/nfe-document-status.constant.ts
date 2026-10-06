/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeDocumentStatus } from '../../database/nfe.schema.js'

/** A única situação da NF-e que pode entrar numa chegada, numa prévia ou num rascunho de viagem. */
export const NFE_DOCUMENT_AUTHORIZED_STATUS = 'authorized' as const satisfies NfeDocumentStatus
