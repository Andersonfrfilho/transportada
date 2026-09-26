/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, type SQL, sql } from 'drizzle-orm'

import {
  auditLogs,
  contractorContacts,
  contractorInboundEmailOutbox,
  contractorMailMessages,
  contractorMailOutbox,
  contractorMailSettings,
  contractorMailThreads,
} from '../../database/database.schema.js'
import type {
  ContractorContactRecord,
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
  ContractorMailSetupTestStatus,
  ContractorMailThreadRecord,
  CreateContractorContactInput,
  FindContractorContactInput,
  ListContractorContactsInput,
  RecordContractorMailInboundWebhookEventInput,
  RecordContractorMailSendingVerificationInput,
  RecordContractorMailTestEmailInput,
  RecordContractorMailTestEmailResult,
  ReserveContractorMailSetupTestThreadInput,
  ReserveContractorMailSetupTestThreadResult,
  SaveContractorMailSettingsInput,
  UpdateContractorContactInput,
} from '../application/contractor-mail.port.js'
import {
  ContractorContactEmailTakenError,
  ContractorMailSettingsVersionConflictError,
} from '../domain/contractor-mail.error.js'
import { deriveReplyToken, hashReplyToken } from '../domain/reply-token.policy.js'
import type { ContractorContactState } from '../domain/contractor-contact.policy.js'
import type { ContractorMailSettingsStatus } from '../../database/contractor-mail.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type SettingsRow = {
  readonly companyId: string
  readonly id: string
  readonly lastWebhookAt: Date | null
  readonly replyDomain: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
  readonly sendingVerifiedAt: Date | null
  readonly status: ContractorMailSettingsStatus
  readonly version: bigint
  readonly webhookId: string
}

function toSettingsRecord(row: SettingsRow): ContractorMailSettingsRecord {
  return {
    ...row,
    lastWebhookAt: row.lastWebhookAt ?? undefined,
    sendingVerifiedAt: row.sendingVerifiedAt ?? undefined,
  }
}

const SETTINGS_COLUMNS = {
  companyId: contractorMailSettings.companyId,
  id: contractorMailSettings.id,
  lastWebhookAt: contractorMailSettings.lastWebhookAt,
  replyDomain: contractorMailSettings.replyDomain,
  secretEnvelope: contractorMailSettings.secretEnvelope,
  senderAddress: contractorMailSettings.senderAddress,
  senderName: contractorMailSettings.senderName,
  sendingVerifiedAt: contractorMailSettings.sendingVerifiedAt,
  status: contractorMailSettings.status,
  version: contractorMailSettings.version,
  webhookId: contractorMailSettings.webhookId,
}

const CONTACT_COLUMNS = {
  canDecide: contractorContacts.canDecide,
  companyId: contractorContacts.companyId,
  contractorId: contractorContacts.contractorId,
  email: contractorContacts.email,
  id: contractorContacts.id,
  name: contractorContacts.name,
  occurrenceStages: contractorContacts.occurrenceStages,
  phone: contractorContacts.phone,
  preferredChannel: contractorContacts.preferredChannel,
  receivesOccurrences: contractorContacts.receivesOccurrences,
  roleLabel: contractorContacts.roleLabel,
  status: contractorContacts.status,
  types: contractorContacts.types,
  whatsappOptInAt: contractorContacts.whatsappOptInAt,
  whatsappOptInByUserId: contractorContacts.whatsappOptInByUserId,
}

const THREAD_COLUMNS = {
  companyId: contractorMailThreads.companyId,
  contractorId: contractorMailThreads.contractorId,
  createdAt: contractorMailThreads.createdAt,
  id: contractorMailThreads.id,
  replyTokenHash: contractorMailThreads.replyTokenHash,
  status: contractorMailThreads.status,
  subjectId: contractorMailThreads.subjectId,
  subjectType: contractorMailThreads.subjectType,
}

/**
 * plan.md § Segurança e tenant: "O tenant sai do token, conferido contra o webhook." O hash é
 * único no banco inteiro (`contractor_mail_threads_reply_token_hash_unique`), mas a consulta nunca
 * confia nisso sozinha — `company_id` entra na mesma condição, e não como conferência depois. Um
 * token de conversa de outra empresa não acha nada, porque a linha buscada exige as duas coisas
 * ao mesmo tempo.
 */
export const buildContractorMailThreadByReplyTokenFilters = (input: {
  readonly companyId: string
  readonly replyTokenHash: string
}): readonly SQL[] => [
  eq(contractorMailThreads.companyId, input.companyId),
  eq(contractorMailThreads.replyTokenHash, input.replyTokenHash),
]

/**
 * `findSetupTestStatus` acha a conversa `setup_test` da empresa — `company_id` na mesma condição
 * do `subject_type`, nunca um filtro à parte, pela mesma razão do filtro acima.
 */
/**
 * Spec 150 T301 (spec 143 T013): `company_id` e `contractor_id` na mesma condição do resto do
 * filtro — nunca uma conferência à parte —, para o contato de outra empresa (ou de uma contratante
 * de outra empresa) nunca aparecer nas consultas abaixo (BOLA).
 */
export const buildContractorContactFilters = (input: {
  readonly companyId: string
  readonly contractorId: string
}): readonly SQL[] => [
  eq(contractorContacts.companyId, input.companyId),
  eq(contractorContacts.contractorId, input.contractorId),
]

export const buildContractorMailSetupTestThreadFilters = (input: {
  readonly companyId: string
}): readonly SQL[] => [
  eq(contractorMailThreads.companyId, input.companyId),
  eq(contractorMailThreads.subjectType, 'setup_test'),
]

/** As mensagens da conversa achada acima, sempre pela dupla `company_id` + `thread_id`. */
export const buildContractorMailSetupTestMessageFilters = (input: {
  readonly companyId: string
  readonly threadId: string
}): readonly SQL[] => [
  eq(contractorMailMessages.companyId, input.companyId),
  eq(contractorMailMessages.threadId, input.threadId),
]

export class DrizzleContractorMailRepository implements ContractorMailRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async listContractorContacts(
    input: ListContractorContactsInput,
  ): Promise<readonly ContractorContactRecord[]> {
    return this.database
      .select(CONTACT_COLUMNS)
      .from(contractorContacts)
      .where(and(...buildContractorContactFilters(input)))
      .orderBy(contractorContacts.createdAt)
  }

  /**
   * `contractor_contacts_company_contractor_email_unique` cobre `(company_id, contractor_id,
   * lower(email))` para toda linha, ativa ou inativa — mais estrito que "duplicado ativo", mas
   * decisão registrada em `evidence.md` da T301: reativar um contato inativo é um `PATCH` de
   * status, não um novo `POST`, então a migration não precisou de índice parcial novo.
   */
  public async findContractorContact(
    input: FindContractorContactInput,
  ): Promise<ContractorContactRecord | undefined> {
    const [row] = await this.database
      .select(CONTACT_COLUMNS)
      .from(contractorContacts)
      .where(
        and(...buildContractorContactFilters(input), eq(contractorContacts.id, input.contactId)),
      )
      .limit(1)
    return row
  }

  public async createContractorContact(
    input: CreateContractorContactInput,
  ): Promise<ContractorContactRecord> {
    try {
      const [row] = await this.database
        .insert(contractorContacts)
        .values(toContactWrite(input))
        .returning(CONTACT_COLUMNS)
      if (row === undefined) throw new Error('contractor contact was not created')
      return row
    } catch (error) {
      if (
        violatedUniqueConstraint(error) === 'contractor_contacts_company_contractor_email_unique'
      ) {
        throw new ContractorContactEmailTakenError()
      }
      throw error
    }
  }

  public async updateContractorContact(
    input: UpdateContractorContactInput,
  ): Promise<ContractorContactRecord | undefined> {
    try {
      const [row] = await this.database
        .update(contractorContacts)
        .set({
          ...toContactChanges(input),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.status === undefined ? {} : { status: input.status }),
          updatedAt: sql`now()`,
        })
        .where(
          and(...buildContractorContactFilters(input), eq(contractorContacts.id, input.contactId)),
        )
        .returning(CONTACT_COLUMNS)
      return row
    } catch (error) {
      if (
        violatedUniqueConstraint(error) === 'contractor_contacts_company_contractor_email_unique'
      ) {
        throw new ContractorContactEmailTakenError()
      }
      throw error
    }
  }

  public async findSettings({
    companyId,
  }: {
    readonly companyId: string
  }): Promise<ContractorMailSettingsRecord | undefined> {
    const [row] = await this.database
      .select(SETTINGS_COLUMNS)
      .from(contractorMailSettings)
      .where(eq(contractorMailSettings.companyId, companyId))
      .limit(1)

    return row === undefined ? undefined : toSettingsRecord(row)
  }

  /**
   * Única busca sem `companyId` de entrada: o webhook só carrega o `webhookId` opaco da URL, e é
   * esta busca que **descobre** a empresa — `webhook_id` é único no banco inteiro
   * (`contractor_mail_settings_webhook_id_unique`), mesma forma de `findByCodeHash` em
   * `identity/infrastructure/drizzle-password-reset.repository.ts`.
   */
  public async findSettingsByWebhookId({
    webhookId,
  }: {
    readonly webhookId: string
  }): Promise<ContractorMailSettingsRecord | undefined> {
    const [row] = await this.database
      .select(SETTINGS_COLUMNS)
      .from(contractorMailSettings)
      .where(eq(contractorMailSettings.webhookId, webhookId))
      .limit(1)

    return row === undefined ? undefined : toSettingsRecord(row)
  }

  /**
   * Spec 150 T401: sem subir `version` (o formulário aberto não perde a vez) e só na versão lida
   * pela lista de verificação — um `PUT` que venceu no meio já zerou e não é sobrescrito.
   */
  public async recordSendingVerification(
    input: RecordContractorMailSendingVerificationInput,
  ): Promise<void> {
    await this.database
      .update(contractorMailSettings)
      .set({ sendingVerifiedAt: input.isSendingVerified ? sql`now()` : null })
      .where(
        and(
          eq(contractorMailSettings.companyId, input.companyId),
          eq(contractorMailSettings.version, input.expectedVersion),
        ),
      )
  }

  public async findThreadByReplyTokenHash(input: {
    readonly companyId: string
    readonly replyTokenHash: string
  }): Promise<ContractorMailThreadRecord | undefined> {
    const [row] = await this.database
      .select(THREAD_COLUMNS)
      .from(contractorMailThreads)
      .where(and(...buildContractorMailThreadByReplyTokenFilters(input)))
      .limit(1)

    return row === undefined ? undefined : { ...row, contractorId: row.contractorId ?? undefined }
  }

  /**
   * Spec 143 T008: lê a conversa `setup_test` da empresa (RF13) e, se existir, o estado das
   * mensagens dela — `undefined` quando ela ainda não existe (T009/T010 não fecharam), o que o
   * caso de uso lê como "pendente".
   */
  public async findSetupTestStatus({
    companyId,
  }: {
    readonly companyId: string
  }): Promise<ContractorMailSetupTestStatus | undefined> {
    const [thread] = await this.database
      .select({ id: contractorMailThreads.id })
      .from(contractorMailThreads)
      .where(and(...buildContractorMailSetupTestThreadFilters({ companyId })))
      .limit(1)
    if (thread === undefined) return undefined

    const messages = await this.database
      .select({
        deliveryStatus: contractorMailMessages.deliveryStatus,
        direction: contractorMailMessages.direction,
        dkimResult: contractorMailMessages.dkimResult,
      })
      .from(contractorMailMessages)
      .where(and(...buildContractorMailSetupTestMessageFilters({ companyId, threadId: thread.id })))

    const inboundMessage = messages.find((message) => message.direction === 'inbound')
    return {
      dkimResult: inboundMessage?.dkimResult ?? undefined,
      hasInboundReply: inboundMessage !== undefined,
      hasOutboundSent: messages.some(
        (message) => message.direction === 'outbound' && message.deliveryStatus === 'sent',
      ),
    }
  }

  /**
   * Spec 143 T010 (RF11): `last_webhook_at` e o evento de referência, na mesma transação.
   * `ON CONFLICT DO NOTHING` no único `(company_id, provider_email_id)` faz o Svix retentando o
   * mesmo `email_id` convergir sem gravar duas vezes — a rota responde 204 nos dois casos.
   */
  public async recordInboundWebhookEvent(
    input: RecordContractorMailInboundWebhookEventInput,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(contractorMailSettings)
        .set({ lastWebhookAt: input.occurredAt })
        .where(eq(contractorMailSettings.companyId, input.companyId))

      await transaction
        .insert(contractorInboundEmailOutbox)
        .values({
          companyId: input.companyId,
          correlationId: input.correlationId,
          eventType: 'email.received',
          payload: { providerEmailId: input.providerEmailId },
          providerEmailId: input.providerEmailId,
        })
        .onConflictDoNothing({
          target: [
            contractorInboundEmailOutbox.companyId,
            contractorInboundEmailOutbox.providerEmailId,
          ],
        })
    })
  }

  /**
   * Correção pós-entrega da T009 (spec 143). O token de resposta agora é **derivado**
   * (`reply-token.policy.ts#deriveReplyToken`), determinístico por `(replyTokenSecret, companyId,
   * threadId)` — então o caso de uso precisa de um `threadId` **definitivo** antes de poder calcular
   * o token que vai no `Reply-To` do e-mail. `subjectId` do `setup_test` é o próprio `companyId`
   * (não há um segundo objeto de negócio para apontar), o que faz o
   * `unique(company_id, subject_type, subject_id)` garantir "uma conversa de teste por empresa" — e
   * é esse unique que decide a corrida abaixo.
   *
   * `candidateThreadId`/`candidateReplyTokenHash` chegam calculados pelo caso de uso, que é quem tem
   * o segredo. `ON CONFLICT DO NOTHING` tenta criar com esse candidato; se perder (outra chamada
   * concorrente já criou a conversa), a `SELECT` seguinte, **na mesma transação**, devolve o
   * `threadId` de quem venceu — nunca grava o hash do perdedor por cima do vencedor. O caso de uso
   * recebe o `threadId` confirmado e, se for diferente do candidato, deriva o token de novo para ele
   * (HMAC puro, sem I/O) — o mesmo caminho que reaproveitar uma conversa já existente.
   */
  public async reserveSetupTestThread(
    input: ReserveContractorMailSetupTestThreadInput,
  ): Promise<ReserveContractorMailSetupTestThreadResult> {
    return this.database.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(contractorMailThreads)
        .values({
          companyId: input.companyId,
          contractorId: null,
          id: input.candidateThreadId,
          replyTokenHash: input.candidateReplyTokenHash,
          subjectId: input.companyId,
          subjectType: 'setup_test',
        })
        .onConflictDoNothing({
          target: [
            contractorMailThreads.companyId,
            contractorMailThreads.subjectType,
            contractorMailThreads.subjectId,
          ],
        })
        .returning({ id: contractorMailThreads.id })
      if (inserted !== undefined) return { threadId: inserted.id }

      const [existing] = await transaction
        .select({ id: contractorMailThreads.id })
        .from(contractorMailThreads)
        .where(
          and(
            eq(contractorMailThreads.companyId, input.companyId),
            eq(contractorMailThreads.subjectType, 'setup_test'),
          ),
        )
        .limit(1)
      if (existing === undefined) {
        throw new Error(
          'contractor mail setup_test thread reservation lost the race without a winner',
        )
      }
      return { threadId: existing.id }
    })
  }

  /**
   * Correção pós-entrega da T009: a mensagem de saída `queued` e o evento em
   * `contractor_mail_outbox`, na mesma transação — o payload da fila voltou a ser só `{ messageId }`
   * (§6 do baseline de segurança: referência, nunca dado), então nada além do id precisa viajar.
   */
  public async recordTestEmailMessage(
    input: RecordContractorMailTestEmailInput,
  ): Promise<RecordContractorMailTestEmailResult> {
    return this.database.transaction(async (transaction) => {
      const [message] = await transaction
        .insert(contractorMailMessages)
        .values({
          actorUserId: input.actorUserId,
          bodyHtml: input.bodyHtml ?? null,
          bodyText: input.bodyText,
          companyId: input.companyId,
          deliveryStatus: 'queued',
          direction: 'outbound',
          fromAddress: input.fromAddress,
          subject: input.subject,
          threadId: input.threadId,
          toAddresses: [...input.toAddresses],
        })
        .returning({ id: contractorMailMessages.id })
      if (message === undefined) throw new Error('contractor mail test message was not saved')

      await transaction.insert(contractorMailOutbox).values({
        companyId: input.companyId,
        correlationId: input.correlationId,
        eventType: 'message.send.requested',
        messageId: message.id,
        payload: {},
      })

      return { threadId: input.threadId }
    })
  }

  /**
   * Revisão do `architect` (T008): a criação e a atualização não podem mais ser o mesmo
   * `onConflictDoUpdate`. Duas criações concorrentes selam o segredo com AADs diferentes (cada uma
   * amarrada ao `settingsId` que gerou), e um `upsert` cego gravava o corpo do perdedor — inclusive
   * o envelope dele, selado com um id que **não é** o da linha — por cima da linha do vencedor. O
   * envelope resultante nunca mais abre: o AAD guardado na `secret_envelope` e o `id` da linha
   * divergem para sempre.
   *
   * A saída é tratar os dois casos como operações diferentes, cada uma atômica dentro da
   * transação: `expectedVersion` ausente é "eu acho que não existe ainda" (`INSERT ... ON CONFLICT
   * DO NOTHING`, que só devolve a linha quando o insert de fato aconteceu — nunca grava o envelope
   * do perdedor); `expectedVersion` presente é "eu acho que a versão é esta"
   * (`UPDATE ... WHERE version = expected`, controle de concorrência otimista). As duas convergem
   * em "nenhuma linha voltou" → `ContractorMailSettingsVersionConflictError` (409), sem tocar em
   * `audit_logs` — perder a corrida não é evento auditável, é só "tente de novo".
   */
  public async saveSettings(
    input: SaveContractorMailSettingsInput,
  ): Promise<ContractorMailSettingsRecord> {
    return this.database.transaction(async (transaction) => {
      const row =
        input.expectedVersion === undefined
          ? await insertNewSettings(transaction, input)
          : await updateExistingSettings(transaction, input)
      if (row === undefined) throw new ContractorMailSettingsVersionConflictError()
      // Defesa em profundidade: o `RETURNING` do `ON CONFLICT DO NOTHING` só devolve a linha que
      // este `INSERT` de fato criou, mas o `id` explícito nos `values()` é quem garante isso — não
      // um efeito colateral do driver. Confirma aqui, dentro da mesma transação, antes de auditar.
      if (row.id !== input.settingsId) {
        throw new ContractorMailSettingsVersionConflictError()
      }

      await transaction.insert(auditLogs).values({
        action: input.audit.action,
        actorUserId: input.audit.actorUserId,
        afterSnapshot: input.audit.afterSnapshot,
        beforeSnapshot: input.audit.beforeSnapshot,
        companyId: input.companyId,
        correlationId: input.audit.correlationId,
        entityId: input.audit.entityId,
        entityType: 'contractor_mail_settings',
        permission: 'settings.manage',
        targetId: input.audit.entityId,
        targetType: 'contractor_mail_settings',
      })

      if (input.replyTokenSecretRegeneration !== undefined) {
        await regenerateThreadReplyTokenHashes(transaction, {
          companyId: input.companyId,
          replyTokenSecret: input.replyTokenSecretRegeneration.replyTokenSecret,
        })

        await transaction.insert(auditLogs).values({
          action: 'reply_token_secret_regenerated',
          actorUserId: input.audit.actorUserId,
          afterSnapshot: { settingsId: input.settingsId },
          beforeSnapshot: null,
          companyId: input.companyId,
          correlationId: input.audit.correlationId,
          entityId: input.settingsId,
          entityType: 'contractor_mail_settings',
          permission: 'settings.manage',
          targetId: input.settingsId,
          targetType: 'contractor_mail_settings',
        })
      }

      return toSettingsRecord(row)
    })
  }
}

/**
 * Revisão do `architect` (T010): o `replyTokenSecret` novo deixa `deriveReplyToken` produzir um
 * token diferente para toda conversa da empresa — o hash gravado precisa acompanhar, na mesma
 * transação do envelope, ou a conversa fica órfã (o `Reply-To` que o worker monta dali em diante
 * nunca mais bate com o hash antigo). Sequencial, não `Promise.all`: é uma transação, uma conexão só.
 */
async function regenerateThreadReplyTokenHashes(
  transaction: Transaction,
  input: { readonly companyId: string; readonly replyTokenSecret: string },
): Promise<void> {
  const threads = await transaction
    .select({ id: contractorMailThreads.id })
    .from(contractorMailThreads)
    .where(eq(contractorMailThreads.companyId, input.companyId))

  for (const thread of threads) {
    const token = deriveReplyToken({
      companyId: input.companyId,
      replyTokenSecret: input.replyTokenSecret,
      threadId: thread.id,
    })
    await transaction
      .update(contractorMailThreads)
      .set({ replyTokenHash: hashReplyToken(token) })
      .where(
        and(
          eq(contractorMailThreads.companyId, input.companyId),
          eq(contractorMailThreads.id, thread.id),
        ),
      )
  }
}

async function insertNewSettings(
  transaction: Transaction,
  input: SaveContractorMailSettingsInput,
): Promise<SettingsRow | undefined> {
  const [row] = await transaction
    .insert(contractorMailSettings)
    .values({
      id: input.settingsId,
      companyId: input.companyId,
      replyDomain: input.replyDomain,
      secretEnvelope: input.secretEnvelope,
      senderAddress: input.senderAddress,
      senderName: input.senderName,
    })
    .onConflictDoNothing({ target: contractorMailSettings.companyId })
    .returning(SETTINGS_COLUMNS)
  return row
}

async function updateExistingSettings(
  transaction: Transaction,
  input: SaveContractorMailSettingsInput,
): Promise<SettingsRow | undefined> {
  const [row] = await transaction
    .update(contractorMailSettings)
    .set({
      replyDomain: input.replyDomain,
      secretEnvelope: input.secretEnvelope,
      senderAddress: input.senderAddress,
      senderName: input.senderName,
      ...(input.resetSendingVerification ? { sendingVerifiedAt: null } : {}),
      updatedAt: sql`now()`,
      version: sql`${contractorMailSettings.version} + 1`,
    })
    .where(
      and(
        eq(contractorMailSettings.companyId, input.companyId),
        eq(contractorMailSettings.version, BigInt(input.expectedVersion ?? '0')),
      ),
    )
    .returning(SETTINGS_COLUMNS)
  return row
}

/**
 * Spec 183 T302: só os campos que vieram — ausente fica com o padrão do banco ou o valor gravado. Os
 * arrays são copiados: o Drizzle espera `T[]`, e o estado da política é `readonly`.
 */
function toContactChanges(
  input: Partial<ContractorContactState>,
): Partial<typeof contractorContacts.$inferInsert> {
  return Object.fromEntries(
    Object.entries({
      canDecide: input.canDecide,
      name: input.name,
      occurrenceStages:
        input.occurrenceStages === undefined ? undefined : [...input.occurrenceStages],
      phone: input.phone,
      preferredChannel: input.preferredChannel,
      receivesOccurrences: input.receivesOccurrences,
      roleLabel: input.roleLabel,
      types: input.types === undefined ? undefined : [...input.types],
      whatsappOptInAt: input.whatsappOptInAt,
      whatsappOptInByUserId: input.whatsappOptInByUserId,
    }).filter(([, value]) => value !== undefined),
  )
}

function toContactWrite(
  input: CreateContractorContactInput,
): typeof contractorContacts.$inferInsert {
  return {
    ...toContactChanges(input),
    companyId: input.companyId,
    contractorId: input.contractorId,
    email: input.email,
  }
}
