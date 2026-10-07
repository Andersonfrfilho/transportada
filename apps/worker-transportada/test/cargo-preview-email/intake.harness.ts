/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o ramo da prévia com tudo de fora trocado por dublês — Resend, DKIM, bucket e banco.
 * Cada dublê conta o que recebeu, e é assim que o contrato prova o que NÃO aconteceu (download,
 * escrita no bucket, prévia) quando uma barreira recusa.
 */
import type {
  AcceptedRecord,
  CargoPreviewEmailIntakeInput,
  CreatePreviewOutcome,
  PreviewProfileRecord,
  RateLimitedRecord,
  RecentIntakeCounts,
  RejectionRecord,
} from '../../src/cargo-preview-email/application/cargo-preview-email.types.js'
import {
  intakeCargoPreviewEmail,
  type IntakeCargoPreviewEmailDependencies,
} from '../../src/cargo-preview-email/application/intake-cargo-preview-email.use-case.js'
import type { DkimAlignmentResult } from '../../src/contractor-mail/domain/dkim-alignment.policy.js'
import { buildMime, gmailForwardText } from './mime.fixture.js'

export const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
export const CONTRACTOR_ID = '22222222-2222-4222-8222-222222222222'
export const PROVIDER_EMAIL_ID = 'email-0001-provider-id'
export const FORWARDER = 'equipe@transportadora.example'
export const ORIGINAL = 'fr@contratante.example'
export const REPLY_DOMAIN = 'entrada.example'
export const TOKEN = 'previewtoken234567abcdefgh'
export const FILE_OBJECT_ID = '33333333-3333-4333-8333-333333333333'

export const READY_PROFILE: PreviewProfileRecord = {
  contractorId: CONTRACTOR_ID,
  forwarderAllowlist: [FORWARDER],
  isPreviewReady: true,
  senderAllowlist: [ORIGINAL],
}

export function validRawEmail(): string {
  return buildMime({
    attachments: [{ fileName: 'FR-06-10.xlsm' }],
    from: `Equipe <${FORWARDER}>`,
    text: gmailForwardText({ from: `FR <${ORIGINAL}>` }),
  })
}

export type Calls = {
  readonly counts: unknown[]
  readonly created: AcceptedRecord[]
  readonly deleted: string[]
  readonly dkimVerifications: Buffer[]
  readonly downloads: { readonly maxBytes: number | undefined }[]
  readonly rateLimited: RateLimitedRecord[]
  readonly rejections: RejectionRecord[]
  readonly stored: { readonly body: Uint8Array; readonly key: string }[]
}

export type HarnessOptions = {
  readonly createOutcome?: CreatePreviewOutcome | (() => never)
  readonly dkim?: DkimAlignmentResult
  readonly download?: () => Promise<Buffer>
  /** Última entrega da fila: a recusa por DKIM sem veredito só é gravada aqui. */
  readonly isLastAttempt?: boolean
  readonly profiles?: readonly PreviewProfileRecord[]
  readonly rawEmail?: string
  readonly recentIntakes?: Partial<RecentIntakeCounts>
  readonly received?: Partial<CargoPreviewEmailIntakeInput['received']>
  readonly storeFails?: boolean
}

export function runIntake(options: HarnessOptions = {}) {
  const calls: Calls = {
    counts: [],
    created: [],
    deleted: [],
    dkimVerifications: [],
    downloads: [],
    rateLimited: [],
    rejections: [],
    stored: [],
  }
  const raw = Buffer.from(options.rawEmail ?? validRawEmail())
  const dependencies: IntakeCargoPreviewEmailDependencies = {
    dkimVerifier: {
      verify: async (rawMessage) => {
        calls.dkimVerifications.push(rawMessage)
        return options.dkim ?? 'aligned'
      },
    },
    mailGateway: {
      downloadRawEmail: async (input) => {
        calls.downloads.push({ maxBytes: input.maxBytes })
        return options.download === undefined ? raw : options.download()
      },
    },
    newId: () => FILE_OBJECT_ID,
    now: () => new Date('2026-10-06T15:00:00.000Z'),
    repository: {
      countRecentIntakes: async (query) => {
        calls.counts.push(query)
        return { authenticated: 0, unauthenticated: 0, ...options.recentIntakes }
      },
      createPreview: async (record) => {
        calls.created.push(record)
        const outcome = options.createOutcome ?? { kind: 'created', previewId: 'preview-1' }
        return typeof outcome === 'function' ? outcome() : outcome
      },
      findProfilesByTokenHashes: async () => options.profiles ?? [READY_PROFILE],
      hasIntake: async () => false,
      recordRateLimited: async (record) => {
        calls.rateLimited.push(record)
      },
      recordRejection: async (record) => {
        calls.rejections.push(record)
      },
    },
    storage: {
      deleteObject: async ({ key }) => {
        calls.deleted.push(key)
      },
      storeObject: async ({ body, key }) => {
        if (options.storeFails === true) throw new Error('bucket indisponível')
        calls.stored.push({ body, key })
      },
    },
    storageBucket: 'transportada-private',
    storageProvider: 'minio',
  }
  const input: CargoPreviewEmailIntakeInput = {
    companyId: COMPANY_ID,
    correlationId: 'corr-0001',
    delivery: { isLastAttempt: options.isLastAttempt ?? false },
    occurredAt: new Date('2026-10-06T14:59:00.000Z'),
    providerEmailId: PROVIDER_EMAIL_ID,
    received: {
      from: `Equipe <${FORWARDER}>`,
      headers: {},
      message_id: '<outer@forwarder.example>',
      raw: { download_url: 'https://cdn.resend.com/raw/1', expires_at: '2099-01-01T00:00:00Z' },
      subject: 'Fwd: previa',
      text: 'segue',
      to: [`${TOKEN}@${REPLY_DOMAIN}`],
      ...options.received,
    },
    replyDomain: REPLY_DOMAIN,
  }
  return { calls, raw, result: intakeCargoPreviewEmail(input, dependencies) }
}
