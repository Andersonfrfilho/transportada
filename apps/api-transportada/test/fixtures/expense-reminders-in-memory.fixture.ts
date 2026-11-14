/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.1: dublê em memória das portas de lembrete e de baixa por resposta.
 */
import type {
  ReminderChannel,
  ReminderNotification,
  ReminderOccurrence,
  ReminderPorts,
  ReminderRecipient,
  ReminderSettings,
  ReplyChannel,
  ReplyLinkLookup,
  ReplySettlementPorts,
  SentReminderKey,
} from '../../src/expenses/application/expense-reminder.port.js'
import { DEFAULT_REMINDER_SETTINGS } from '../../src/expenses/application/expense-reminder.port.js'
import { COMPANY_A, COMPANY_B } from './expenses-in-memory.fixture.js'

export const RESPONSIBLE_ID = '00000000-0000-4000-8000-0000000000e1'
export const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000e2'
export const ADMIN_ID = '00000000-0000-4000-8000-0000000000e3'
export const RESPONSIBLE_PHONE = '5516999990001'
export const OTHER_PHONE = '5516999990002'
export const TODAY = '2026-11-10'

export function buildOccurrence(
  overrides: Partial<ReminderOccurrence> & { id: string },
): ReminderOccurrence {
  return {
    companyId: COMPANY_A,
    competence: '2026-11',
    dueDate: '2026-11-13',
    expectedAmount: '1500.00',
    expenseId: '00000000-0000-4000-8000-00000000f001',
    expenseName: 'Aluguel',
    paidAmount: null,
    paidAt: null,
    paidBy: null,
    responsibleUserId: RESPONSIBLE_ID,
    settlementNote: null,
    status: 'open',
    ...overrides,
  }
}

export type InMemoryReminders = {
  readonly failFor: Set<string>
  readonly notifications: ReminderNotification[]
  occurrences: ReminderOccurrence[]
  readonly recipients: Map<string, ReminderRecipient>
  settings: ReminderSettings
  readonly sentKeys: Set<string>
  readonly ports: ReminderPorts
}

const keyOf = (k: SentReminderKey): string =>
  `${k.companyId}|${k.occurrenceId}|${k.recipientUserId}|${k.day}|${k.kind}`

export function buildInMemoryReminders(): InMemoryReminders {
  const state: InMemoryReminders = {
    failFor: new Set(),
    notifications: [],
    occurrences: [],
    ports: undefined as unknown as ReminderPorts,
    recipients: new Map([
      [RESPONSIBLE_ID, { channels: ['email'], userId: RESPONSIBLE_ID }],
      [ADMIN_ID, { channels: ['email'], userId: ADMIN_ID }],
    ]),
    sentKeys: new Set(),
    settings: DEFAULT_REMINDER_SETTINGS,
  }
  const ports: ReminderPorts = {
    notifier: {
      send(n) {
        if (state.failFor.has(n.occurrenceId)) return Promise.reject(new Error('provider down'))
        state.notifications.push(n)
        return Promise.resolve()
      },
    },
    occurrences: {
      listForReminders: ({ companyId }) =>
        Promise.resolve(state.occurrences.filter((o) => o.companyId === companyId)),
    },
    recipients: {
      findAdmins: () =>
        Promise.resolve(
          [state.recipients.get(ADMIN_ID)].filter((r): r is ReminderRecipient => r !== undefined),
        ),
      findById: ({ userId }) => Promise.resolve(state.recipients.get(userId) ?? null),
    },
    sent: {
      record(key) {
        const k = keyOf(key)
        if (state.sentKeys.has(k)) return Promise.resolve(false)
        state.sentKeys.add(k)
        return Promise.resolve(true)
      },
    },
    settings: { get: () => Promise.resolve(state.settings) },
  }
  return Object.assign(state, { ports })
}

export type ReplyState = {
  readonly audit: { action: string; actorUserId: string; metadata: Record<string, unknown> }[]
  links: Map<string, ReplyLinkLookup & { used?: boolean }>
  occurrences: ReminderOccurrence[]
  readonly phones: Map<string, string>
  readonly replySettled: Map<string, { at: string; channel: ReplyChannel; authorUserId: string }>
  readonly ports: ReplySettlementPorts
}

export function buildInMemoryReplySettlement(occurrences: ReminderOccurrence[]): ReplyState {
  const state: ReplyState = {
    audit: [],
    links: new Map(),
    occurrences,
    phones: new Map([
      [RESPONSIBLE_PHONE, RESPONSIBLE_ID],
      [OTHER_PHONE, OTHER_USER_ID],
    ]),
    ports: undefined as unknown as ReplySettlementPorts,
    replySettled: new Map(),
  }
  const find = (id: string): ReminderOccurrence | undefined =>
    state.occurrences.find((o) => o.id === id)
  const ports: ReplySettlementPorts = {
    audit: {
      append(e) {
        state.audit.push({ action: e.action, actorUserId: e.actorUserId, metadata: e.metadata })
        return Promise.resolve()
      },
    },
    identities: {
      findByPhone: ({ phone }) => {
        const userId = state.phones.get(phone)
        return Promise.resolve(userId === undefined ? null : { userId })
      },
    },
    links: {
      consume({ token }) {
        const l = state.links.get(token)
        if (l === undefined || l.used === true) return Promise.resolve(false)
        l.used = true
        return Promise.resolve(true)
      },
      lookup({ token }) {
        const l = state.links.get(token)
        if (l === undefined) return Promise.resolve({ status: 'unknown' })
        return Promise.resolve(l.used === true ? { status: 'used' } : l)
      },
    },
    occurrences: {
      findById: ({ companyId, occurrenceId }) => {
        const o = find(occurrenceId)
        return Promise.resolve(o !== undefined && o.companyId === companyId ? o : null)
      },
      findReplySettlement: ({ occurrenceId }) =>
        Promise.resolve(state.replySettled.get(occurrenceId) ?? null),
      markPaidByReply({ authorUserId, channel, occurrenceId, paidAmount, paidAt }) {
        const o = find(occurrenceId)
        if (o === undefined || o.status !== 'open') return Promise.resolve(null)
        Object.assign(o, { paidAmount, paidAt, paidBy: authorUserId, status: 'paid' })
        state.replySettled.set(occurrenceId, {
          at: `${paidAt}T12:00:00.000Z`,
          authorUserId,
          channel,
        })
        return Promise.resolve(o)
      },
      reopenReplySettlement({ occurrenceId }) {
        const o = find(occurrenceId)
        if (o === undefined || !state.replySettled.has(occurrenceId)) return Promise.resolve(null)
        Object.assign(o, { paidAmount: null, paidAt: null, paidBy: null, status: 'open' })
        state.replySettled.delete(occurrenceId)
        return Promise.resolve(o)
      },
    },
  }
  return Object.assign(state, { ports })
}

export { COMPANY_A, COMPANY_B }
export type { ReminderChannel }
