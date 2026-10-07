/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (ADR-0094 §10, D6): o ramo "prévia" do e-mail de entrada, para mensagem ENCAMINHADA.
 * As barreiras vão da mais barata à mais cara, e cada recusa registra um código estável e para ali:
 * token e perfil → janela de e-mails → encaminhador na lista (antes de baixar) → MIME com teto e com o
 * cabeçalho medido → DKIM do encaminhador → `From` do MIME (o que o DKIM cobre) → remetente original na
 * lista → um anexo planilha. O DKIM do contratante se perde no encaminhamento (risco aceito,
 * `SECURITY.md`): o remetente original é informação, nunca autenticação. A planilha nunca é aberta aqui —
 * os bytes entram na prévia pelo mesmo contrato do upload e o worker de prévia a lê, com os tetos e a
 * `worker_thread`.
 */
import { hasBoundedMimeHeaders } from '../../contractor-mail/domain/mime-header-bounds.policy.js'
import { ResendDownloadTooLargeError } from '../../contractor-mail/domain/resend-provider.error.js'
import {
  PREVIEW_EMAIL_INTAKE_RATE_LIMIT,
  PREVIEW_EMAIL_MAX_RAW_BYTES,
  PREVIEW_EMAIL_REJECTION,
} from '../domain/cargo-preview-email.constant.js'
import { CargoPreviewEmailDkimUnverifiableError } from '../domain/cargo-preview-email.error.js'
import { readSingleMailboxAddress } from '../domain/mailbox-address.policy.js'
import {
  hashPreviewInboundToken,
  extractPreviewTokenCandidates,
} from '../domain/preview-inbound-token.policy.js'
import { isForwarderAllowed } from '../domain/preview-sender-allowlist.policy.js'
import type {
  CargoPreviewEmailIntakeInput,
  CargoPreviewEmailIntakePort,
  CargoPreviewEmailIntakeResult,
  CargoPreviewEmailRepositoryPort,
  IntakeCargoPreviewEmailDependencies,
  PreviewProfileRecord,
} from './cargo-preview-email.types.js'
import { storeAndCreatePreview } from './create-cargo-preview-from-email.service.js'
import { createPreviewEmailRejecter } from './create-preview-email-rejecter.service.js'
import {
  passPreviewContentGates,
  type PreviewContentGate,
} from './pass-preview-content-gates.service.js'

export type { IntakeCargoPreviewEmailDependencies } from './cargo-preview-email.types.js'

export async function intakeCargoPreviewEmail(
  input: CargoPreviewEmailIntakeInput,
  dependencies: IntakeCargoPreviewEmailDependencies,
): Promise<CargoPreviewEmailIntakeResult> {
  const profile = await resolveProfile(input, dependencies.repository)
  if (profile === undefined) return { kind: 'not_a_preview' }

  if (await isRateLimited(input, profile, dependencies.repository)) {
    return { contractorId: profile.contractorId, kind: 'rate_limited' }
  }

  const gate = await passGates(input, profile, dependencies)
  if (gate.kind !== 'passed') return gate
  return storeAndCreatePreview({ dependencies, input, profile, verified: gate.verified })
}

async function resolveProfile(
  input: CargoPreviewEmailIntakeInput,
  repository: CargoPreviewEmailRepositoryPort,
): Promise<PreviewProfileRecord | undefined> {
  const tokens = extractPreviewTokenCandidates({
    ccAddresses: input.received.cc ?? [],
    replyDomain: input.replyDomain,
    toAddresses: input.received.to,
  })
  if (tokens.length === 0) return undefined
  const profiles = await repository.findProfilesByTokenHashes({
    companyId: input.companyId,
    tokenHashes: tokens.map(hashPreviewInboundToken),
  })
  return profiles.length === 1 ? profiles[0] : undefined
}

/** Fechada a janela, o excesso deixa um rastro (uma linha por janela) e nada mais é feito com a mensagem. */
async function isRateLimited(
  input: CargoPreviewEmailIntakeInput,
  profile: PreviewProfileRecord,
  repository: CargoPreviewEmailRepositoryPort,
): Promise<boolean> {
  const { maxAuthenticated, maxUnauthenticated, windowSeconds } = PREVIEW_EMAIL_INTAKE_RATE_LIMIT
  const scope = { companyId: input.companyId, contractorId: profile.contractorId }
  const counts = await repository.countRecentIntakes({ ...scope, windowSeconds })
  if (counts.authenticated < maxAuthenticated && counts.unauthenticated < maxUnauthenticated) {
    return false
  }
  await repository.recordRateLimited({
    ...scope,
    providerEmailId: input.providerEmailId,
    receivedAt: input.occurredAt,
    windowSeconds,
  })
  return true
}

async function passGates(
  input: CargoPreviewEmailIntakeInput,
  profile: PreviewProfileRecord,
  dependencies: IntakeCargoPreviewEmailDependencies,
): Promise<PreviewContentGate> {
  const reject = createPreviewEmailRejecter({ input, profile, repository: dependencies.repository })
  if (!profile.isPreviewReady) return reject(PREVIEW_EMAIL_REJECTION.previewNotEnabled)

  const providerFrom = readSingleMailboxAddress(input.received.from)
  if (
    providerFrom === undefined ||
    !isForwarderAllowed({ address: providerFrom, allowlist: profile.forwarderAllowlist })
  ) {
    return reject(PREVIEW_EMAIL_REJECTION.forwarderNotAllowed)
  }

  const raw = await downloadRaw(input, dependencies)
  if (raw === undefined) return reject(PREVIEW_EMAIL_REJECTION.rawEmailTooLarge)
  if (!hasBoundedMimeHeaders(raw)) return reject(PREVIEW_EMAIL_REJECTION.mimeUnreadable)

  const dkimResult = await dependencies.dkimVerifier.verify(raw)
  if (dkimResult === 'unverifiable') {
    if (!input.delivery.isLastAttempt) throw new CargoPreviewEmailDkimUnverifiableError()
    return reject(PREVIEW_EMAIL_REJECTION.forwarderDkimUnverifiable, { dkimResult })
  }
  if (dkimResult !== 'aligned') {
    return reject(PREVIEW_EMAIL_REJECTION.forwarderDkimNotAligned, { dkimResult })
  }

  return passPreviewContentGates({ dkimResult, profile, raw, reject })
}

async function downloadRaw(
  input: CargoPreviewEmailIntakeInput,
  dependencies: IntakeCargoPreviewEmailDependencies,
): Promise<Buffer | undefined> {
  try {
    return await dependencies.mailGateway.downloadRawEmail({
      downloadUrl: input.received.raw.download_url,
      maxBytes: PREVIEW_EMAIL_MAX_RAW_BYTES,
    })
  } catch (error: unknown) {
    if (error instanceof ResendDownloadTooLargeError) return undefined
    throw error
  }
}

/** O que o trilho de e-mail enxerga: a checagem barata antes do Resend e a decisão do ramo. */
export function createCargoPreviewEmailIntake(
  dependencies: Omit<IntakeCargoPreviewEmailDependencies, 'newId'> &
    Partial<Pick<IntakeCargoPreviewEmailDependencies, 'newId'>>,
): CargoPreviewEmailIntakePort {
  const complete: IntakeCargoPreviewEmailDependencies = {
    newId: () => crypto.randomUUID(),
    ...dependencies,
  }
  return {
    hasIntake: (input) => complete.repository.hasIntake(input),
    intake: (input) => intakeCargoPreviewEmail(input, complete),
  }
}
