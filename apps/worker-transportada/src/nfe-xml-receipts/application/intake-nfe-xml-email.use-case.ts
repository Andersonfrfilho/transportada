/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: o ramo "XML de NF-e" do e-mail de entrada, para a caixa `notas@<domínio de entrada>`. As barreiras vão da
 * mais barata à mais cara, e cada recusa grava um recibo com o motivo e para ali: caixa certa → entrega repetida →
 * MIME com teto e cabeçalho medido → DKIM alinhado ao `From` → remetente é pessoa da empresa com permissão de
 * importar → ao menos um `.xml` ou `.zip`. Volume nunca recusa: todos os anexos aceitos entram numa importação só, e o
 * worker de importação processa em lotes. O resumo ao remetente sai depois, pelo ciclo de respostas.
 */
import { hasBoundedMimeHeaders } from '../../contractor-mail/domain/mime-header-bounds.policy.js'
import {
  NFE_XML_MAILBOX_AUTOMATION_JOB,
  NFE_XML_MAILBOX_LOCAL_PART,
  NFE_XML_RECEIPT_LOG,
  NFE_XML_RECEIPT_REJECTION,
  type NfeXmlReceiptRejection,
} from '../domain/nfe-xml-receipt.constant.js'
import { convertRarToZip } from '../domain/rar-to-zip.policy.js'
import { chunkOversizedZip } from '../domain/zip-queue-chunking.policy.js'
import { classifyReceivedFiles } from '../domain/received-xml-files.policy.js'
import type {
  ReceiptFile,
  ReceiptLogger,
  ReceiptRepositoryPort,
  ReceivedXmlImportGatewayPort,
} from './nfe-xml-receipt.types.js'

/** Mesmo ator sintético da importação automática (cópia por valor): tem vínculo ativo em cada empresa. */
export const NFE_XML_MAILBOX_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000006'

export type NfeXmlEmailIntakeInput = {
  readonly companyId: string
  readonly correlationId: string
  readonly delivery: { readonly isLastAttempt: boolean }
  readonly from: string
  readonly now: Date
  readonly providerEmailId: string
  readonly replyDomain: string
  /** Domínios extras em que `notas@` também vale (apelido curto da empresa que encaminha para a entrada). */
  readonly extraDomains?: readonly string[]
  readonly to: readonly string[]
  readonly cc?: readonly string[] | undefined
}

export type NfeXmlEmailIntakeResult =
  | { readonly kind: 'already_recorded' }
  | { readonly kind: 'imported'; readonly importId: string; readonly files: number }
  | { readonly kind: 'not_xml_mailbox' }
  | { readonly kind: 'rejected'; readonly reason: NfeXmlReceiptRejection }

export type NfeXmlEmailIntakeDependencies = {
  /** `unverifiable` pede nova tentativa até a última; o resto decide na hora. */
  readonly dkim: {
    verify(raw: Uint8Array): Promise<{
      readonly alignment: 'absent' | 'aligned' | 'not_aligned' | 'unverifiable'
      readonly headerFrom: readonly string[]
    }>
  }
  readonly downloadRaw: (input: {
    readonly providerEmailId: string
  }) => Promise<Uint8Array | undefined>
  readonly extractAttachments: (raw: Uint8Array) => Promise<readonly ReceiptFile[]>
  readonly importGateway: ReceivedXmlImportGatewayPort
  readonly logger: ReceiptLogger
  readonly parseSenderAddress: (from: string) => string | undefined
  readonly repository: ReceiptRepositoryPort
}

export class NfeXmlEmailDkimUnverifiableError extends Error {
  public constructor() {
    super('DKIM could not be verified yet')
    this.name = 'NfeXmlEmailDkimUnverifiableError'
  }
}

function addressedToMailbox(input: NfeXmlEmailIntakeInput): boolean {
  const domains = [input.replyDomain, ...(input.extraDomains ?? [])].map((domain) =>
    domain.trim().toLowerCase(),
  )
  return [...input.to, ...(input.cc ?? [])].some((raw) => {
    const match = /<?([^<>\s@]+)@([^<>\s@]+)>?\s*$/u.exec(raw.trim())
    return (
      match !== null &&
      match[1]?.toLowerCase() === NFE_XML_MAILBOX_LOCAL_PART &&
      domains.includes(match[2]?.toLowerCase() ?? '')
    )
  })
}

export async function intakeNfeXmlEmail(
  input: NfeXmlEmailIntakeInput,
  dependencies: NfeXmlEmailIntakeDependencies,
): Promise<NfeXmlEmailIntakeResult> {
  if (!addressedToMailbox(input)) return { kind: 'not_xml_mailbox' }

  const sender = dependencies.parseSenderAddress(input.from)
  // Sem remetente legível não há a quem responder nem como autorizar: nada é gravado além do log.
  if (sender === undefined) {
    dependencies.logger.warn(NFE_XML_RECEIPT_LOG.rejected, {
      channel: 'email',
      companyId: input.companyId,
      reason: NFE_XML_RECEIPT_REJECTION.senderNotAllowed,
    })
    return { kind: 'rejected', reason: NFE_XML_RECEIPT_REJECTION.senderNotAllowed }
  }

  const reject = async (reason: NfeXmlReceiptRejection, receiptId: string) => {
    await dependencies.repository.markRejected({ now: input.now, reason, receiptId })
    dependencies.logger.warn(NFE_XML_RECEIPT_LOG.rejected, {
      channel: 'email',
      companyId: input.companyId,
      correlationId: input.correlationId,
      reason,
    })
    return { kind: 'rejected', reason } as const
  }

  const recorded = await dependencies.repository.recordReceipt({
    channel: 'email',
    companyId: input.companyId,
    now: input.now,
    providerMessageId: input.providerEmailId,
    sender,
    status: 'processing',
  })
  if (!recorded.created) return { kind: 'already_recorded' }
  const { receiptId } = recorded

  const raw = await dependencies.downloadRaw({ providerEmailId: input.providerEmailId })
  if (raw === undefined) return reject(NFE_XML_RECEIPT_REJECTION.tooLarge, receiptId)
  if (!hasBoundedMimeHeaders(Buffer.from(raw))) {
    return reject(NFE_XML_RECEIPT_REJECTION.noAcceptedFile, receiptId)
  }

  const dkim = await dependencies.dkim.verify(raw)
  if (dkim.alignment === 'unverifiable') {
    // O veredito pode vir na próxima entrega: apaga o recibo para a repetição não achar "já gravado".
    if (!input.delivery.isLastAttempt) {
      await dependencies.repository.discardReceipt({ receiptId })
      throw new NfeXmlEmailDkimUnverifiableError()
    }
    return reject(NFE_XML_RECEIPT_REJECTION.senderNotAuthenticated, receiptId)
  }
  const signedFrom = dkim.headerFrom.map((address) => address.toLowerCase())
  if (dkim.alignment !== 'aligned' || !signedFrom.includes(sender.toLowerCase())) {
    return reject(NFE_XML_RECEIPT_REJECTION.senderNotAuthenticated, receiptId)
  }

  const authorized = await dependencies.repository.findAuthorizedSenderByEmail({
    companyId: input.companyId,
    email: sender,
  })
  if (authorized === undefined) return reject(NFE_XML_RECEIPT_REJECTION.senderNotAllowed, receiptId)

  const attachments = await dependencies.extractAttachments(raw)
  const { accepted } = classifyReceivedFiles(
    attachments.map((file) => ({ ...file, sizeBytes: file.bytes.byteLength })),
  )
  if (accepted.length === 0) return reject(NFE_XML_RECEIPT_REJECTION.noAcceptedFile, receiptId)

  const { importId } = await dependencies.importGateway.createImport({
    automationJob: NFE_XML_MAILBOX_AUTOMATION_JOB,
    companyId: input.companyId,
    correlationId: input.correlationId,
    files: (
      await Promise.all(
        accepted.map(async (file) =>
          chunkOversizedZip(await convertRarToZip({ bytes: file.bytes, name: file.name })),
        ),
      )
    )
      .flat()
      .map((file) => ({ bytes: file.bytes, name: file.name })),
    receiptId,
    receivedFrom: sender,
    receivedVia: 'email',
    requestedByUserId: NFE_XML_MAILBOX_ACTOR_USER_ID,
    ...(authorized.restrictedContractorId === undefined
      ? {}
      : { restrictedContractorId: authorized.restrictedContractorId }),
  })
  dependencies.logger.info(NFE_XML_RECEIPT_LOG.imported, {
    channel: 'email',
    companyId: input.companyId,
    correlationId: input.correlationId,
    files: accepted.length,
    importId,
  })
  return { files: accepted.length, importId, kind: 'imported' }
}
