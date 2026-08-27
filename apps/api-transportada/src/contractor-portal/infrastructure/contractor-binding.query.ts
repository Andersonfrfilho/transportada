/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { contractorPortalBindings } from '../../database/client-portal.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import type { ContractorBinding } from '../domain/contractor-scope.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * ADR-0050 §2: os documentos da conta, e só eles. O `where` casa `company_id` **e** `membership_id`
 * — a membership já é única por empresa, mas o tenant no `where` é a defesa em profundidade que todo
 * repositório daqui carrega, e é ela que o teste de isolamento cobra.
 */
export async function listContractorBindings(
  database: Database,
  input: { readonly companyId: string; readonly membershipId: string },
): Promise<readonly ContractorBinding[]> {
  return database
    .select({ contractorId: contractors.id, taxId: contractors.taxId })
    .from(contractorPortalBindings)
    .innerJoin(
      contractors,
      and(
        eq(contractors.companyId, contractorPortalBindings.companyId),
        eq(contractors.id, contractorPortalBindings.contractorId),
      ),
    )
    .where(
      and(
        eq(contractorPortalBindings.companyId, input.companyId),
        eq(contractorPortalBindings.membershipId, input.membershipId),
        /**
         * Contratante inativo perde o portal junto: a 060 usa `status` para tirar de circulação um
         * cadastro que não opera mais, e deixar o acesso vivo depois disso seria manter aberta a
         * porta que alguém achou que tinha fechado.
         */
        eq(contractors.status, 'active'),
      ),
    )
}
