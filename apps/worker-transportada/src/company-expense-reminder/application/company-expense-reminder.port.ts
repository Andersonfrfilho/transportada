/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.4: as portas da rotina `company-expense.reminder.send`. Os tipos de regra espelham
 * `api-transportada/src/expenses/application/expense-reminder.port.ts` (cópia por valor; paridade em
 * `test/company-expense-reminder/parity.contract.ts`).
 */
export type ReminderKind = 'before' | 'due_today' | 'overdue'
export type ReminderChannel = 'email' | 'push' | 'whatsapp'

export type ReminderSettings = {
  readonly dailySummaryEnabled: boolean
  readonly dailySummaryHour: number
  readonly daysBefore: number
  readonly enabledChannels: readonly ReminderChannel[]
  readonly maxOverdueNotices: number
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  dailySummaryEnabled: false,
  dailySummaryHour: 8,
  daysBefore: 3,
  enabledChannels: ['email'],
  maxOverdueNotices: 3,
}

export type ReminderRecipient = {
  readonly channels: readonly ReminderChannel[]
  readonly userId: string
}

/** Quem pode receber, com o que o e-mail precisa: nome e endereço (nulo quando só há o contato por outro canal). */
export type ReminderPerson = ReminderRecipient & {
  readonly emailAddress: string | null
  readonly name: string
  /** Número verificado do WhatsApp (como cadastrado), ou nulo. */
  readonly whatsappPhone: string | null
}

export type ReminderOccurrence = {
  readonly categoryName: string
  readonly companyId: string
  readonly competence: string
  readonly dueDate: string
  readonly expectedAmount: string
  readonly expenseName: string
  readonly id: string
  readonly payeeName: string | null
  readonly responsibleUserId: string | null
}

export type SentReminderKey = {
  readonly companyId: string
  readonly day: string
  readonly kind: ReminderKind
  readonly occurrenceId: string
  readonly recipientUserId: string
}

export type ReminderEmail = {
  readonly html: string
  /** Correlaciona o recibo do provedor com o aviso (ocorrência, pessoa, dia e tipo). */
  readonly idempotencyKey: string
  readonly subject: string
  readonly text: string
  readonly to: string
}

export type CompanyExpenseReminderPorts = {
  /** Link do painel para o botão "Abrir Contas"; nulo → o botão some. */
  readonly appBaseUrl: string | null
  readonly companies: {
    displayName(input: { companyId: string }): Promise<string>
    listWithOpenOccurrences(): Promise<readonly string[]>
  }
  readonly mailer: {
    /** Lança se o provedor não aceitou o envio. */
    send(email: ReminderEmail): Promise<void>
  }
  readonly whatsapp: {
    /** Lança se o envio não saiu (canal não configurado, número recusado, instância fora). */
    sendText(input: {
      readonly body: string
      readonly companyId: string
      readonly number: string
    }): Promise<void>
  }
  readonly occurrences: {
    /** Só ocorrência `open`. */
    listOpen(input: { companyId: string }): Promise<readonly ReminderOccurrence[]>
  }
  readonly people: {
    findAdmins(input: { companyId: string }): Promise<readonly ReminderPerson[]>
    findById(input: { companyId: string; userId: string }): Promise<ReminderPerson | null>
  }
  readonly sent: {
    /** `false` quando a chave já existia (única por ocorrência, responsável, dia e tipo). */
    record(key: SentReminderKey & { readonly channel: ReminderChannel }): Promise<boolean>
    release(key: SentReminderKey): Promise<void>
  }
  readonly settings: { get(input: { companyId: string }): Promise<ReminderSettings> }
  readonly templates: {
    /** A versão ativa mais alta do modelo de WhatsApp pt-BR da empresa, ou `null`. */
    findWhatsapp(input: {
      companyId: string
      key: string
    }): Promise<{ readonly body: string } | null>
    /** A versão ativa mais alta do modelo de e-mail pt-BR da empresa, ou `null`. */
    findEmail(input: {
      companyId: string
      key: string
    }): Promise<{ readonly body: string; readonly subject: string } | null>
  }
}
