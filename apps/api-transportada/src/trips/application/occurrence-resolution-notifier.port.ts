/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 RF9 / ADR-0105: os avisos do andamento da ocorrência, disparados **depois do commit**. Falha
 * de aviso nunca desfaz a resolução nem a reabertura; nenhum aviso leva nota ou texto de mensagem.
 */
export type OccurrenceResolutionNoticeTarget = {
  readonly companyId: string
  readonly occurrenceId: string
}

export type OccurrenceResolutionNotifierPort = {
  /** Aos da tripulação da viagem (motorista e ajudantes), se a viagem ainda não terminou. */
  notifyResolved(
    input: OccurrenceResolutionNoticeTarget & { readonly dedupeKey: string },
  ): Promise<void>
  /** A quem gravou o último `resolved`, se ainda pode resolver; `messageId` é a mensagem que reabriu. */
  notifyReopened(
    input: OccurrenceResolutionNoticeTarget & { readonly messageId: string },
  ): Promise<void>
}
