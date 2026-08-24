/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A liquidação da nota é uma transação só, guardada pelo banco: o repositório projeta o status de
 * origem permitido dentro do próprio `UPDATE`, para não existir janela entre ler e escrever.
 */
import type { NfseFiscalEnvironment } from '../../database/nfse-issuance-execution.schema.js'
import type { NfseStoredDocument } from './nfse-document-storage.port.js'

export type NfseReconciliationWriteBackPort = {
  recordAuthorized(input: {
    readonly attemptId: string
    readonly authorizedAt: Date
    readonly companyId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
    readonly fiscalNumber: string
    readonly invoiceId: string
    readonly occurredAt: Date
    /** Ausente quando a prefeitura não serviu o PDF: o documento fiscal é o XML. */
    readonly pdf?: NfseStoredDocument
    readonly providerDocumentId: string
    readonly verificationCode: string
    readonly xml: NfseStoredDocument
  }): Promise<void>
  recordCancellationConfirmed(input: {
    readonly attemptId: string
    readonly cancelledAt: Date
    readonly companyId: string
    readonly invoiceId: string
    readonly occurredAt: Date
  }): Promise<void>
  recordRejected(input: {
    readonly attemptId: string
    readonly companyId: string
    readonly errorCode: string
    readonly errorMessage: string
    readonly invoiceId: string
    readonly occurredAt: Date
  }): Promise<void>
  rescheduleStatusCheck(input: {
    readonly companyId: string
    readonly invoiceId: string
    readonly nextStatusCheckAt: Date
  }): Promise<void>
}
