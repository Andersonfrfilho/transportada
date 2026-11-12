/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318: o canal do aviso de ocorrência por contratante (`contractor_occurrence_channels`). A escrita trava a
 * contratante, toma a trava de identidade do grupo (RF5, a mesma da ficha do motorista), confere as duas tabelas e
 * audita na mesma transação — a auditoria só diz o canal e se há grupo e número, nunca os valores.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  auditLogs,
  contractorOccurrenceChannels,
  contractors,
  fleetDriverWhatsappGroups,
  fleetDrivers,
} from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import {
  findWhatsappGroupContractorOwner,
  findWhatsappGroupDriverOwner,
  lockWhatsappGroupIdentity,
} from '../../database/whatsapp-group-identity.support.js'
import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import type {
  ContractorOccurrenceChannelActor,
  ContractorOccurrenceChannelRepositoryPort,
  ContractorOccurrenceChannelSettings,
  ContractorOccurrenceChannelView,
  WhatsappGroupOwner,
} from '../application/contractor-occurrence-channel.use-case.js'
import { ContractorOccurrenceGroupTakenError } from '../domain/contractor-occurrence-channel.error.js'
import { findContractorOccurrenceGroupTemplate } from './contractor-occurrence-group.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ENTITY_TYPE = 'contractor_occurrence_channel'
const GROUP_UNIQUE = 'contractor_occurrence_channels_company_group_unique'

const DEFAULT_VIEW: ContractorOccurrenceChannelView = {
  channel: 'email',
  emailFallback: true,
  groupJid: null,
  groupName: '',
  mentionPhone: null,
  updatedAt: null,
}

type ChannelRow = {
  readonly channel: string
  readonly emailFallback: boolean
  readonly groupJid: null | string
  readonly groupName: string
  readonly mentionPhone: null | string
  readonly updatedAt: Date
}

function toView(row: ChannelRow | undefined): ContractorOccurrenceChannelView {
  if (row === undefined) return DEFAULT_VIEW
  return {
    channel: row.channel === 'whatsapp_group' ? 'whatsapp_group' : 'email',
    emailFallback: row.emailFallback,
    groupJid: row.groupJid,
    groupName: row.groupName,
    mentionPhone: row.mentionPhone,
    updatedAt: row.updatedAt.toISOString(),
  }
}

const CHANNEL_COLUMNS = {
  channel: contractorOccurrenceChannels.channel,
  emailFallback: contractorOccurrenceChannels.emailFallback,
  groupJid: contractorOccurrenceChannels.groupJid,
  groupName: contractorOccurrenceChannels.groupName,
  mentionPhone: contractorOccurrenceChannels.mentionPhone,
  updatedAt: contractorOccurrenceChannels.updatedAt,
}

function auditShape(view: ContractorOccurrenceChannelView | ChannelRow) {
  return {
    channel: view.channel,
    emailFallback: view.emailFallback,
    hasGroup: view.groupJid !== null,
    hasMentionPhone: view.mentionPhone !== null,
  }
}

export class DrizzleContractorOccurrenceChannelRepository
  implements ContractorOccurrenceChannelRepositoryPort
{
  public constructor(private readonly database: Database) {}

  public async find(input: {
    readonly companyId: string
    readonly contractorId: string
  }): Promise<ContractorOccurrenceChannelView> {
    const [contractor] = await this.database
      .select({ id: contractors.id })
      .from(contractors)
      .where(
        and(eq(contractors.companyId, input.companyId), eq(contractors.id, input.contractorId)),
      )
      .limit(1)
    if (contractor === undefined) throw new ContractorNotFoundError()
    const [row] = await this.database
      .select(CHANNEL_COLUMNS)
      .from(contractorOccurrenceChannels)
      .where(
        and(
          eq(contractorOccurrenceChannels.companyId, input.companyId),
          eq(contractorOccurrenceChannels.contractorId, input.contractorId),
        ),
      )
      .limit(1)
    return toView(row)
  }

  public async listOwners(input: {
    readonly companyId: string
  }): Promise<readonly WhatsappGroupOwner[]> {
    const [drivers, contractorRows] = await Promise.all([
      this.database
        .select({
          groupJid: fleetDriverWhatsappGroups.groupJid,
          id: fleetDriverWhatsappGroups.driverId,
          name: fleetDrivers.name,
        })
        .from(fleetDriverWhatsappGroups)
        .innerJoin(
          fleetDrivers,
          and(
            eq(fleetDrivers.companyId, fleetDriverWhatsappGroups.companyId),
            eq(fleetDrivers.id, fleetDriverWhatsappGroups.driverId),
          ),
        )
        .where(eq(fleetDriverWhatsappGroups.companyId, input.companyId)),
      this.database
        .select({
          groupJid: contractorOccurrenceChannels.groupJid,
          id: contractorOccurrenceChannels.contractorId,
          name: contractors.displayName,
        })
        .from(contractorOccurrenceChannels)
        .innerJoin(
          contractors,
          and(
            eq(contractors.companyId, contractorOccurrenceChannels.companyId),
            eq(contractors.id, contractorOccurrenceChannels.contractorId),
          ),
        )
        .where(eq(contractorOccurrenceChannels.companyId, input.companyId)),
    ])
    return [
      ...drivers.map((row) => ({ ...row, kind: 'driver' as const })),
      ...contractorRows.flatMap((row) =>
        row.groupJid === null
          ? []
          : [{ groupJid: row.groupJid, id: row.id, kind: 'contractor' as const, name: row.name }],
      ),
    ]
  }

  public readGroupTemplate(input: { readonly companyId: string }): Promise<null | string> {
    return findContractorOccurrenceGroupTemplate(this.database, {
      companyId: input.companyId,
      typeKey: null,
    })
  }

  public async save(
    input: ContractorOccurrenceChannelActor & ContractorOccurrenceChannelSettings,
  ): Promise<ContractorOccurrenceChannelView> {
    const groupJid = input.channel === 'whatsapp_group' ? input.groupJid : null
    const values = {
      channel: input.channel,
      emailFallback: input.emailFallback,
      groupJid,
      groupName: input.channel === 'whatsapp_group' ? input.groupName : '',
      mentionPhone: input.channel === 'whatsapp_group' ? input.mentionPhone : null,
    }
    try {
      return await this.database.transaction(async (transaction) => {
        // Trava a contratante: duas trocas simultâneas do canal dela se enfileiram.
        const [contractor] = await transaction
          .select({ id: contractors.id })
          .from(contractors)
          .where(
            and(eq(contractors.companyId, input.companyId), eq(contractors.id, input.contractorId)),
          )
          .for('update')
          .limit(1)
        if (contractor === undefined) throw new ContractorNotFoundError()

        if (groupJid !== null) {
          const identity = { companyId: input.companyId, groupJid }
          await lockWhatsappGroupIdentity(transaction, identity)
          if ((await findWhatsappGroupDriverOwner(transaction, identity)) !== null) {
            throw new ContractorOccurrenceGroupTakenError('driver')
          }
          const owner = await findWhatsappGroupContractorOwner(transaction, identity)
          if (owner !== null && owner.contractorId !== input.contractorId) {
            throw new ContractorOccurrenceGroupTakenError('contractor')
          }
        }

        const [previous] = await transaction
          .select(CHANNEL_COLUMNS)
          .from(contractorOccurrenceChannels)
          .where(
            and(
              eq(contractorOccurrenceChannels.companyId, input.companyId),
              eq(contractorOccurrenceChannels.contractorId, input.contractorId),
            ),
          )
          .limit(1)

        const now = new Date()
        const [row] = await transaction
          .insert(contractorOccurrenceChannels)
          .values({
            companyId: input.companyId,
            contractorId: input.contractorId,
            ...values,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            set: { ...values, updatedAt: now },
            target: [
              contractorOccurrenceChannels.companyId,
              contractorOccurrenceChannels.contractorId,
            ],
          })
          .returning(CHANNEL_COLUMNS)
        if (row === undefined)
          throw new Error('contractor occurrence channel upsert returned no row')

        await transaction.insert(auditLogs).values({
          action: 'contractor-occurrence-channel.saved',
          actorUserId: input.actorUserId,
          afterSnapshot: auditShape(row),
          beforeSnapshot: previous === undefined ? null : auditShape(previous),
          companyId: input.companyId,
          correlationId: input.correlationId,
          entityId: input.contractorId,
          entityType: ENTITY_TYPE,
          permission: 'settings.manage',
          targetId: input.contractorId,
          targetType: ENTITY_TYPE,
        })
        return toView(row)
      })
    } catch (error) {
      // Corrida entre duas contratantes pelo mesmo grupo: o unique do banco decide.
      if (violatedUniqueConstraint(error) === GROUP_UNIQUE) {
        throw new ContractorOccurrenceGroupTakenError('contractor')
      }
      throw error
    }
  }
}
