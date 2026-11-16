/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.1: forma das portas dos lembretes de vencimento (RF24 a RF28) e da baixa por resposta (RF29 a RF31),
 * fixada pelos contratos vermelhos de `test/expenses/`. A T7.2 (schema) e a T7.4/T7.4b implementam.
 */
import type { CompanyExpenseOccurrence } from './expense.port.js'

export type ReminderKind = 'before' | 'due_today' | 'overdue'
export type ReminderChannel = 'email' | 'push' | 'whatsapp'
export type ReplyChannel = 'email' | 'whatsapp'

export type ReminderSettings = {
  /** RF25: avisa N dias antes (padrão 3). */
  readonly daysBefore: number
  /** RF25: avisos de atraso, um por dia, até este limite (padrão 3). */
  readonly maxOverdueNotices: number
  /** RF26: canais ligados na empresa; só neles o aviso sai. */
  readonly enabledChannels: readonly ReminderChannel[]
  /** RF27: resumo diário ligado na empresa (padrão desligado). */
  readonly dailySummaryEnabled: boolean
  /**
   * RF27 (T7.3): a hora cheia de São Paulo a partir da qual saem o resumo **e** os avisos do dia (padrão 8). Uma hora
   * só por empresa: aviso de dinheiro de madrugada é lido junto com o resumo, ou não é lido.
   */
  readonly dailySummaryHour: number
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  dailySummaryEnabled: false,
  dailySummaryHour: 8,
  daysBefore: 3,
  enabledChannels: ['email'],
  maxOverdueNotices: 3,
}

/** A ocorrência com o que o aviso precisa da conta. `responsibleUserId` nulo → vai ao administrador (RF24). */
export type ReminderOccurrence = CompanyExpenseOccurrence & {
  readonly expenseName: string
  readonly responsibleUserId: string | null
}

export type ReminderRecipient = {
  /** RF26: e-mail sempre; WhatsApp e push só se a pessoa os ligou nas preferências. */
  readonly channels: readonly ReminderChannel[]
  readonly userId: string
}

/** Chave única do registro: (ocorrência, responsável, dia, tipo). Canal não entra: um aviso por pessoa e dia. */
export type SentReminderKey = {
  readonly companyId: string
  /** `yyyy-mm-dd`, dia civil de São Paulo em que o aviso saiu. */
  readonly day: string
  readonly kind: ReminderKind
  readonly occurrenceId: string
  readonly recipientUserId: string
}

export type ReminderNotification = SentReminderKey & {
  readonly channel: ReminderChannel
}

export type ReminderPorts = {
  readonly notifier: {
    /** Passa pelo módulo de notificação (modelo editável); nunca `sendNotification` direto. Lança se falhar. */
    send(notification: ReminderNotification): Promise<void>
  }
  readonly occurrences: {
    /** Toda ocorrência da empresa que pode precisar de aviso; o filtro por status é do caso de uso. */
    listForReminders(input: { companyId: string }): Promise<readonly ReminderOccurrence[]>
  }
  readonly recipients: {
    findAdmins(input: { companyId: string }): Promise<readonly ReminderRecipient[]>
    findById(input: { companyId: string; userId: string }): Promise<ReminderRecipient | null>
  }
  readonly sent: {
    /** `false` quando a chave já existia (única por ocorrência, responsável, dia e tipo). */
    record(key: SentReminderKey & { readonly channel: ReminderChannel }): Promise<boolean>
    /** Desfaz a reserva de `record` quando nenhum canal entregou, para a próxima rodada tentar de novo. */
    release(key: SentReminderKey): Promise<void>
  }
  readonly settings: {
    get(input: { companyId: string }): Promise<ReminderSettings>
  }
}

export type RunRemindersResult = {
  readonly failed: number
  readonly sent: number
  readonly skipped: number
}

/** Baixa por resposta: quem respondeu, pelo canal. WhatsApp pelo número; e-mail pelo link assinado de uso único. */
export type ReplySender =
  | { readonly channel: 'email'; readonly token: string }
  | { readonly channel: 'whatsapp'; readonly phone: string; readonly text: string }

export type ReplyRefusalReason =
  | 'already_used'
  | 'expired'
  | 'not_open'
  | 'not_responsible'
  | 'unknown_word'

export type SettleByReplyResult =
  | { readonly occurrence: CompanyExpenseOccurrence; readonly status: 'settled' }
  | { readonly reason: ReplyRefusalReason; readonly status: 'refused' }

export type ReplyLinkLookup =
  | {
      readonly companyId: string
      readonly occurrenceId: string
      readonly recipientUserId: string
      readonly status: 'valid'
    }
  | { readonly status: 'expired' | 'unknown' | 'used' }

export type ReplySettlementPorts = {
  readonly audit: {
    append(entry: {
      action: string
      actorUserId: string
      companyId: string
      entityId: string
      metadata: Record<string, unknown>
    }): Promise<void>
  }
  readonly identities: {
    /** O usuário da empresa dono do número (cadastro), ou `null`. */
    findByPhone(input: { companyId: string; phone: string }): Promise<{ userId: string } | null>
  }
  readonly links: {
    /** Só consulta; o uso é gravado por `consume`, na mesma baixa. */
    lookup(input: { token: string }): Promise<ReplyLinkLookup>
    /** Marca o link como usado; `false` se alguém usou antes (corrida). */
    consume(input: { token: string }): Promise<boolean>
  }
  readonly occurrences: {
    findById(input: { companyId: string; occurrenceId: string }): Promise<ReminderOccurrence | null>
    /** Só baixa o que está `open`; grava canal e autor da baixa por resposta. */
    markPaidByReply(input: {
      authorUserId: string
      channel: ReplyChannel
      occurrenceId: string
      paidAmount: string
      paidAt: string
    }): Promise<CompanyExpenseOccurrence | null>
    /** `paid` por resposta → `open`; `null` se não existe ou não foi baixa por resposta. */
    reopenReplySettlement(input: { occurrenceId: string }): Promise<CompanyExpenseOccurrence | null>
    /** Quando e por quem a baixa por resposta foi dada, ou `null` se não foi por resposta. */
    findReplySettlement(input: {
      companyId: string
      occurrenceId: string
    }): Promise<{ readonly at: string } | null>
  }
}
