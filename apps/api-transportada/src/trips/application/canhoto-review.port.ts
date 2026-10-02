/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF27/RF31: as fronteiras da conferência do canhoto — o que a rota entrega, o que o banco
 * precisa expor e o que vai para a trilha.
 */
import type {
  TripDeliveryProofCanhotoReadSource,
  TripDeliveryProofCanhotoReview,
  TripDeliveryProofCanhotoReviewOrigin,
  TripDeliveryProofCanhotoReviewReason,
} from '../../database/trip.schema.js'
import type {
  AutomaticCanhotoReviewCommand,
  CanhotoReviewState,
  ManualCanhotoReviewCommand,
} from '../domain/canhoto-review-decision.policy.js'

/**
 * A leitura automática entra pelo mesmo caminho da decisão humana porque o veredito é um só e a
 * regra de precedência (o automático nunca sobrescreve a mão) precisa dos dois lados no mesmo
 * lugar. `automatic` não é uma ação de tela — é o resultado da leitura chegando.
 */
export type CanhotoReviewCommand =
  | ManualCanhotoReviewCommand
  | (Readonly<{ action: 'automatic' }> & AutomaticCanhotoReviewCommand)

/**
 * O estado que a trava devolve: o mínimo para decidir, e o id para escrever. O `documentNumber` é
 * o número da nota do comprovante — a régua contra a qual o servidor confere a leitura (T7.1), e a
 * única que o cliente não pode forjar. `null` é a nota sem NF-e vinculada: não há o que conferir.
 */
export type LockedCanhotoProof = CanhotoReviewState & {
  readonly documentNumber: null | string
  readonly id: string
}

export type CanhotoReviewView = Readonly<{
  canhotoReadNumber: null | string
  canhotoReadSeries: null | string
  canhotoReadSource: TripDeliveryProofCanhotoReadSource | null
  canhotoReview: TripDeliveryProofCanhotoReview
  canhotoReviewAt: null | string
  canhotoReviewNote: null | string
  canhotoReviewOrigin: TripDeliveryProofCanhotoReviewOrigin | null
  canhotoReviewReason: TripDeliveryProofCanhotoReviewReason | null
}>

/**
 * Por onde o veredito chegou, decidido pela **rota** e nunca pelo corpo. `person` é o navegador, com
 * gente logada olhando; `service` é o robô de canhoto (spec 222), cross-tenant e desacompanhado —
 * só ele deixa trilha no ramo automático.
 */
export type CanhotoReviewChannel = 'person' | 'service'

/**
 * `security.md` §10: ator, alvo, IP e instante. O IP viaja em `metadata` na persistência — a tabela
 * não tem coluna própria — e o **texto livre nunca entra**: só o motivo da lista fechada (RF31).
 */
export type CanhotoReviewAuditEntry = Readonly<{
  action: string
  actorUserId: string
  companyId: string
  correlationId: string
  ipAddress: string
  permission: string
  proofId: string
  reason: TripDeliveryProofCanhotoReviewReason | null
  tripId: string
}>

export type CanhotoReviewTransaction = {
  readonly applyReview: (params: {
    readonly companyId: string
    readonly proofId: string
    readonly update: Record<string, Date | null | string>
  }) => Promise<void>
  readonly insertAudit: (entry: CanhotoReviewAuditEntry) => Promise<void>
  /**
   * ⚠️ Trava por `companyId` + ids. `null` vira 404, nunca 403: canhoto de outra empresa não se
   * distingue de inexistente.
   */
  readonly lockCanhotoProof: (params: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }) => Promise<LockedCanhotoProof | null>
  readonly readReviewView: (params: {
    readonly companyId: string
    readonly proofId: string
  }) => Promise<CanhotoReviewView>
}

export type CanhotoReviewUnitOfWork = {
  readonly execute: <TResult>(
    run: (transaction: CanhotoReviewTransaction) => Promise<TResult>,
  ) => Promise<TResult>
}

/** O que a rota entrega ao caso de uso. `companyId` e `actorUserId` vêm do contexto autenticado. */
export type ReviewCanhotoProofInput = {
  readonly actorUserId: string
  readonly channel: CanhotoReviewChannel
  readonly command: CanhotoReviewCommand
  readonly companyId: string
  readonly correlationId: string
  readonly documentId: string
  readonly ipAddress: string
  readonly tripId: string
  readonly unitOfWork: CanhotoReviewUnitOfWork
}

export type CanhotoReviewPort = {
  readonly review: (
    input: Omit<ReviewCanhotoProofInput, 'unitOfWork'>,
  ) => Promise<CanhotoReviewView>
}
