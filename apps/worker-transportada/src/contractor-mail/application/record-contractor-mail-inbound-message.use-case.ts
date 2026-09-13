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

import { hashReplyToken } from '../domain/reply-token.policy.js'
import { extractReplyTokenCandidates } from '../domain/recipient-reply-token.policy.js'
import { ContractorMailInboundSettingsMissingError } from '../domain/contractor-mail-inbound.error.js'
import type { DkimAlignmentResult } from '../domain/dkim-alignment.policy.js'
import type { VerifyDkimAlignmentPort } from '../infrastructure/dkim-verifier.gateway.js'
import type { ContractorMailCredentialSecretService } from './contractor-mail-credential-secret.service.js'
import type { ContractorMailInboundWorkerRepository } from '../infrastructure/drizzle-contractor-mail-inbound-worker.repository.js'
import type {
  ReceivedResendEmail,
  ResendMailGateway,
} from '../infrastructure/resend-mail.gateway.js'
import type { ContractorMailInboundEnvelopeV1 } from '../../messaging/contractor-mail-inbound-envelope.schema.js'

const RAW_EMAIL_MIME_TYPE = 'message/rfc822'
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
  readonly dkimVerifier: VerifyDkimAlignmentPort
  readonly mailGateway: ResendMailGateway
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
      readonly dkimResult: DkimAlignmentResult
      readonly outcome: 'recorded'
      readonly threadId: string
    }

export async function recordContractorMailInboundMessage(
  envelope: ContractorMailInboundEnvelopeV1,
  dependencies: RecordContractorMailInboundMessageDependencies,
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

  if (distinctThreads.length === 0) return { outcome: 'discarded', reason: 'token_unknown' }
  if (distinctThreads.length > 1) return { outcome: 'discarded', reason: 'multiple_matches' }
  const thread = distinctThreads[0]!

  const rawMessage = await dependencies.mailGateway.downloadRawEmail({
    downloadUrl: received.raw.download_url,
  })
  const sha256 = createHash('sha256').update(rawMessage).digest('hex')
  const objectKey = buildRawObjectKey({ companyId, providerEmailId })

  await dependencies.storage.storeObject({
    body: new Uint8Array(rawMessage),
    bucket: dependencies.storageBucket,
    contentLength: rawMessage.byteLength,
    contentType: RAW_EMAIL_MIME_TYPE,
    key: objectKey,
    sha256,
  })

  const dkimResult = await dependencies.dkimVerifier.verify(rawMessage)

  await dependencies.repository.recordInboundMessage({
    bodyText: normalizeNonEmpty(received.text, FALLBACK_BODY_TEXT),
    companyId,
    dkimResult,
    fromAddress: received.from,
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

  return { dkimResult, outcome: 'recorded', threadId: thread.id }
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

/**
 * Sem dado pessoal na chave (RF4/plan.md § Worker): nem endereço, nem assunto — só a referência
 * opaca do Resend, que já é única por empresa.
 */
function buildRawObjectKey(input: {
  readonly companyId: string
  readonly providerEmailId: string
}): string {
  return `tenants/${input.companyId}/contractor-mail/${encodeURIComponent(input.providerEmailId)}/raw.eml`
}

function normalizeNonEmpty(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : fallback
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : undefined
}
