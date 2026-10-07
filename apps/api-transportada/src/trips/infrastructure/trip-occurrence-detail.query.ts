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
import { tripDocumentOccurrences, tripDrivers } from '../../database/trip.schema.js'
import { userWhatsAppPhones } from '../../database/user-whatsapp-phone.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type { OccurrenceCorrectionEntry } from '../application/occurrence-correction.port.js'
import type {
  TripOccurrenceDetail,
  TripOccurrenceDetailDriver,
  TripOccurrenceDetailItem,
} from '../application/read-trip-occurrence-detail.use-case.js'
import type { TripOccurrenceFeedItem } from '../application/trip-occurrence-feed.use-case.js'
import { listOccurrenceCorrectionsByIds } from './occurrence-correction-read.query.js'
import { formatAmountCents, parseAmountToCents } from '../domain/occurrence-amount.policy.js'
import { listOccurrenceProductLines } from './drizzle-occurrence-product.repository.js'
import { resolveOccurrenceItems } from './occurrence-items.support.js'
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

/**
 * Spec 183 T207: os itens da ocorrência de nota, pelo mesmo leitor do portal do contratante. A
 * parada não aponta item; a nota inteira não grava linha nenhuma (lista vazia).
 */
async function findOccurrenceItems(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly item: TripOccurrenceFeedItem },
): Promise<readonly TripOccurrenceDetailItem[]> {
  const nfeDocumentId = input.item.document?.nfeDocumentId
  if (input.item.source !== 'document' || nfeDocumentId === undefined) return []
  const [row] = await queryable
    .select({ productCode: tripDocumentOccurrences.productCode })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.item.id),
      ),
    )
    .limit(1)
  if (row === undefined) return []
  const items = await resolveOccurrenceItems(queryable, {
    companyId: input.companyId,
    rows: [{ nfeDocumentId, occurrenceId: input.item.id, productCode: row.productCode }],
  })
  return items.get(input.item.id) ?? []
}

type RecordedValues = Pick<
  TripOccurrenceDetail,
  'declaredAmount' | 'itemValues' | 'referenceNumber'
>

const NO_RECORDED_VALUES: RecordedValues = {
  declaredAmount: null,
  itemValues: [],
  referenceNumber: null,
}

function formatStoredAmount(value: null | string): null | string {
  return value === null ? null : formatAmountCents(parseAmountToCents(value))
}

/**
 * Spec 247 (T7.2 R2): o que o registro gravou — o número do documento do cliente, o valor pago da
 * ocorrência e, por linha, o valor unitário copiado e o valor pago. Sem isso o escritório corrige às
 * cegas e a sugestão do acerto recalcularia pelo preço atual da nota em vez do copiado (D9).
 */
async function findRecordedValues(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly item: TripOccurrenceFeedItem },
): Promise<RecordedValues> {
  if (input.item.source !== 'document') return NO_RECORDED_VALUES
  const [occurrence] = await queryable
    .select({
      declaredAmount: tripDocumentOccurrences.declaredAmount,
      referenceNumber: tripDocumentOccurrences.referenceNumber,
    })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.item.id),
      ),
    )
    .limit(1)
  if (occurrence === undefined) return NO_RECORDED_VALUES

  const lines = await listOccurrenceProductLines(queryable, {
    companyId: input.companyId,
    occurrenceId: input.item.id,
  })
  return {
    declaredAmount: formatStoredAmount(occurrence.declaredAmount),
    itemValues: lines.map((line) => ({
      declaredAmount: formatStoredAmount(line.declaredAmount),
      productCode: line.productCode,
      quantity: line.quantity,
      unitValue: line.unitValue,
    })),
    referenceNumber: occurrence.referenceNumber,
  }
}

export async function findTripOccurrenceDetail(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<TripOccurrenceDetail | null> {
  const item = await findTripOccurrenceFeedItem(queryable, input)
  if (item === null) return null
  const [driver, items, corrections, recorded] = await Promise.all([
    findTripDriver(queryable, { companyId: input.companyId, tripId: item.tripId }),
    findOccurrenceItems(queryable, { companyId: input.companyId, item }),
    item.source === 'document'
      ? listOccurrenceCorrectionsByIds(queryable, {
          companyId: input.companyId,
          occurrenceIds: [item.id],
        })
      : Promise.resolve(new Map<string, OccurrenceCorrectionEntry[]>()),
    findRecordedValues(queryable, { companyId: input.companyId, item }),
  ])
  return { ...item, ...recorded, corrections: corrections.get(item.id) ?? [], driver, items }
}
