/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CargoPreviewEmailIntakeInput,
  CargoPreviewEmailIntakeResult,
  CargoPreviewEmailRepositoryPort,
  CargoPreviewEmailStoragePort,
} from './cargo-preview-email.types.js'
import type { VerifyDkimAlignmentPort } from '../../contractor-mail/infrastructure/dkim-verifier.gateway.js'
import type { ResendMailGateway } from '../../contractor-mail/infrastructure/resend-mail.gateway.js'

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

export async function intakeCargoPreviewEmail(
  input: CargoPreviewEmailIntakeInput,
  dependencies: IntakeCargoPreviewEmailDependencies,
): Promise<CargoPreviewEmailIntakeResult> {
  void input
  void dependencies
  return { kind: 'not_a_preview' }
}
