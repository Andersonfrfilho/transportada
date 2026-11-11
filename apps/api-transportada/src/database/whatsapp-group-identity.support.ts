/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318 RF5: um grupo de WhatsApp é a identidade de quem fala nele, então ele pertence a no máximo um dono na
 * empresa — um motorista (`fleet_driver_whatsapp_groups`, spec 292) ou uma contratante
 * (`contractor_occurrence_channels`). Cada tabela tem o próprio `unique`; entre as duas, quem decide é esta trava:
 * as duas escritas a tomam pelo mesmo `(empresa, grupo)` antes de olhar a outra tabela, e a segunda espera a
 * primeira terminar.
 */
import { and, eq, sql } from 'drizzle-orm'

import { contractorOccurrenceChannels } from './contractor-occurrence-channel.schema.js'
import { contractors } from './delivery-client.schema.js'
import { fleetDriverWhatsappGroups, fleetDrivers } from './fleet.schema.js'
import type { TripTransaction } from '../trips/infrastructure/trip-queryable.type.js'

export async function lockWhatsappGroupIdentity(
  transaction: Pick<TripTransaction, 'execute'>,
  input: { readonly companyId: string; readonly groupJid: string },
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`whatsapp-group-identity:${input.companyId}:${input.groupJid}`}, 0))`,
  )
}

/** O motorista dono do grupo nesta empresa, ou `null`. */
export async function findWhatsappGroupDriverOwner(
  transaction: Pick<TripTransaction, 'select'>,
  input: { readonly companyId: string; readonly groupJid: string },
): Promise<null | { readonly driverId: string; readonly name: string }> {
  const [row] = await transaction
    .select({ driverId: fleetDriverWhatsappGroups.driverId, name: fleetDrivers.name })
    .from(fleetDriverWhatsappGroups)
    .innerJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, fleetDriverWhatsappGroups.companyId),
        eq(fleetDrivers.id, fleetDriverWhatsappGroups.driverId),
      ),
    )
    .where(
      and(
        eq(fleetDriverWhatsappGroups.companyId, input.companyId),
        eq(fleetDriverWhatsappGroups.groupJid, input.groupJid),
      ),
    )
    .limit(1)
  return row ?? null
}

/** A contratante dona do grupo nesta empresa (qualquer canal gravado), ou `null`. */
export async function findWhatsappGroupContractorOwner(
  transaction: Pick<TripTransaction, 'select'>,
  input: { readonly companyId: string; readonly groupJid: string },
): Promise<null | { readonly contractorId: string; readonly name: string }> {
  const [row] = await transaction
    .select({
      contractorId: contractorOccurrenceChannels.contractorId,
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
    .where(
      and(
        eq(contractorOccurrenceChannels.companyId, input.companyId),
        eq(contractorOccurrenceChannels.groupJid, input.groupJid),
      ),
    )
    .limit(1)
  return row ?? null
}
