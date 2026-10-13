/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4: o que as suítes de integração da conversa por assunto repetem — os casos de uso
 * montados sobre o Postgres, a mensagem gravada à mão com o autor que o CHECK pede, e o contador de
 * consultas (sem N+1).
 */
import { eq } from 'drizzle-orm'

import {
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDrivers,
  trips,
} from '../../src/database/database.schema.js'
import { createListMySubjectConversationsUseCase } from '../../src/occurrence-conversation/application/list-my-subject-conversations.use-case.js'
import { createListMySubjectMessagesUseCase } from '../../src/occurrence-conversation/application/list-my-subject-messages.use-case.js'
import { createMarkMySubjectReadUseCase } from '../../src/occurrence-conversation/application/mark-my-subject-read.use-case.js'
import { createOpenMySubjectConversationUseCase } from '../../src/occurrence-conversation/application/open-my-subject-conversation.use-case.js'
import { createDrizzleDriverSubjectUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation-subject.repository.js'
import { UNUSED_ATTACHMENT_STORAGE } from './conversation-attachment.fixture.js'
import type { Company, TestDatabase } from './trip-field-office-database.fixture.js'

export const SUBJECT_NOW = new Date('2026-10-09T12:00:00.000Z')

export type DriverActor = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
}

type Database = TestDatabase['db']

export function createSubjectHarness(database: Database, clock: () => Date = () => SUBJECT_NOW) {
  const unitOfWork = createDrizzleDriverSubjectUnitOfWork(database)
  return {
    list: createListMySubjectConversationsUseCase({ clock, unitOfWork }),
    markRead: createMarkMySubjectReadUseCase({ clock, unitOfWork }),
    messages: createListMySubjectMessagesUseCase({
      clock,
      storage: UNUSED_ATTACHMENT_STORAGE,
      unitOfWork,
    }),
    open: createOpenMySubjectConversationUseCase({ unitOfWork }),
    unitOfWork,
  }
}

export async function rejection(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}

type MessageSeed = {
  readonly body: string
  readonly channel?: 'app' | 'email' | 'portal' | 'whatsapp'
  readonly conversationId: string
  readonly createdAt: Date
  readonly direction: 'inbound' | 'outbound'
  readonly operatorUserId: string
  readonly driverUserId: string
  readonly status?: 'delivered' | 'queued' | 'read' | 'sent'
}

/** Respeita o CHECK de autor: a operação tem autor e status; o motorista, ele mesmo (ou o número, fora do app). */
export async function insertSubjectMessage(database: Database, seed: MessageSeed): Promise<string> {
  const channel = seed.channel ?? 'app'
  const outbound = seed.direction === 'outbound'
  const [row] = await database
    .insert(occurrenceConversationMessages)
    .values({
      authorUserId: outbound ? seed.operatorUserId : null,
      bodyText: seed.body,
      channel,
      companyId: await companyOf(database, seed.conversationId),
      conversationId: seed.conversationId,
      createdAt: seed.createdAt,
      direction: seed.direction,
      driverUserId: !outbound && channel === 'app' ? seed.driverUserId : null,
      senderAddress: !outbound && channel !== 'app' ? '+5511999990000' : null,
      status: outbound ? (seed.status ?? 'queued') : null,
      statusTimes: outbound ? { [seed.status ?? 'queued']: seed.createdAt.toISOString() } : {},
    })
    .returning({ id: occurrenceConversationMessages.id })
  if (row === undefined) throw new Error('EXPECTED_MESSAGE')
  return row.id
}

async function companyOf(database: Database, conversationId: string): Promise<string> {
  const [row] = await database
    .select({ companyId: occurrenceConversations.companyId })
    .from(occurrenceConversations)
    .where(eq(occurrenceConversations.id, conversationId))
  if (row === undefined) throw new Error('EXPECTED_CONVERSATION')
  return row.companyId
}

export async function firstTripOf(database: Database, company: Company): Promise<string> {
  const [row] = await database
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.companyId, company.companyId))
  if (row === undefined) throw new Error('EXPECTED_TRIP')
  return row.id
}

/** Troca o principal da viagem com o segundo: o teto de posições não deixa uma livre, então a tripulação é regravada. */
export async function swapPrincipal(database: Database, tripId: string): Promise<void> {
  const crew = await database.select().from(tripDrivers).where(eq(tripDrivers.tripId, tripId))
  if (crew.length !== 2) throw new Error('EXPECTED_TWO_DRIVERS')
  await database.delete(tripDrivers).where(eq(tripDrivers.tripId, tripId))
  await database.insert(tripDrivers).values(
    crew.map((member) => ({
      ...member,
      id: crypto.randomUUID(),
      position: member.position === 1n ? 2n : 1n,
    })),
  )
}

/** Conta as consultas que o repositório faz na transação — o que o contrato chama de "sem N+1". */
export function countQueries(database: Database): {
  readonly counted: Database
  readonly queries: () => number
} {
  const verbs = new Set(['delete', 'execute', 'insert', 'select', 'selectDistinct', 'update'])
  let total = 0
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(source, property) {
        const value = Reflect.get(source, property, source) as unknown
        if (typeof value !== 'function') return value
        if (property === 'transaction') {
          return (work: (inner: object) => unknown, ...rest: unknown[]) =>
            (value as (...args: unknown[]) => unknown).call(
              source,
              (inner: object) => work(wrap(inner)),
              ...rest,
            )
        }
        return verbs.has(String(property))
          ? (...args: unknown[]) => {
              total += 1
              return (value as (...inner: unknown[]) => unknown).apply(source, args)
            }
          : value.bind(source)
      },
    })
  return { counted: wrap(database), queries: () => total }
}
