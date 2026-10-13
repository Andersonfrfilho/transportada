/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T5.4: what the driver's current-trip read asks to show "Pedido enviado à contratante" on a
 * note. Only the occurrence id and the status of its contractor reply: no address, no deadline, no
 * attachment, no operator note. The documents come from the driver's own trips (the link cut), never
 * from the client.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import type { ContractorReplyStatus } from '../../shared/occurrence-contractor-reply.constant.js'

export type DriverDocumentContractorReply = {
  readonly documentId: string
  readonly occurrenceId: string
  readonly status: ContractorReplyStatus
}

export type DriverDocumentContractorReplyPort = {
  list(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }): Promise<readonly DriverDocumentContractorReply[]>
}

export type DriverContractorRepliesDependency = {
  /** Without a logger the failure is silent; with it, it leaves a trace of counts only. */
  readonly logger?: ApiLogger
  readonly reader: DriverDocumentContractorReplyPort
}
