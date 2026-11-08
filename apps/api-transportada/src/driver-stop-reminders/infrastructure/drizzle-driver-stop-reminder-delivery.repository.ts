/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../database/company-driver-reminder-settings.schema.js'
import { driverStopReminders } from '../../database/driver-stop-reminder.schema.js'
import { fleetDriverWhatsappGroups, fleetDrivers } from '../../database/fleet.schema.js'
import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { companyRouteOptimizationSettings } from '../../database/route-suggestion.schema.js'
import { tripDocuments, tripStops } from '../../database/trip.schema.js'
import { whatsappEvolutionSettings } from '../../database/whatsapp-evolution.schema.js'
import { resolveRecipientDisplayName } from '../../trips/domain/delivery-contact.policy.js'
import { RECIPIENT_PARTICIPANT_ROLE } from '../../trips/domain/delivery-event.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  CloseDeliveredStopReminderParams,
  DeliverableStopReminder,
  DriverStopReminderDeliveryRepository,
  EscalateStopReminderParams,
  RecordStopReminderSentParams,
  ReleaseStopReminderParams,
  ReserveStopReminderAttemptParams,
  StopReminderDeliveryContext,
} from '../application/driver-stop-reminder-delivery.port.js'
import {
  DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS,
  DRIVER_STOP_REMINDER_IDLE_VARIANT,
  DRIVER_STOP_REMINDER_STAGE,
} from '../domain/driver-stop-reminder.constant.js'
import type {
  DriverStopReminderIdleVariant,
  OperatingHoursRange,
} from '../domain/driver-stop-reminder.types.js'
import { readCurrentTripDriver } from './current-trip-driver.query.js'
import { readNationalHolidayDates } from './national-holiday-dates.reader.js'
import { resolveStopReminderClosedStatus } from './stop-reminder-closed-status.mapper.js'

const DEFAULT_TIME_ZONE = 'America/Sao_Paulo'
const PENDING = 'pending'

export type StopReminderHolidayReader = (params: {
  readonly companyId: string
  readonly timeZone: string
  readonly now: Date
}) => Promise<readonly string[]>

export class DrizzleDriverStopReminderDeliveryRepository
  implements DriverStopReminderDeliveryRepository
{
  public constructor(
    private readonly executor: TripQueryable,
    private readonly readHolidayDates: StopReminderHolidayReader = readNationalHolidayDates,
  ) {}

  public async findReminder(params: {
    readonly companyId: string
    readonly reminderId: string
  }): Promise<DeliverableStopReminder | undefined> {
    const [row] = await this.executor
      .select()
      .from(driverStopReminders)
      .where(
        and(
          eq(driverStopReminders.companyId, params.companyId),
          eq(driverStopReminders.id, params.reminderId),
        ),
      )
      .limit(1)
    return row
  }

  public async readContext(params: {
    readonly reminder: DeliverableStopReminder
    readonly now: Date
  }): Promise<StopReminderDeliveryContext> {
    const { reminder, now } = params
    const { companyId } = reminder
    const [settings, timeZone, stop, notes, crewDriver, slot] = await Promise.all([
      this.readSettings(companyId),
      this.readTimeZone(companyId),
      this.readStop(reminder),
      this.readNotes(reminder),
      readCurrentTripDriver(this.executor, { companyId, tripId: reminder.tripId }),
      this.readSendSlot(companyId),
    ])
    const driver = crewDriver ?? (await this.readDriver(reminder))
    const groupJid = await this.readGroupJid(companyId, driver.id)
    return {
      driver: { id: driver.id, name: driver.name },
      groupJid,
      holidayDates: await this.readHolidayDates({ companyId, now, timeZone }),
      idleVariant: await this.readIdleVariant(reminder),
      sendSlotAt: slot,
      settings,
      stop: { ...stop, ...notes },
      timeZone,
    }
  }

  public async reserveAttempt(
    params: ReserveStopReminderAttemptParams,
  ): Promise<bigint | undefined> {
    const rows = await this.executor
      .update(driverStopReminders)
      .set({
        dispatchingUntil: params.dispatchingUntil,
        updatedAt: params.now,
        version: sql`${driverStopReminders.version} + 1`,
      })
      .where(
        and(
          eq(driverStopReminders.companyId, params.companyId),
          eq(driverStopReminders.id, params.reminderId),
          eq(driverStopReminders.version, params.version),
          eq(driverStopReminders.status, PENDING),
          or(
            isNull(driverStopReminders.dispatchingUntil),
            lte(driverStopReminders.dispatchingUntil, params.now),
          ),
        ),
      )
      .returning({ version: driverStopReminders.version })
    return rows[0]?.version
  }

  public async recordSent(params: RecordStopReminderSentParams): Promise<void> {
    await this.executor
      .update(driverStopReminders)
      .set({
        attempts: sql`${driverStopReminders.attempts} + 1`,
        dispatchingUntil: null,
        dueAt: params.nextDueAt,
        lastChannel: params.channel,
        lastProviderMessageId: params.providerMessageId,
        lastSentAt: params.sentAt,
        updatedAt: params.sentAt,
        version: sql`${driverStopReminders.version} + 1`,
      })
      .where(this.versionedReminder(params))
  }

  public async release(params: ReleaseStopReminderParams): Promise<void> {
    await this.executor
      .update(driverStopReminders)
      .set({
        dispatchingUntil: null,
        dueAt: params.dueAt,
        updatedAt: new Date(),
        version: sql`${driverStopReminders.version} + 1`,
      })
      .where(this.versionedReminder(params))
  }

  public async close(params: CloseDeliveredStopReminderParams): Promise<void> {
    await this.executor
      .update(driverStopReminders)
      .set({
        closedAt: params.closedAt,
        closedReason: params.reason,
        dispatchingUntil: null,
        status: resolveStopReminderClosedStatus(params.reason),
        updatedAt: params.closedAt,
      })
      .where(this.versionedReminder(params))
  }

  public async escalate(params: EscalateStopReminderParams): Promise<void> {
    await this.executor
      .update(driverStopReminders)
      .set({
        dispatchingUntil: null,
        escalatedAt: params.escalatedAt,
        status: 'escalated',
        updatedAt: params.escalatedAt,
      })
      .where(this.pendingReminder(params))
  }

  private pendingReminder(params: { readonly companyId: string; readonly reminderId: string }) {
    return and(
      eq(driverStopReminders.companyId, params.companyId),
      eq(driverStopReminders.id, params.reminderId),
      eq(driverStopReminders.status, PENDING),
    )
  }

  private versionedReminder(params: {
    readonly companyId: string
    readonly reminderId: string
    readonly version: bigint
  }) {
    return and(this.pendingReminder(params), eq(driverStopReminders.version, params.version))
  }

  private async readSettings(companyId: string): Promise<StopReminderDeliveryContext['settings']> {
    const [row] = await this.executor
      .select({
        dwellMinutes: companyDriverReminderSettings.dwellMinutes,
        enabled: companyDriverReminderSettings.enabled,
        graceMinMinutes: companyDriverReminderSettings.graceMinMinutes,
        gracePercent: companyDriverReminderSettings.gracePercent,
        idleMinutes: companyDriverReminderSettings.idleMinutes,
        intervalMinutes: companyDriverReminderSettings.intervalMinutes,
        maxAttempts: companyDriverReminderSettings.maxAttempts,
        operatingHours: companyDriverReminderSettings.operatingHours,
      })
      .from(companyDriverReminderSettings)
      .where(eq(companyDriverReminderSettings.companyId, companyId))
      .limit(1)
    if (row === undefined) {
      return DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS
    }
    return { ...row, operatingHours: row.operatingHours as readonly OperatingHoursRange[] }
  }

  private async readTimeZone(companyId: string): Promise<string> {
    const [row] = await this.executor
      .select({ timeZone: companyRouteOptimizationSettings.timezone })
      .from(companyRouteOptimizationSettings)
      .where(eq(companyRouteOptimizationSettings.companyId, companyId))
      .limit(1)
    return row?.timeZone ?? DEFAULT_TIME_ZONE
  }

  private async readStop(reminder: DeliverableStopReminder) {
    const [row] = await this.executor
      .select({
        arrivedAt: tripStops.arrivedAt,
        completedAt: tripStops.completedAt,
        enRouteSince: tripStops.enRouteSince,
      })
      .from(tripStops)
      .where(
        and(eq(tripStops.companyId, reminder.companyId), eq(tripStops.id, reminder.tripStopId)),
      )
      .limit(1)
    return {
      hasArrived: row?.arrivedAt != null,
      hasDeparted: row?.enRouteSince != null,
      isClosed: row?.completedAt != null,
    }
  }

  /** `route` quando a viagem já teve baixa; `start` quando ainda não houve nenhum evento (spec 299 T2.7). */
  private async readIdleVariant(
    reminder: DeliverableStopReminder,
  ): Promise<DriverStopReminderIdleVariant> {
    if (reminder.stage !== DRIVER_STOP_REMINDER_STAGE.IDLE)
      return DRIVER_STOP_REMINDER_IDLE_VARIANT.START
    const [row] = await this.executor
      .select({ id: tripStops.id })
      .from(tripStops)
      .where(
        and(
          eq(tripStops.companyId, reminder.companyId),
          eq(tripStops.tripId, reminder.tripId),
          isNotNull(tripStops.completedAt),
        ),
      )
      .limit(1)
    return row === undefined
      ? DRIVER_STOP_REMINDER_IDLE_VARIANT.START
      : DRIVER_STOP_REMINDER_IDLE_VARIANT.ROUTE
  }

  /** As notas ainda abertas da parada mandam na frase; sem nenhuma aberta, vale todas. */
  private async readNotes(reminder: DeliverableStopReminder) {
    const rows = await this.executor
      .select({
        deliveredAt: tripDocuments.deliveredAt,
        legalName: nfeParticipants.legalName,
        number: nfeDocuments.number,
        returnedAt: tripDocuments.returnedAt,
        tradeName: nfeParticipants.tradeName,
      })
      .from(tripDocuments)
      .leftJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, tripDocuments.companyId),
          eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
        ),
      )
      .leftJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.companyId, tripDocuments.companyId),
          eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
          eq(nfeParticipants.role, RECIPIENT_PARTICIPANT_ROLE),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, reminder.companyId),
          eq(tripDocuments.stopId, reminder.tripStopId),
          isNull(tripDocuments.releasedAt),
        ),
      )
      .orderBy(asc(nfeDocuments.number))
    const open = rows.filter((row) => row.deliveredAt === null && row.returnedAt === null)
    const shown = open.length > 0 ? open : rows
    const [first] = shown
    return {
      clientName: resolveRecipientDisplayName({
        legalName: first?.legalName ?? '',
        tradeName: first?.tradeName ?? '',
      }),
      firstNoteNumber: first?.number ?? '',
      noteCount: shown.length,
    }
  }

  private async readDriver(reminder: DeliverableStopReminder) {
    const [row] = await this.executor
      .select({ id: fleetDrivers.id, name: fleetDrivers.name })
      .from(fleetDrivers)
      .where(
        and(eq(fleetDrivers.companyId, reminder.companyId), eq(fleetDrivers.id, reminder.driverId)),
      )
      .limit(1)
    return row ?? { id: reminder.driverId, name: '' }
  }

  private async readGroupJid(companyId: string, driverId: string): Promise<string | undefined> {
    const [row] = await this.executor
      .select({ groupJid: fleetDriverWhatsappGroups.groupJid })
      .from(fleetDriverWhatsappGroups)
      .where(
        and(
          eq(fleetDriverWhatsappGroups.companyId, companyId),
          eq(fleetDriverWhatsappGroups.driverId, driverId),
        ),
      )
      .limit(1)
    return row?.groupJid
  }

  private async readSendSlot(companyId: string): Promise<Date | undefined> {
    const [row] = await this.executor
      .select({ nextSendAt: whatsappEvolutionSettings.nextSendAt })
      .from(whatsappEvolutionSettings)
      .where(eq(whatsappEvolutionSettings.companyId, companyId))
      .limit(1)
    return row?.nextSendAt ?? undefined
  }
}
