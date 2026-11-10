/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 (D2): a marca `blocks_contractor_notice` do tipo da ocorrência, para quem fala com a contratante e não lê o
 * tipo (o envio manual do escritório: e-mail, chat por e-mail e portal). Quem decide é
 * `occurrenceTypeNeverNotifiesContractor`; aqui só a leitura, sempre com o `company_id` nas duas tabelas.
 *
 * Ocorrência de parada (sem tipo cadastrado) ou tipo sem id devolve `false`: só tipo de nota carrega a marca.
 */
import { and, eq } from 'drizzle-orm'

import { companyOccurrenceTypes } from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function findOccurrenceTypeBlocksContractorNotice(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceTypeId: null | string },
): Promise<boolean> {
  if (input.occurrenceTypeId === null) return false
  const [row] = await queryable
    .select({ blocksContractorNotice: companyOccurrenceTypes.blocksContractorNotice })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, input.companyId),
        eq(companyOccurrenceTypes.id, input.occurrenceTypeId),
      ),
    )
    .limit(1)
  return row?.blocksContractorNotice === true
}
