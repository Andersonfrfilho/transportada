/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (ADR-0094 §10, D6): o ramo "prévia" do e-mail de entrada, para mensagem ENCAMINHADA.
 * As barreiras vão da mais barata à mais cara, e cada recusa registra um código estável e para ali:
 * token e perfil → janela de e-mails → encaminhador na lista (antes de baixar) → MIME com teto →
 * DKIM do encaminhador → `From` do MIME (o que o DKIM cobre) → remetente original na lista → um anexo
 * planilha. O DKIM do contratante se perde no encaminhamento (risco aceito, `SECURITY.md`): o remetente
 * original é informação, nunca autenticação. A planilha nunca é aberta aqui — os bytes entram na prévia
 * pelo mesmo contrato do upload e o worker de prévia a lê, com os tetos e a `worker_thread`.
 */
import type { DkimAlignmentResult } from '../../contractor-mail/domain/dkim-alignment.policy.js'
import { ResendDownloadTooLargeError } from '../../contractor-mail/domain/resend-provider.error.js'
import type { CargoPreviewEmailRejectionCode } from '../../shared/cargo-preview.constant.js'
import {
  PREVIEW_EMAIL_INTAKE_RATE_LIMIT,
  PREVIEW_EMAIL_MAX_RAW_BYTES,
} from '../domain/cargo-preview-email.constant.js'
import {
  hashPreviewInboundToken,
  extractPreviewTokenCandidates,
} from '../domain/preview-inbound-token.policy.js'
import { readSingleMailboxAddress } from '../domain/mailbox-address.policy.js'
import { selectPreviewWorkbook } from '../domain/preview-email-attachment.policy.js'
import {
  isForwarderAllowed,
  isOriginalSenderAllowed,
} from '../domain/preview-sender-allowlist.policy.js'
import type {
  CargoPreviewEmailIntakeInput,
  CargoPreviewEmailIntakePort,
  CargoPreviewEmailIntakeResult,
  CargoPreviewEmailRepositoryPort,
  IntakeCargoPreviewEmailDependencies,
  PreviewProfileRecord,
  VerifiedPreviewEmail,
} from './cargo-preview-email.types.js'
import { storeAndCreatePreview } from './create-cargo-preview-from-email.service.js'
import { parseForwardedEmail } from './parse-forwarded-email.service.js'

export type { IntakeCargoPreviewEmailDependencies } from './cargo-preview-email.types.js'

type Gate =
  | { readonly kind: 'passed'; readonly verified: VerifiedPreviewEmail }
  | CargoPreviewEmailIntakeResult

export async function intakeCargoPreviewEmail(
  input: CargoPreviewEmailIntakeInput,
  dependencies: IntakeCargoPreviewEmailDependencies,
): Promise<CargoPreviewEmailIntakeResult> {
  const profile = await resolveProfile(input, dependencies.repository)
  if (profile === undefined) return { kind: 'not_a_preview' }

  const since = new Date(
    dependencies.now().getTime() - PREVIEW_EMAIL_INTAKE_RATE_LIMIT.windowSeconds * 1000,
  )
  const recent = await dependencies.repository.countRecentIntakes({
    companyId: input.companyId,
    contractorId: profile.contractorId,
    since,
  })
  if (recent >= PREVIEW_EMAIL_INTAKE_RATE_LIMIT.maxIntakes) {
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

async function passGates(
  input: CargoPreviewEmailIntakeInput,
  profile: PreviewProfileRecord,
  dependencies: IntakeCargoPreviewEmailDependencies,
): Promise<Gate> {
  const reject = rejecter(input, profile, dependencies.repository)
  if (!profile.isPreviewReady) return reject('PREVIEW_NOT_ENABLED')

  const providerFrom = readSingleMailboxAddress(input.received.from)
  if (
    providerFrom === undefined ||
    !isForwarderAllowed({ address: providerFrom, allowlist: profile.forwarderAllowlist })
  ) {
    return reject('FORWARDER_NOT_ALLOWED')
  }

  const raw = await downloadRaw(input, dependencies)
  if (raw === undefined) return reject('RAW_EMAIL_TOO_LARGE')

  const dkimResult = await dependencies.dkimVerifier.verify(raw)
  if (dkimResult !== 'aligned') return reject('FORWARDER_DKIM_NOT_ALIGNED', { dkimResult })

  return passContentGates({ dkimResult, profile, raw, reject })
}

/** Depois do DKIM: o `From` do MIME, o remetente original e o anexo — todos lidos do que o DKIM cobre. */
async function passContentGates(context: {
  readonly dkimResult: DkimAlignmentResult
  readonly profile: PreviewProfileRecord
  readonly raw: Buffer
  readonly reject: ReturnType<typeof rejecter>
}): Promise<Gate> {
  const { dkimResult, profile, raw, reject } = context
  const parsed = await parseForwardedEmail(raw)
  const withDkim = { dkimResult }
  if (parsed?.forwarderAddress === undefined) return reject('MIME_UNREADABLE', withDkim)
  if (
    !isForwarderAllowed({ address: parsed.forwarderAddress, allowlist: profile.forwarderAllowlist })
  ) {
    return reject('FORWARDER_NOT_ALLOWED', withDkim)
  }

  const original = parsed.originalSender
  if (original.kind === 'missing') return reject('ORIGINAL_SENDER_MISSING', withDkim)
  if (original.kind === 'ambiguous') return reject('ORIGINAL_SENDER_AMBIGUOUS', withDkim)
  const read = { dkimResult, isOriginalSenderRead: true }
  if (!isOriginalSenderAllowed({ address: original.address, allowlist: profile.senderAllowlist })) {
    return reject('ORIGINAL_SENDER_NOT_ALLOWED', read)
  }

  const workbook = selectPreviewWorkbook(parsed.attachments)
  if (workbook.kind === 'rejected') return reject(workbook.code, read)
  return { kind: 'passed', verified: { dkimResult, file: workbook, raw } }
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

/** Registra a recusa (só código e resultado do DKIM) e devolve o resultado do ramo. */
function rejecter(
  input: CargoPreviewEmailIntakeInput,
  profile: PreviewProfileRecord,
  repository: CargoPreviewEmailRepositoryPort,
) {
  return async (
    reason: CargoPreviewEmailRejectionCode,
    detail: {
      readonly dkimResult?: DkimAlignmentResult
      readonly isOriginalSenderRead?: boolean
    } = {},
  ): Promise<CargoPreviewEmailIntakeResult> => {
    await repository.recordRejection({
      companyId: input.companyId,
      contractorId: profile.contractorId,
      ...(detail.dkimResult === undefined ? {} : { dkimResult: detail.dkimResult }),
      isOriginalSenderRead: detail.isOriginalSenderRead ?? false,
      providerEmailId: input.providerEmailId,
      reason,
      receivedAt: input.occurredAt,
    })
    return { contractorId: profile.contractorId, kind: 'rejected', reason }
  }
}

/** O que o trilho de e-mail enxerga: a checagem barata antes do Resend e a decisão do ramo. */
export function createCargoPreviewEmailIntake(
  dependencies: Omit<IntakeCargoPreviewEmailDependencies, 'newId' | 'now'> &
    Partial<Pick<IntakeCargoPreviewEmailDependencies, 'newId' | 'now'>>,
): CargoPreviewEmailIntakePort {
  const complete: IntakeCargoPreviewEmailDependencies = {
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
    ...dependencies,
  }
  return {
    hasIntake: (input) => complete.repository.hasIntake(input),
    intake: (input) => intakeCargoPreviewEmail(input, complete),
  }
}
