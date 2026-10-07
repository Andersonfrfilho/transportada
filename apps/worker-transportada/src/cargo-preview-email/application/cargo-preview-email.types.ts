/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoPreviewEmailRejectionCode } from '../../shared/cargo-preview.constant.js'
import type { DkimAlignmentResult } from '../../contractor-mail/domain/dkim-alignment.policy.js'
import type { VerifyDkimAlignmentPort } from '../../contractor-mail/infrastructure/dkim-verifier.gateway.js'
import type {
  ReceivedResendEmail,
  ResendMailGateway,
} from '../../contractor-mail/infrastructure/resend-mail.gateway.js'

export type PreviewProfileRecord = {
  readonly contractorId: string
  readonly forwarderAllowlist: readonly string[] | null
  /** Perfil ligado, prévia ligada e mapa de colunas: sem isso o worker nunca leria a planilha. */
  readonly isPreviewReady: boolean
  readonly senderAllowlist: readonly string[] | null
}

export type RejectionRecord = {
  readonly companyId: string
  readonly contractorId: string
  readonly dkimResult?: DkimAlignmentResult
  /** O remetente original foi lido do cabeçalho do encaminhamento (sempre `unverified`). */
  readonly isOriginalSenderRead: boolean
  readonly providerEmailId: string
  readonly reason: CargoPreviewEmailRejectionCode
  readonly receivedAt: Date
}

export type AcceptedRecord = {
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
  readonly dkimResult: DkimAlignmentResult
  readonly file: {
    readonly bucket: string
    readonly fileName: string
    readonly fileObjectId: string
    readonly idempotencyKey: string
    readonly objectKey: string
    readonly requestFingerprint: string
    readonly sha256: string
    readonly sizeBytes: number
  }
  readonly providerEmailId: string
  readonly raw: {
    readonly bucket: string
    readonly key: string
    readonly mimeType: string
    readonly provider: string
    readonly sha256: string
    readonly sizeBytes: number
  }
  readonly receivedAt: Date
}

export type CreatePreviewOutcome =
  | { readonly kind: 'already_recorded' }
  | { readonly kind: 'created'; readonly previewId: string }
  | { readonly kind: 'replayed'; readonly previewId: string }
  | { readonly kind: 'too_many_open' }

export type CargoPreviewEmailRepositoryPort = {
  countRecentIntakes(input: {
    readonly companyId: string
    readonly contractorId: string
    readonly since: Date
  }): Promise<number>
  createPreview(input: AcceptedRecord): Promise<CreatePreviewOutcome>
  findProfilesByTokenHashes(input: {
    readonly companyId: string
    readonly tokenHashes: readonly string[]
  }): Promise<readonly PreviewProfileRecord[]>
  hasIntake(input: {
    readonly companyId: string
    readonly providerEmailId: string
  }): Promise<boolean>
  recordRejection(input: RejectionRecord): Promise<void>
}

export type CargoPreviewEmailStoragePort = {
  deleteObject(input: { readonly bucket: string; readonly key: string }): Promise<unknown>
  storeObject(input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }): Promise<unknown>
}

export type CargoPreviewEmailIntakeInput = {
  readonly companyId: string
  readonly correlationId: string
  readonly occurredAt: Date
  readonly providerEmailId: string
  readonly received: ReceivedResendEmail
  readonly replyDomain: string
}

/** Só códigos, ids e contagens: nunca endereço, nome, assunto, corpo ou cabeçalho. */
export type CargoPreviewEmailIntakeResult =
  | {
      readonly kind: 'accepted'
      readonly contractorId: string
      readonly dkimResult: DkimAlignmentResult
      readonly isReplay: boolean
      readonly previewId: string
    }
  | { readonly kind: 'already_recorded' }
  | { readonly kind: 'not_a_preview' }
  | { readonly kind: 'rate_limited'; readonly contractorId: string }
  | {
      readonly kind: 'rejected'
      readonly contractorId: string
      readonly reason: CargoPreviewEmailRejectionCode
    }

export type CargoPreviewEmailIntakePort = {
  hasIntake(input: {
    readonly companyId: string
    readonly providerEmailId: string
  }): Promise<boolean>
  intake(input: CargoPreviewEmailIntakeInput): Promise<CargoPreviewEmailIntakeResult>
}

export type IntakeCargoPreviewEmailDependencies = {
  readonly dkimVerifier: VerifyDkimAlignmentPort
  readonly mailGateway: Pick<ResendMailGateway, 'downloadRawEmail'>
  readonly newId: () => string
  readonly now: () => Date
  readonly repository: CargoPreviewEmailRepositoryPort
  readonly storage: CargoPreviewEmailStoragePort
  readonly storageBucket: string
  readonly storageProvider: string
}

/** O que sobrou depois de todas as barreiras: o DKIM do encaminhador, a planilha e o MIME bruto. */
export type VerifiedPreviewEmail = {
  readonly dkimResult: DkimAlignmentResult
  readonly file: { readonly bytes: Uint8Array; readonly fileName: string }
  readonly raw: Buffer
}
