/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: monta o ramo "XML de NF-e" do e-mail de entrada a partir do que o worker já tem (Resend, DKIM, banco). O MIME
 * é lido com PostalMime LIMITADO (cabeçalhos e profundidade), como no ramo da prévia; só os anexos saem daqui.
 */
import PostalMime from 'postal-mime'

import { MIME_HEADER_LIMITS } from '../../contractor-mail/domain/contractor-mail.constant.js'
import { parseSenderMailbox } from '../../contractor-mail/domain/sender-mailbox.policy.js'
import { ResendDownloadTooLargeError } from '../../contractor-mail/domain/resend-provider.error.js'
import type { VerifyDkimHeaderFromPort } from '../../contractor-mail/infrastructure/dkim-verifier.gateway.js'
import type {
  ReceivedResendEmail,
  ResendMailGateway,
} from '../../contractor-mail/infrastructure/resend-mail.gateway.js'
import {
  intakeNfeXmlEmail,
  type NfeXmlEmailIntakeResult,
} from '../application/intake-nfe-xml-email.use-case.js'
import type {
  ReceiptFile,
  ReceiptLogger,
  ReceiptRepositoryPort,
  ReceivedXmlImportGatewayPort,
} from '../application/nfe-xml-receipt.types.js'

const PARSE_OPTIONS = {
  attachmentEncoding: 'arraybuffer',
  maxHeadersSize: MIME_HEADER_LIMITS.maxSectionBytes,
  maxNestingDepth: 6,
} as const

/** O teto do provedor; o limite por arquivo do recibo é aplicado depois, na classificação. */
const MAX_RAW_BYTES = 25 * 1024 * 1024

export type NfeXmlEmailIntakePort = {
  intake(input: {
    readonly companyId: string
    readonly correlationId: string
    readonly delivery: { readonly isLastAttempt: boolean }
    readonly occurredAt: Date
    readonly providerEmailId: string
    readonly received: ReceivedResendEmail
    readonly replyDomain: string
  }): Promise<NfeXmlEmailIntakeResult>
}

export function createNfeXmlEmailIntake(dependencies: {
  readonly extraDomains?: readonly string[]
  readonly dkimVerifier: VerifyDkimHeaderFromPort
  readonly importGateway: ReceivedXmlImportGatewayPort
  readonly logger: ReceiptLogger
  readonly mailGateway: Pick<ResendMailGateway, 'downloadRawEmail'>
  readonly repository: ReceiptRepositoryPort
}): NfeXmlEmailIntakePort {
  return {
    intake: (input) =>
      intakeNfeXmlEmail(
        {
          cc: input.received.cc,
          companyId: input.companyId,
          correlationId: input.correlationId,
          delivery: input.delivery,
          extraDomains: dependencies.extraDomains ?? [],
          from: input.received.from,
          now: input.occurredAt,
          providerEmailId: input.providerEmailId,
          replyDomain: input.replyDomain,
          to: input.received.to,
        },
        {
          dkim: {
            verify: async (raw) => {
              const verification = await dependencies.dkimVerifier.verifyWithHeaderFrom(
                Buffer.from(raw),
              )
              return { alignment: verification.alignment, headerFrom: verification.headerFrom }
            },
          },
          downloadRaw: async () => {
            try {
              return await dependencies.mailGateway.downloadRawEmail({
                downloadUrl: input.received.raw.download_url,
                maxBytes: MAX_RAW_BYTES,
              })
            } catch (error: unknown) {
              if (error instanceof ResendDownloadTooLargeError) return undefined
              throw error
            }
          },
          extractAttachments: readAttachments,
          importGateway: dependencies.importGateway,
          logger: dependencies.logger,
          parseSenderAddress: (from) => {
            const address = parseSenderMailbox(from).address.trim()
            return /^[^\s@<>,]+@[^\s@<>,]+$/u.test(address) ? address : undefined
          },
          repository: dependencies.repository,
        },
      ),
  }
}

async function readAttachments(raw: Uint8Array): Promise<readonly ReceiptFile[]> {
  const email = await PostalMime.parse(raw, PARSE_OPTIONS)
  return email.attachments
    .filter((attachment) => attachment.filename !== null && attachment.filename !== undefined)
    .map((attachment) => ({
      bytes:
        typeof attachment.content === 'string'
          ? new TextEncoder().encode(attachment.content)
          : new Uint8Array(attachment.content),
      name: attachment.filename ?? '',
    }))
}
