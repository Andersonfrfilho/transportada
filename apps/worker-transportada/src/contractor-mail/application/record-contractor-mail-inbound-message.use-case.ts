/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T010: o trilho `contractor-mail-inbound.v1`, até o DKIM. (a) abre a credencial; (b)
 * busca o e-mail recebido; (c) descobre os candidatos a token pelo local-part de `to`/`cc` casados
 * com o `replyDomain`, e acha a(s) conversa(s) por `(companyId, hash) IN (...)` — sem exatamente uma,
 * descarta com contador, sem gravar corpo; (d) baixa o MIME bruto e grava no bucket privado, com
 * `sha256`, antes de qualquer interpretação (RF4); (e) verifica o DKIM; (f) grava a mensagem
 * `inbound`, com `interpretation` sempre nulo — a decisão (RF5/RF6) é da T019/T020, não daqui.
 */
import { createHash } from 'node:crypto'

import { RAW_EMAIL_MIME_TYPE } from '../domain/contractor-mail.constant.js'
import { hasBoundedMimeHeaders } from '../domain/mime-header-bounds.policy.js'
import { buildRawEmailObjectKey } from '../domain/raw-email-object-key.policy.js'
import { hashReplyToken } from '../domain/reply-token.policy.js'
import { resolveConversationDkimResult } from '../domain/conversation-sender-identity.policy.js'
import { parseSenderMailbox } from '../domain/sender-mailbox.policy.js'
import { extractReplyTokenCandidates } from '../domain/recipient-reply-token.policy.js'
import { ContractorMailInboundSettingsMissingError } from '../domain/contractor-mail-inbound.error.js'
import { DKIM_ALIGNMENT_RESULT, type DkimAlignmentResult } from '../domain/dkim-alignment.policy.js'
import type { VerifyDkimHeaderFromPort } from '../infrastructure/dkim-verifier.gateway.js'
import type {
  CargoPreviewEmailIntakePort,
  CargoPreviewEmailIntakeResult,
} from '../../cargo-preview-email/application/cargo-preview-email.types.js'
import type { InboundConversationAttachmentsPort } from '../../occurrence-conversation/application/inbound-mail-attachments.service.js'
import type { ContractorMailCredentialSecretService } from './contractor-mail-credential-secret.service.js'
import type {
  ContractorMailInboundSettingsRecord,
  ContractorMailInboundWorkerRepository,
} from '../infrastructure/drizzle-contractor-mail-inbound-worker.repository.js'
import type {
  ReceivedResendEmail,
  ResendMailGateway,
} from '../infrastructure/resend-mail.gateway.js'
import type { ContractorMailInboundEnvelopeV1 } from '../../messaging/contractor-mail-inbound-envelope.schema.js'

/** RF4/CHECK do banco: `body_text`/`subject` não podem ser vazios. */
const FALLBACK_BODY_TEXT = '(sem corpo em texto simples)'
const FALLBACK_SUBJECT = '(sem assunto)'
const IN_REPLY_TO_HEADER = 'in-reply-to'

export type StoreRawEmailPort = {
  storeObject(input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }): Promise<unknown>
}

export type RecordContractorMailInboundMessageDependencies = {
  /** Spec 183 T702c1: os anexos do e-mail que viram anexo da mensagem da conversa. */
  readonly conversationAttachments: InboundConversationAttachmentsPort
  readonly dkimVerifier: VerifyDkimHeaderFromPort
  readonly mailGateway: ResendMailGateway
  /** Spec 237 T4.6: o ramo da prévia encaminhada; só decide a mensagem que casa o token de um perfil. */
  readonly previewIntake: CargoPreviewEmailIntakePort
  readonly repository: ContractorMailInboundWorkerRepository
  readonly secretService: ContractorMailCredentialSecretService
  readonly storage: StoreRawEmailPort
  readonly storageBucket: string
  readonly storageProvider: string
}

/**
 * Revisão do `architect`: `token_unknown` cobre tanto "nenhum candidato casou" quanto "nenhuma
 * conversa achada" — `multiple_matches` é o caso novo, quando mais de uma conversa bate com os
 * candidatos extraídos (duas contas do mesmo domínio, por exemplo). Nos dois casos o corpo não é
 * gravado, e o único registro é o contador do log.
 */
export type RecordContractorMailInboundMessageResult =
  | { readonly outcome: 'already_recorded' }
  | { readonly outcome: 'discarded'; readonly reason: 'multiple_matches' | 'token_unknown' }
  | {
      /** Spec 237 T4.6: a prévia por e-mail encaminhado decidiu — aceita, recusada ou ignorada por excesso. */
      readonly outcome: 'preview'
      readonly preview: Extract<
        CargoPreviewEmailIntakeResult,
        { readonly kind: 'accepted' | 'rate_limited' | 'rejected' | 'replayed_existing' }
      >
    }
  | {
      /** Spec 183 T702c1: só contagem — o nome do arquivo nunca sai daqui. */
      readonly attachments: { readonly linked: number; readonly skipped: number }
      readonly dkimResult: DkimAlignmentResult
      readonly outcome: 'recorded'
      readonly threadId: string
    }

/** Spec 237 T4.7a: sem a informação da fila, a entrega vale como a primeira (o DKIM sem veredito repete). */
const FIRST_DELIVERY = { isLastAttempt: false } as const

export async function recordContractorMailInboundMessage(
  envelope: ContractorMailInboundEnvelopeV1,
  dependencies: RecordContractorMailInboundMessageDependencies,
  delivery: { readonly isLastAttempt: boolean } = FIRST_DELIVERY,
): Promise<RecordContractorMailInboundMessageResult> {
  const { companyId } = envelope
  const { providerEmailId } = envelope.payload

  // Idempotência: reentrega da mesma mensagem depois de um `ack` perdido não baixa nem grava de
  // novo — o mesmo `provider_email_id` já virou uma mensagem.
  const existingMessage = await dependencies.repository.findMessageByProviderEmailId({
    companyId,
    providerEmailId,
  })
  if (existingMessage !== undefined) return { outcome: 'already_recorded' }
  if (await dependencies.previewIntake.hasIntake({ companyId, providerEmailId })) {
    return { outcome: 'already_recorded' }
  }

  const settings = await dependencies.repository.findSettingsByCompanyId({ companyId })
  if (settings === undefined) {
    // Permanente (revisão do `architect`): reentregar não faz a configuração aparecer.
    throw new ContractorMailInboundSettingsMissingError(companyId)
  }

  const secret = await dependencies.secretService.decrypt({
    companyId,
    envelope: settings.secretEnvelope,
    settingsId: settings.id,
  })

  const received = await dependencies.mailGateway.fetchReceivedEmail({
    apiKey: secret.apiKey,
    emailId: providerEmailId,
  })

  const candidateTokens = extractReplyTokenCandidates({
    ccAddresses: received.cc ?? [],
    replyDomain: settings.replyDomain,
    toAddresses: received.to,
  })
  const threads =
    candidateTokens.length === 0
      ? []
      : await dependencies.repository.findThreadsByReplyTokenHashes({
          companyId,
          replyTokenHashes: candidateTokens.map(hashReplyToken),
        })
  const distinctThreads = dedupeById(threads)

  if (distinctThreads.length === 0) {
    return decideWithoutConversation({ delivery, dependencies, envelope, received, settings })
  }
  if (distinctThreads.length > 1) return { outcome: 'discarded', reason: 'multiple_matches' }
  const thread = distinctThreads[0]!

  const rawMessage = await dependencies.mailGateway.downloadRawEmail({
    downloadUrl: received.raw.download_url,
  })
  const sha256 = createHash('sha256').update(rawMessage).digest('hex')
  const objectKey = buildRawEmailObjectKey({ companyId, providerEmailId })

  await dependencies.storage.storeObject({
    body: new Uint8Array(rawMessage),
    bucket: dependencies.storageBucket,
    contentLength: rawMessage.byteLength,
    contentType: RAW_EMAIL_MIME_TYPE,
    key: objectKey,
    sha256,
  })

  /**
   * Spec 237 T4.7a: cabeçalho fora do limite nunca chega ao verificador de DKIM nem ao leitor de MIME — é a
   * mensagem hostil que o `addressparser` quadrático travaria. Grava como "sem assinatura" (o mesmo que a
   * `mailauth` devolve para MIME que não parseia) e sem anexos, como o MIME ilegível já vira.
   */
  const hasBoundedHeaders = hasBoundedMimeHeaders(rawMessage)
  /** Spec 183 T406 (RF16): endereço para casar com os contatos, nome para quem está fora deles. */
  const sender = parseSenderMailbox(received.from)
  const verification = hasBoundedHeaders
    ? await dependencies.dkimVerifier.verifyWithHeaderFrom(rawMessage)
    : { alignment: DKIM_ALIGNMENT_RESULT.ABSENT, headerFrom: [] }
  /** Spec 237 T4.7d: o selo de verificada só vale quando o `From` assinado é o remetente gravado. */
  const dkimResult = resolveConversationDkimResult({
    alignment: verification.alignment,
    headerFrom: verification.headerFrom,
    senderAddress: sender.address,
  })

  /**
   * Spec 183 T702c1: os anexos vão ao bucket antes da transação (o bucket não participa dela) e só
   * quando a thread tem conversa da ocorrência. O que a transação não ligar é apagado aqui.
   */
  const attachments =
    hasBoundedHeaders &&
    (await dependencies.repository.threadHasOccurrenceConversation({
      companyId,
      threadId: thread.id,
    }))
      ? await dependencies.conversationAttachments.store(new Uint8Array(rawMessage))
      : { skipped: 0, stored: [] }

  let recorded: { readonly linkedAttachments: number }
  try {
    recorded = await recordInbound()
  } catch (error: unknown) {
    if (attachments.stored.length > 0) {
      await dependencies.conversationAttachments.discard(attachments.stored)
    }
    throw error
  }
  if (recorded.linkedAttachments === 0 && attachments.stored.length > 0) {
    await dependencies.conversationAttachments.discard(attachments.stored)
  }

  return {
    attachments: { linked: recorded.linkedAttachments, skipped: attachments.skipped },
    dkimResult,
    outcome: 'recorded',
    threadId: thread.id,
  }

  function recordInbound() {
    return dependencies.repository.recordInboundMessage({
      bodyText: normalizeNonEmpty(received.text, FALLBACK_BODY_TEXT),
      companyId,
      conversationAttachments: attachments.stored,
      dkimResult,
      fromAddress: sender.address,
      fromDisplayName: sender.displayName,
      inReplyTo: extractInReplyToHeader(received),
      providerEmailId,
      raw: {
        bucket: dependencies.storageBucket,
        key: objectKey,
        mimeType: RAW_EMAIL_MIME_TYPE,
        provider: dependencies.storageProvider,
        sha256,
        sizeBytes: rawMessage.byteLength,
      },
      rfcMessageId: normalizeOptional(received.message_id),
      subject: normalizeNonEmpty(received.subject, FALLBACK_SUBJECT),
      threadId: thread.id,
      toAddresses: received.to,
    })
  }
}

type PreviewDecision = Exclude<
  RecordContractorMailInboundMessageResult,
  { readonly outcome: 'recorded' }
>

/** Sem conversa casada: a prévia por e-mail encaminhado decide, e sem ela o endereço é desconhecido. */
async function decideWithoutConversation(context: {
  readonly delivery: { readonly isLastAttempt: boolean }
  readonly dependencies: RecordContractorMailInboundMessageDependencies
  readonly envelope: ContractorMailInboundEnvelopeV1
  readonly received: ReceivedResendEmail
  readonly settings: ContractorMailInboundSettingsRecord
}): Promise<PreviewDecision> {
  const { delivery, dependencies, envelope, received, settings } = context
  const preview = await dependencies.previewIntake.intake({
    companyId: envelope.companyId,
    correlationId: envelope.correlationId,
    delivery,
    occurredAt: new Date(envelope.occurredAt),
    providerEmailId: envelope.payload.providerEmailId,
    received,
    replyDomain: settings.replyDomain,
  })
  if (preview.kind === 'already_recorded') return { outcome: 'already_recorded' }
  if (preview.kind !== 'not_a_preview') return { outcome: 'preview', preview }
  return { outcome: 'discarded', reason: 'token_unknown' }
}

function dedupeById<TRecord extends { readonly id: string }>(
  records: readonly TRecord[],
): readonly TRecord[] {
  const seen = new Map<string, TRecord>()
  for (const record of records) seen.set(record.id, record)
  return [...seen.values()]
}

/**
 * Revisão do `architect`: o `In-Reply-To` do e-mail **recebido** referencia a mensagem anterior da
 * conversa — não é o `message_id` do próprio e-mail (esse vira `rfcMessageId`, campo à parte). Os
 * nomes de cabeçalho de e-mail não distinguem caixa, e o Resend não garante uma única grafia.
 */
function extractInReplyToHeader(received: ReceivedResendEmail): string | undefined {
  const entry = Object.entries(received.headers).find(
    ([name]) => name.toLowerCase() === IN_REPLY_TO_HEADER,
  )
  return normalizeOptional(entry?.[1]?.replaceAll(/[<>]/g, ''))
}

function normalizeNonEmpty(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : fallback
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : undefined
}
