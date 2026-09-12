/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  WhatsAppCommandDocumentOutcome,
  WhatsAppCommandSettlementVerdict,
} from '../domain/whatsapp-command-settlement.policy.js'

/** Um pedido em trabalho, com o estado de cada documento dele já classificado. */
export type SettlementCandidate = Readonly<{
  actorUserId: string
  companyId: string
  confirmedAt: Date | undefined
  documents: readonly WhatsAppCommandDocumentOutcome[]
  id: string
  status: string
}>

/**
 * Cross-tenant por natureza — a rotina varre a instalação —, mas toda junção leva a empresa, e cada
 * pedido volta com a dele: é ela que vai no `x-company-id` da chamada à API.
 */
export type SettlementCandidateSourcePort = Readonly<{
  listCandidates(input: {
    readonly limit: number
    readonly stuckConfirmingBefore: Date
  }): Promise<readonly SettlementCandidate[]>
}>

export type SettlementApiResult = Readonly<{ message: string | undefined; outcome: string }>

export type WhatsAppCommandSettlementApiPort = Readonly<{
  settle(input: {
    readonly companyId: string
    readonly hint: WhatsAppCommandSettlementVerdict
    readonly requestId: string
  }): Promise<SettlementApiResult>
}>

/**
 * O número vinculado e verificado de quem confirmou; `undefined` quando ele se desvinculou ou a
 * verificação é anterior a `verifiedSince` (T014b: chip reciclado não recebe o resumo).
 */
export type SettlementRecipientPort = Readonly<{
  findVerifiedPhone(input: {
    readonly userId: string
    readonly verifiedSince: Date
  }): Promise<string | undefined>
}>

/** Texto livre, sem template: só entrega dentro da janela de 24 h da Meta. */
export type SettlementSummarySenderPort = Readonly<{
  sendText(input: {
    readonly body: string
    readonly companyId: string
    readonly to: string
  }): Promise<void>
}>
