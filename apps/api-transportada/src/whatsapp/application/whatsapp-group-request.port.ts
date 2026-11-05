/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T4: as portas do pedido no grupo do motorista — onde ele fica (repositório), o que ele pede
 * (o fluxo, T5) e por onde a resposta sai (o grupo, pelo Evolution).
 */
import type { WhatsAppGroupRequestStatus } from '../../database/whatsapp-group-request.schema.js'
import type { WhatsAppRouteContinuation } from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'

export type GroupRequest = {
  readonly attempts: number
  readonly companyId: string
  readonly driverId: string
  readonly expiresAt: Date
  readonly groupJid: string
  readonly id: string
  /** Quem abriu (só dígitos): só ele responde sem marcar o bot. */
  readonly ownerNumber: string
  readonly state: Readonly<Record<string, unknown>>
  readonly step: string
  readonly version: bigint
}

export type GroupRequestRepositoryPort = {
  /**
   * Grava a mensagem aceita uma vez só pelo id do provedor. `false` quando ela já tinha chegado
   * (reentrega do Evolution): quem chama não faz nada.
   */
  claimMessage(input: {
    readonly companyId: string
    readonly providerMessageId: string
    readonly senderNumber: string
    readonly via: 'mention' | 'owner_reply'
  }): Promise<boolean>
  /** Fecha como `expired` o pedido aberto cujo prazo passou e devolve o aberto que vale, ou `null`. */
  findOpen(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly now: Date
  }): Promise<GroupRequest | null>
  /** Liga a mensagem gravada ao pedido, com o passo em que ela chegou (o histórico de quem respondeu). */
  linkMessage(input: {
    readonly companyId: string
    readonly providerMessageId: string
    readonly requestId: string
    readonly stepBefore: string
  }): Promise<void>
  /**
   * Abre o pedido (reserva atômica pelo índice único parcial). `null` quando outro pedido abriu antes
   * no mesmo grupo. O prazo vem da configuração da empresa (`group_request_timeout_seconds`).
   */
  open(input: {
    readonly companyId: string
    readonly driverId: string
    readonly groupJid: string
    readonly now: Date
    readonly ownerNumber: string
    readonly step: string
  }): Promise<GroupRequest | null>
  /**
   * Anda o pedido se ele ainda está na versão lida (outra mensagem no meio perde). Sem `close`, renova
   * o prazo a partir de `now`; com `close`, fecha. `false` quando a versão mudou ou ele já fechou.
   */
  update(input: {
    readonly attempts: number
    readonly close?: Exclude<WhatsAppGroupRequestStatus, 'open'>
    readonly companyId: string
    readonly id: string
    readonly now: Date
    readonly state: Readonly<Record<string, unknown>>
    readonly step: string
    readonly version: bigint
  }): Promise<boolean>
}

/** Uma mensagem do grupo que chegou ao fluxo do pedido. */
export type GroupFlowTurn = {
  readonly request: GroupRequest
  /** Quem escreveu (só dígitos); pode não ser o dono quando marcou o bot para responder por ele. */
  readonly sender: string
  readonly senderName: null | string
  /** Sem a marcação do bot, sem espaços nas pontas. */
  readonly text: string
  /** Spec 292 T9: a localização que o dono compartilhou (só em `locationReceived`). */
  readonly location?: { readonly latitude: number; readonly longitude: number }
}

export type GroupFlowOutcome =
  /** O pedido segue: novo passo e estado, e o que o bot diz. */
  | {
      readonly kind: 'continue'
      readonly replies: readonly string[]
      readonly state: Readonly<Record<string, unknown>>
      readonly step: string
    }
  /** O pedido terminou (concluído ou recusado com motivo): fecha como `completed`. */
  | {
      readonly kind: 'done'
      readonly replies: readonly string[]
      /** Spec 294 RF8–RF10: a baixa fechou a parada; o roteador do grupo oferece a próxima rota. */
      readonly routeContinuation?: WhatsAppRouteContinuation
    }
  /** A resposta não cabe na pergunta aberta: o bot diz o motivo e repete a pergunta (regra 7). */
  | { readonly kind: 'not_understood'; readonly prompt: string; readonly reason: string }

/** Spec 292 T5: o que o pedido pede, passo a passo. A sessão (T4) só guarda e encadeia. */
export type GroupRequestFlow = {
  answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome>
  readonly initialStep: string
  /** A localização compartilhada pelo dono do pedido: avança o passo que a espera, ou `null` se não há. */
  locationReceived?(turn: GroupFlowTurn): GroupFlowOutcome | null
  start(turn: GroupFlowTurn): Promise<GroupFlowOutcome>
}

/** A resposta do bot no grupo. Assíncrona: o webhook não espera o ritmo de envio do número (spec 289). */
export type GroupReplySenderPort = {
  send(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly texts: readonly string[]
  }): void
}
