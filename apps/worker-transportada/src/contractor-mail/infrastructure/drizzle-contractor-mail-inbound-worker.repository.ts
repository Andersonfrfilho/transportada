/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, type SQL } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  contractorMailMessages,
  contractorMailSettings,
  contractorMailThreads,
} from '../../database/contractor-mail.schema.js'
import { storedObjects } from '../../database/nfe.schema.js'
import { recordOccurrenceConversationMailReply } from '../../occurrence-conversation/infrastructure/drizzle-occurrence-conversation-mail.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type ContractorMailInboundSettingsRecord = {
  readonly id: string
  readonly replyDomain: string
  readonly secretEnvelope: unknown
}

export type ContractorMailInboundThreadRecord = {
  readonly id: string
}

/**
 * (d) do Objetivo: o MIME bruto grava no bucket privado **e** vira uma linha em `stored_objects`,
 * antes de qualquer interpretação (RF4). A chave nunca leva dado pessoal.
 *
 * Revisão do `architect`: `inReplyTo` é o cabeçalho `In-Reply-To` do e-mail **recebido** (referência
 * à mensagem anterior da conversa), e `rfcMessageId` é o `Message-Id` **do próprio** e-mail
 * recebido — os dois nunca foram o mesmo valor, e a primeira versão gravava `rfcMessageId` nas duas
 * colunas por engano.
 */
export type RecordContractorMailInboundMessageInput = {
  readonly bodyText: string
  readonly companyId: string
  readonly dkimResult: string
  readonly fromAddress: string
  readonly inReplyTo: string | undefined
  readonly providerEmailId: string
  readonly raw: {
    readonly bucket: string
    readonly key: string
    readonly mimeType: string
    readonly provider: string
    readonly sha256: string
    readonly sizeBytes: number
  }
  readonly rfcMessageId: string | undefined
  readonly subject: string
  readonly threadId: string
  readonly toAddresses: readonly string[]
}

export type ContractorMailInboundWorkerRepository = {
  findMessageByProviderEmailId(input: {
    readonly companyId: string
    readonly providerEmailId: string
  }): Promise<{ readonly id: string } | undefined>
  findSettingsByCompanyId(input: {
    readonly companyId: string
  }): Promise<ContractorMailInboundSettingsRecord | undefined>
  /**
   * plan.md § Segurança e tenant: o hash acha a conversa, e `companyId` confere o tenant — os dois
   * na mesma condição, nunca um filtro à parte. Revisão do `architect`: a extração de token agora
   * pode propor **vários** candidatos (`to` + `cc`), então a busca aceita uma lista de hashes; o
   * caso de uso decide o que fazer quando mais de uma conversa bate.
   */
  findThreadsByReplyTokenHashes(input: {
    readonly companyId: string
    readonly replyTokenHashes: readonly string[]
  }): Promise<readonly ContractorMailInboundThreadRecord[]>
  recordInboundMessage(input: RecordContractorMailInboundMessageInput): Promise<{ id: string }>
}

/**
 * Exportado para o contrato de tenant (no molde de
 * `buildContractorMailThreadByReplyTokenFilters` da API, T005): prova, por geração de SQL, que
 * `company_id` e `reply_token_hash IN (...)` entram na mesma condição — nunca um filtro à parte que
 * um token de outra empresa pudesse escapar.
 */
export const buildContractorMailInboundThreadCandidateFilters = (input: {
  readonly companyId: string
  readonly replyTokenHashes: readonly string[]
}): readonly SQL[] => [
  eq(contractorMailThreads.companyId, input.companyId),
  inArray(contractorMailThreads.replyTokenHash, input.replyTokenHashes),
]

export function createDrizzleContractorMailInboundWorkerRepository(
  database: Database,
): ContractorMailInboundWorkerRepository {
  return {
    async findSettingsByCompanyId({ companyId }) {
      const [row] = await database
        .select({
          id: contractorMailSettings.id,
          replyDomain: contractorMailSettings.replyDomain,
          secretEnvelope: contractorMailSettings.secretEnvelope,
        })
        .from(contractorMailSettings)
        .where(eq(contractorMailSettings.companyId, companyId))
        .limit(1)
      return row
    },

    async findThreadsByReplyTokenHashes(input) {
      if (input.replyTokenHashes.length === 0) return []

      return database
        .select({ id: contractorMailThreads.id })
        .from(contractorMailThreads)
        .where(and(...buildContractorMailInboundThreadCandidateFilters(input)))
    },

    async findMessageByProviderEmailId({ companyId, providerEmailId }) {
      const [row] = await database
        .select({ id: contractorMailMessages.id })
        .from(contractorMailMessages)
        .where(
          and(
            eq(contractorMailMessages.companyId, companyId),
            eq(contractorMailMessages.providerEmailId, providerEmailId),
          ),
        )
        .limit(1)
      return row
    },

    async recordInboundMessage(input) {
      return database.transaction(async (transaction) => {
        const [insertedObject] = await transaction
          .insert(storedObjects)
          .values({
            bucket: input.raw.bucket,
            companyId: input.companyId,
            mimeType: input.raw.mimeType,
            objectKey: input.raw.key,
            provider: input.raw.provider,
            purpose: 'contractor_mail_raw',
            sha256: input.raw.sha256,
            sizeBytes: BigInt(input.raw.sizeBytes),
            status: 'final',
          })
          .onConflictDoNothing({
            target: [
              storedObjects.companyId,
              storedObjects.provider,
              storedObjects.bucket,
              storedObjects.objectKey,
            ],
          })
          .returning({ id: storedObjects.id })

        const rawObjectId =
          insertedObject?.id ??
          (
            await transaction
              .select({ id: storedObjects.id })
              .from(storedObjects)
              .where(
                and(
                  eq(storedObjects.companyId, input.companyId),
                  eq(storedObjects.provider, input.raw.provider),
                  eq(storedObjects.bucket, input.raw.bucket),
                  eq(storedObjects.objectKey, input.raw.key),
                ),
              )
              .limit(1)
          )[0]?.id
        if (rawObjectId === undefined) {
          throw new Error('contractor mail inbound raw object was not found after insertion race')
        }

        const [message] = await transaction
          .insert(contractorMailMessages)
          .values({
            bodyText: input.bodyText,
            companyId: input.companyId,
            direction: 'inbound',
            dkimResult: input.dkimResult,
            fromAddress: input.fromAddress,
            inReplyTo: input.inReplyTo,
            interpretation: null,
            providerEmailId: input.providerEmailId,
            rawObjectId,
            rawSha256: input.raw.sha256,
            rfcMessageId: input.rfcMessageId,
            subject: input.subject,
            threadId: input.threadId,
            toAddresses: [...input.toAddresses],
          })
          .onConflictDoNothing({
            target: [contractorMailMessages.companyId, contractorMailMessages.providerEmailId],
          })
          .returning({ id: contractorMailMessages.id })

        if (message !== undefined) {
          /** Spec 183 T405: só a mensagem que acabou de nascer vira mensagem da conversa. */
          await recordOccurrenceConversationMailReply(transaction, {
            bodyText: input.bodyText,
            companyId: input.companyId,
            fromAddress: input.fromAddress,
            mailMessageId: message.id,
            threadId: input.threadId,
          })
          return { id: message.id }
        }

        const [existing] = await transaction
          .select({ id: contractorMailMessages.id })
          .from(contractorMailMessages)
          .where(
            and(
              eq(contractorMailMessages.companyId, input.companyId),
              eq(contractorMailMessages.providerEmailId, input.providerEmailId),
            ),
          )
          .limit(1)
        if (existing === undefined) {
          throw new Error(
            'contractor mail inbound message reservation lost the race without a winner',
          )
        }
        return { id: existing.id }
      })
    },
  }
}
