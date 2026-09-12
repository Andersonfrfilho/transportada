/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteEmissionGroupingMode } from '../../database/cte-emission-profile.schema.js'
import type {
  WhatsAppCommandClassificationEntry,
  WhatsAppCommandDocumentKind,
  WhatsAppCommandDocumentStatus,
  WhatsAppCommandKind,
  WhatsAppCommandSelection,
  WhatsAppCommandSettlementCode,
  WhatsAppCommandStatus,
} from '../../database/whatsapp-command.schema.js'

export type WhatsAppCommandRequest = Readonly<{
  actorUserId: string
  classification: readonly WhatsAppCommandClassificationEntry[]
  companyId: string
  confirmedAt: Date | undefined
  dueDate: string | undefined
  expiresAt: Date
  groupingMode: CteEmissionGroupingMode | undefined
  id: string
  kind: WhatsAppCommandKind
  lastErrorCode: string | undefined
  membershipId: string
  period: string | undefined
  previewSha256: string
  selection: WhatsAppCommandSelection
  settledAt: Date | undefined
  settlementOutcome: WhatsAppCommandSettlementCode | undefined
  status: WhatsAppCommandStatus
}>

export type WhatsAppCommandJournalStep = Readonly<{
  documentId: string | undefined
  documentKind: WhatsAppCommandDocumentKind
  groupKey: string
  id: string
  idempotencyKey: string
  lastErrorCode: string | undefined
  requestId: string
  status: WhatsAppCommandDocumentStatus
}>

/** Sem `membershipId`: o repositório o resolve por `(companyId, actorUserId)`, que é o que o amarra ao ator. */
export type CreateWhatsAppCommandPreviewInput = Readonly<{
  actorUserId: string
  classification: readonly WhatsAppCommandClassificationEntry[]
  companyId: string
  dueDate?: string | undefined
  expiresAt: Date
  groupingMode?: CteEmissionGroupingMode | undefined
  id: string
  kind: WhatsAppCommandKind
  period?: string | undefined
  previewSha256: string
  selection: WhatsAppCommandSelection
}>

export type WhatsAppCommandJournalStepInput = Readonly<{
  documentKind: WhatsAppCommandDocumentKind
  groupKey: string
  idempotencyKey: string
}>

export type ClaimWhatsAppCommandInput = Readonly<{
  companyId: string
  id: string
  now: Date
  previewSha256: string
  steps: readonly WhatsAppCommandJournalStepInput[]
}>

export type MarkWhatsAppCommandJournalStepInput = Readonly<{
  companyId: string
  documentId?: string | undefined
  errorCode?: string | undefined
  id: string
  status: WhatsAppCommandDocumentStatus
}>

export type WhatsAppCommandSettlementOutcome = Extract<
  WhatsAppCommandStatus,
  'settled' | 'settled_partial'
>

/** O passo que a liquidação acrescenta: a fatura de um tomador, com o id dela ou o código da recusa. */
export type RecordWhatsAppCommandJournalStepInput = Readonly<{
  companyId: string
  documentId?: string | undefined
  documentKind: WhatsAppCommandDocumentKind
  errorCode?: string | undefined
  groupKey: string
  idempotencyKey: string
  requestId: string
  status: WhatsAppCommandDocumentStatus
}>

type RequestReference = Readonly<{ companyId: string; id: string }>

export type WhatsAppCommandRepositoryPort = Readonly<{
  /** `undefined` quando o ator não tem membership na empresa: não há pedido sem vínculo. */
  createPreview(
    input: CreateWhatsAppCommandPreviewInput,
  ): Promise<WhatsAppCommandRequest | undefined>
  findById(input: RequestReference): Promise<WhatsAppCommandRequest | undefined>
  /** Quem não pega a linha recebe `undefined` e responde com o estado atual; nada do diário é gravado. */
  claimForConfirmation(
    input: ClaimWhatsAppCommandInput,
  ): Promise<WhatsAppCommandRequest | undefined>
  markSuperseded(input: RequestReference): Promise<boolean>
  markExpired(input: RequestReference & Readonly<{ now: Date }>): Promise<boolean>
  listJournal(
    input: Readonly<{ companyId: string; requestId: string }>,
  ): Promise<readonly WhatsAppCommandJournalStep[]>
  markJournalStep(input: MarkWhatsAppCommandJournalStepInput): Promise<boolean>
  /** Grava ou atualiza o passo pelo unique `(request_id, document_kind, group_key)`. */
  recordJournalStep(input: RecordWhatsAppCommandJournalStepInput): Promise<void>
  markDispatched(input: RequestReference): Promise<boolean>
  /** Os `dispatched` todos e os `confirming` que pararam antes de `stuckConfirmingBefore`. */
  listForSettlement(
    input: Readonly<{ companyId: string; stuckConfirmingBefore: Date }>,
  ): Promise<readonly WhatsAppCommandRequest[]>
  markSettled(
    input: RequestReference &
      Readonly<{
        now: Date
        outcome: WhatsAppCommandSettlementOutcome
        settlementOutcome: WhatsAppCommandSettlementCode
      }>,
  ): Promise<boolean>
}>
