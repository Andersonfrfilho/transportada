/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF1/RF3: o detalhe de uma ocorrência — a linha da listagem (`findTripOccurrenceFeedItem`)
 * mais o motorista da viagem, para o escritório falar com ele. Toda junção leva `company_id`: um
 * degrau sem ele é o caminho pelo qual o telefone do motorista de uma empresa aparece na tela de
 * outra.
 */
import { and, eq, isNotNull, sql } from 'drizzle-orm'

import { fleetDrivers } from '../../database/fleet.schema.js'
import { identityUserPictures } from '../../database/identity-user-picture.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { tripDrivers } from '../../database/trip.schema.js'
import { userWhatsAppPhones } from '../../database/user-whatsapp-phone.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type {
  TripOccurrenceDetail,
  TripOccurrenceDetailDriver,
} from '../application/read-trip-occurrence-detail.use-case.js'
import { findTripOccurrenceFeedItem } from './trip-occurrence-feed.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** O endereço público da foto; o mesmo que o provedor de identidade já recebe no atributo `picture`. */
function publicPicturePath(token: null | string): null | string {
  return token === null ? null : `/public/company-users/${token}/picture`
}

/**
 * O primeiro condutor da viagem (`position = 1`, o mesmo que a listagem mostra em `driverName`).
 * Foto e WhatsApp dependem de a ficha ter vínculo **ativo** na empresa: vínculo encerrado não expõe
 * mais o rosto nem o número da pessoa.
 */
async function findTripDriver(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<TripOccurrenceDetailDriver | null> {
  const [row] = await queryable
    .select({
      driverId: fleetDrivers.id,
      email: fleetDrivers.email,
      name: fleetDrivers.name,
      phone: fleetDrivers.phone,
      picturePublicToken: identityUserPictures.publicToken,
      whatsappPhone: userWhatsAppPhones.phone,
    })
    .from(tripDrivers)
    .innerJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, tripDrivers.companyId),
        eq(fleetDrivers.id, tripDrivers.driverId),
      ),
    )
    .leftJoin(
      userCompanyMemberships,
      and(
        eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
        eq(userCompanyMemberships.id, fleetDrivers.membershipId),
        eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(identityUserPictures, eq(identityUserPictures.userId, userCompanyMemberships.userId))
    .leftJoin(
      userWhatsAppPhones,
      and(
        eq(userWhatsAppPhones.userId, userCompanyMemberships.userId),
        isNotNull(userWhatsAppPhones.verifiedAt),
      ),
    )
    .where(
      and(
        eq(tripDrivers.companyId, input.companyId),
        eq(tripDrivers.tripId, input.tripId),
        eq(tripDrivers.position, sql`1`),
      ),
    )
    .limit(1)

  if (row === undefined) return null
  return {
    driverId: row.driverId,
    email: row.email,
    name: row.name,
    phone: row.phone,
    picturePath: publicPicturePath(row.picturePublicToken ?? null),
    whatsappPhone: row.whatsappPhone ?? null,
  }
}

export async function findTripOccurrenceDetail(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<TripOccurrenceDetail | null> {
  const item = await findTripOccurrenceFeedItem(queryable, input)
  if (item === null) return null
  const driver = await findTripDriver(queryable, {
    companyId: input.companyId,
    tripId: item.tripId,
  })
  return { ...item, driver }
}
