/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (ADR-0094 §10, D6): o ramo "prévia" do e-mail de entrada, para mensagem ENCAMINHADA.
 * As barreiras vão da mais barata à mais cara, e cada recusa registra um código estável e para ali:
 * token e perfil → encaminhador na lista (antes de baixar) → janela de e-mails autenticados → MIME com teto
 * e com o cabeçalho medido → DKIM do encaminhador → `From` do MIME igual ao que a `mailauth` alinhou → remetente
 * original na lista → um anexo planilha. Só o download e o DKIM ficam atrás do contador de autenticados. O DKIM do contratante se perde no encaminhamento (risco aceito,
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
  RecentIntakeCounts,
} from './cargo-preview-email.types.js'
import { storeAndCreatePreview } from './create-cargo-preview-from-email.service.js'
import {
  createPreviewEmailRejecter,
  recordRateLimitedTrace,
  type PreviewEmailRejecter,
} from './create-preview-email-rejecter.service.js'
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

  const counts = await dependencies.repository.countRecentIntakes({
    companyId: input.companyId,
    contractorId: profile.contractorId,
    windowSeconds: PREVIEW_EMAIL_INTAKE_RATE_LIMIT.windowSeconds,
  })
  const gate = await passGates({ counts, dependencies, input, profile })
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

type GateContext = {
  readonly counts: RecentIntakeCounts
  readonly dependencies: IntakeCargoPreviewEmailDependencies
  readonly input: CargoPreviewEmailIntakeInput
  readonly profile: PreviewProfileRecord
}

/** As checagens baratas (perfil e encaminhador) rodam sempre; o teto de autenticados fecha o que custa. */
async function passGates(context: GateContext): Promise<PreviewContentGate> {
  const { counts, dependencies, input, profile } = context
  const { maxAuthenticated, maxUnauthenticated } = PREVIEW_EMAIL_INTAKE_RATE_LIMIT
  const reject = createPreviewEmailRejecter({
    input,
    isUnauthenticatedWindowFull: counts.unauthenticated >= maxUnauthenticated,
    profile,
    repository: dependencies.repository,
  })
  if (!profile.isPreviewReady) return reject(PREVIEW_EMAIL_REJECTION.previewNotEnabled)

  const providerFrom = readSingleMailboxAddress(input.received.from)
  if (
    providerFrom === undefined ||
    !isForwarderAllowed({ address: providerFrom, allowlist: profile.forwarderAllowlist })
  ) {
    return reject(PREVIEW_EMAIL_REJECTION.forwarderNotAllowed)
  }

  if (counts.authenticated >= maxAuthenticated) {
    await recordRateLimitedTrace({ input, profile, repository: dependencies.repository })
    return { contractorId: profile.contractorId, kind: 'rate_limited' }
  }
  return passMessageGates({ ...context, reject })
}

async function passMessageGates(
  context: GateContext & { readonly reject: PreviewEmailRejecter },
): Promise<PreviewContentGate> {
  const { dependencies, input, profile, reject } = context
  const raw = await downloadRaw(input, dependencies)
  if (raw === undefined) return reject(PREVIEW_EMAIL_REJECTION.rawEmailTooLarge)
  if (!hasBoundedMimeHeaders(raw)) return reject(PREVIEW_EMAIL_REJECTION.mimeUnreadable)

  const { alignment, headerFrom } = await dependencies.dkimVerifier.verifyWithHeaderFrom(raw)
  if (alignment === 'unverifiable') {
    if (!input.delivery.isLastAttempt) throw new CargoPreviewEmailDkimUnverifiableError()
    return reject(PREVIEW_EMAIL_REJECTION.forwarderDkimUnverifiable, { dkimResult: alignment })
  }
  if (alignment !== 'aligned') {
    return reject(PREVIEW_EMAIL_REJECTION.forwarderDkimNotAligned, { dkimResult: alignment })
  }

  return passPreviewContentGates({ dkimResult: alignment, headerFrom, profile, raw, reject })
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
