/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, ilike } from 'drizzle-orm'

import {
  deliveryClientExceptions,
  deliveryClientWindows,
  deliveryClients,
} from '../../database/delivery-client.schema.js'
import type {
  DeliveryClient,
  DeliveryClientDetail,
  DeliveryClientListFilters,
  DeliveryClientPage,
  DeliveryClientRepositoryPort,
  DeliveryClientWriteInput,
} from '../application/delivery-client.port.js'
import type {
  DeliveryDateException,
  DeliveryWeeklyWindow,
} from '../domain/delivery-window.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type ClientRow = typeof deliveryClients.$inferSelect

export class DrizzleDeliveryClientRepository implements DeliveryClientRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async create(input: {
    readonly companyId: string
    readonly taxId: string
    readonly values: DeliveryClientWriteInput
  }): Promise<DeliveryClient> {
    const [created] = await this.database
      .insert(deliveryClients)
      .values({ companyId: input.companyId, taxId: input.taxId, ...input.values })
      .returning()

    return toClient(created as ClientRow)
  }

  public async findById(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<DeliveryClientDetail | null> {
    const [row] = await this.database
      .select()
      .from(deliveryClients)
      .where(and(eq(deliveryClients.companyId, input.companyId), eq(deliveryClients.id, input.id)))
      .limit(1)

    return row === undefined ? null : this.withSchedule(row)
  }

  public async findByTaxId(input: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<DeliveryClientDetail | null> {
    /**
     * Igualdade exata, jamais `LIKE`: o documento é dado de pessoa quando é CPF, e a busca por
     * prefixo permitiria varrer a base oito dígitos por vez (`security.md` §1).
     */
    const [row] = await this.database
      .select()
      .from(deliveryClients)
      .where(
        and(eq(deliveryClients.companyId, input.companyId), eq(deliveryClients.taxId, input.taxId)),
      )
      .limit(1)

    return row === undefined ? null : this.withSchedule(row)
  }

  public async list(input: {
    readonly companyId: string
    readonly filters: DeliveryClientListFilters
  }): Promise<DeliveryClientPage> {
    const { filters } = input
    const rows = await this.database
      .select()
      .from(deliveryClients)
      .where(
        and(
          eq(deliveryClients.companyId, input.companyId),
          ...(filters.cursor === undefined ? [] : [gt(deliveryClients.id, filters.cursor)]),
          ...(filters.status === undefined ? [] : [eq(deliveryClients.status, filters.status)]),
          ...(filters.requiresScheduling === undefined
            ? []
            : [eq(deliveryClients.requiresScheduling, filters.requiresScheduling)]),
          ...(filters.nameContains === undefined
            ? []
            : [ilike(deliveryClients.displayName, `%${filters.nameContains}%`)]),
        ),
      )
      .orderBy(asc(deliveryClients.id))
      .limit(filters.limit + 1)

    const page = rows.slice(0, filters.limit)

    return {
      items: page.map(toClient),
      nextCursor: rows.length > filters.limit ? (page.at(-1)?.id ?? null) : null,
    }
  }

  public async replaceExceptions(input: {
    readonly companyId: string
    readonly exceptions: readonly DeliveryDateException[]
    readonly id: string
  }): Promise<readonly DeliveryDateException[]> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .delete(deliveryClientExceptions)
        .where(
          and(
            eq(deliveryClientExceptions.companyId, input.companyId),
            eq(deliveryClientExceptions.deliveryClientId, input.id),
          ),
        )
      if (input.exceptions.length > 0) {
        await transaction.insert(deliveryClientExceptions).values(
          input.exceptions.map((exception) => ({
            closesAt: exception.closesAt,
            companyId: input.companyId,
            deliveryClientId: input.id,
            exceptionOn: exception.exceptionOn,
            kind: exception.kind,
            opensAt: exception.opensAt,
          })),
        )
      }

      return input.exceptions
    })
  }

  public async replaceWindows(input: {
    readonly companyId: string
    readonly id: string
    readonly windows: readonly DeliveryWeeklyWindow[]
  }): Promise<readonly DeliveryWeeklyWindow[]> {
    /**
     * A semana é substituída inteira, numa transação: editar item a item deixaria janela órfã de uma
     * versão anterior, e o roteiro do dia seguinte respeitaria um horário que ninguém cadastrou.
     */
    return this.database.transaction(async (transaction) => {
      await transaction
        .delete(deliveryClientWindows)
        .where(
          and(
            eq(deliveryClientWindows.companyId, input.companyId),
            eq(deliveryClientWindows.deliveryClientId, input.id),
          ),
        )
      if (input.windows.length > 0) {
        await transaction.insert(deliveryClientWindows).values(
          input.windows.map((window) => ({
            closesAt: window.closesAt,
            companyId: input.companyId,
            deliveryClientId: input.id,
            opensAt: window.opensAt,
            weekday: window.weekday,
          })),
        )
      }

      return input.windows
    })
  }

  public async update(input: {
    readonly companyId: string
    readonly id: string
    readonly values: DeliveryClientWriteInput
  }): Promise<DeliveryClient | null> {
    const [updated] = await this.database
      .update(deliveryClients)
      .set({ ...input.values, updatedAt: new Date() })
      .where(and(eq(deliveryClients.companyId, input.companyId), eq(deliveryClients.id, input.id)))
      .returning()

    return updated === undefined ? null : toClient(updated)
  }

  private async withSchedule(row: ClientRow): Promise<DeliveryClientDetail> {
    const [windows, exceptions] = await Promise.all([
      this.database
        .select({
          closesAt: deliveryClientWindows.closesAt,
          opensAt: deliveryClientWindows.opensAt,
          weekday: deliveryClientWindows.weekday,
        })
        .from(deliveryClientWindows)
        .where(
          and(
            eq(deliveryClientWindows.companyId, row.companyId),
            eq(deliveryClientWindows.deliveryClientId, row.id),
          ),
        )
        .orderBy(asc(deliveryClientWindows.weekday), asc(deliveryClientWindows.opensAt)),
      this.database
        .select({
          closesAt: deliveryClientExceptions.closesAt,
          exceptionOn: deliveryClientExceptions.exceptionOn,
          kind: deliveryClientExceptions.kind,
          opensAt: deliveryClientExceptions.opensAt,
        })
        .from(deliveryClientExceptions)
        .where(
          and(
            eq(deliveryClientExceptions.companyId, row.companyId),
            eq(deliveryClientExceptions.deliveryClientId, row.id),
          ),
        )
        .orderBy(asc(deliveryClientExceptions.exceptionOn)),
    ])

    return { ...toClient(row), exceptions, windows }
  }
}

function toClient(row: ClientRow): DeliveryClient {
  return {
    defaultServiceTimeMinutes: row.defaultServiceTimeMinutes,
    deliveryFeeAmount: row.deliveryFeeAmount,
    displayName: row.displayName,
    id: row.id,
    notes: row.notes,
    requiresScheduling: row.requiresScheduling,
    status: row.status,
    taxId: row.taxId,
  }
}
