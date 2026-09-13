/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ContractorMailDkimResult,
  ContractorMailSettingsStatus,
  ContractorMailThreadStatus,
  ContractorMailThreadSubjectType,
} from '../../database/contractor-mail.schema.js'

/**
 * `secretEnvelope` é o jsonb como veio do banco, sem abrir: quem sela e quem lê o conteúdo é a
 * T006. Este repositório só transporta.
 */
export type ContractorMailSettingsRecord = {
  readonly companyId: string
  readonly id: string
  readonly lastWebhookAt: Date | undefined
  readonly replyDomain: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
  readonly status: ContractorMailSettingsStatus
  readonly version: bigint
  readonly webhookId: string
}

export type ContractorMailThreadRecord = {
  readonly companyId: string
  readonly contractorId: string | undefined
  readonly createdAt: Date
  readonly id: string
  readonly replyTokenHash: string
  readonly status: ContractorMailThreadStatus
  readonly subjectId: string
  readonly subjectType: ContractorMailThreadSubjectType
}

/**
 * Spec 143 T008: o que a conversa `setup_test` (RF13) já revela hoje, ainda sem a T009 (que a
 * cria) nem a T010 (que grava a resposta e o DKIM). Enquanto nenhuma das duas existir, nenhuma
 * empresa tem conversa `setup_test`, e `findSetupTestStatus` devolve `undefined` — o que o caso de
 * uso lê como "pendente", exatamente o esperado pelo `tasks.md`.
 */
export type ContractorMailSetupTestStatus = {
  readonly dkimResult: ContractorMailDkimResult | undefined
  readonly hasInboundReply: boolean
  readonly hasOutboundSent: boolean
}

/**
 * A trilha registra ator, alvo e o resultado — nunca o valor do que mudou. `afterSnapshot` carrega
 * só os nomes dos campos alterados (`changedFields`), nunca `apiKey`/`webhookSigningSecret` nem o
 * envelope selado.
 */
export type ContractorMailSettingsAuditRecord = {
  readonly action: string
  readonly actorUserId: string
  readonly afterSnapshot: Record<string, unknown>
  readonly beforeSnapshot: Record<string, unknown> | null
  readonly companyId: string
  readonly correlationId: string
  readonly entityId: string
}

export type SaveContractorMailSettingsInput = {
  readonly audit: ContractorMailSettingsAuditRecord
  readonly companyId: string
  /**
   * Revisão do `architect` (T008): ausente é "eu acho que ainda não existe" — o repositório insere
   * e recusa se a linha já existir (`409`). Presente é "eu acho que a versão é esta" — o repositório
   * faz `UPDATE ... WHERE version = expectedVersion` e recusa se não bater (`409`). As duas formas
   * nunca gravam o envelope selado por cima de uma linha que não é a que ele pensa que é.
   */
  readonly expectedVersion: string | undefined
  readonly replyDomain: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
  /**
   * Gerado pelo caso de uso **antes** da chamada: o AAD do envelope selado
   * (`transportada:contractor-mail-credential:v1:${companyId}:${settingsId}`) precisa do id antes
   * de a linha existir, então quem decide o id de uma configuração nova é quem sela o segredo, não
   * o `defaultRandom()` da coluna.
   */
  readonly settingsId: string
}

/**
 * Correção pós-entrega da T009 (spec 143). O token é **derivado** de `(replyTokenSecret, companyId,
 * threadId)` — determinístico —, então a conversa `setup_test` precisa existir (com um `threadId`
 * definitivo) antes de o token poder ser calculado. `reserveSetupTestThread` resolve exatamente essa
 * corrida: recebe um `candidateThreadId`/`candidateReplyTokenHash` já calculados pelo caso de uso
 * (que só ele tem o segredo para gerar), tenta criar a linha com esse id e, se perder a corrida
 * contra outra chamada concorrente, devolve o `threadId` de quem venceu — nunca os dois. O caso de
 * uso então deriva o token de novo para o `threadId` **confirmado** (barato: é HMAC, não é I/O), o
 * que também é o caminho normal de reaproveitar uma conversa já existente.
 */
export type ReserveContractorMailSetupTestThreadInput = {
  readonly candidateReplyTokenHash: string
  readonly candidateThreadId: string
  readonly companyId: string
}

export type ReserveContractorMailSetupTestThreadResult = {
  readonly threadId: string
}

/**
 * Grava a mensagem de saída `queued` (com o assunto e os destinatários já resolvidos) e o evento em
 * `contractor_mail_outbox` — o payload da fila volta a ser só `{ messageId }` (§6 do baseline de
 * segurança: referência, nunca dado), então nada aqui precisa viajar fora do banco.
 */
export type RecordContractorMailTestEmailInput = {
  readonly actorUserId: string
  readonly bodyText: string
  readonly companyId: string
  readonly correlationId: string
  readonly fromAddress: string
  readonly subject: string
  readonly threadId: string
  readonly toAddresses: readonly string[]
}

export type RecordContractorMailTestEmailResult = {
  readonly threadId: string
}

export type ContractorMailRepositoryPort = {
  readonly recordTestEmailMessage: (
    input: RecordContractorMailTestEmailInput,
  ) => Promise<RecordContractorMailTestEmailResult>
  readonly reserveSetupTestThread: (
    input: ReserveContractorMailSetupTestThreadInput,
  ) => Promise<ReserveContractorMailSetupTestThreadResult>
  readonly findSettings: (input: {
    readonly companyId: string
  }) => Promise<ContractorMailSettingsRecord | undefined>
  /**
   * Única busca sem `companyId` de entrada: o webhook só carrega o `webhookId` opaco da URL, e é
   * esta busca que **descobre** a empresa (`webhook_id` é único no banco inteiro). Mesma forma de
   * `findByCodeHash` em `identity/infrastructure/drizzle-password-reset.repository.ts` — a própria
   * linha encontrada é quem estabelece o tenant, não o contrário.
   */
  readonly findSettingsByWebhookId: (input: {
    readonly webhookId: string
  }) => Promise<ContractorMailSettingsRecord | undefined>
  readonly findSetupTestStatus: (input: {
    readonly companyId: string
  }) => Promise<ContractorMailSetupTestStatus | undefined>
  /** plan.md § Segurança e tenant: o hash acha a conversa, e `companyId` confere que é a do webhook. */
  readonly findThreadByReplyTokenHash: (input: {
    readonly companyId: string
    readonly replyTokenHash: string
  }) => Promise<ContractorMailThreadRecord | undefined>
  /** Upsert + auditoria na mesma transação — o envelope chega selado, abrir e selar é da T006. */
  readonly saveSettings: (
    input: SaveContractorMailSettingsInput,
  ) => Promise<ContractorMailSettingsRecord>
}
