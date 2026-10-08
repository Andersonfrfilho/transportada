/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.6: o `<entrega>` da nota (papel `delivery`) para a integração da chegada. Sem CEP de
 * 8 dígitos o endereço não monta chave de parada e a política o descarta, por isso o CEP é parâmetro.
 */
import { nfeAddresses, nfeParticipants } from '../../src/database/database.schema.js'
import { COMPANY_CONTEXT } from './freight-region-http.fixture.js'
import type { TestDatabase } from './cargo-arrival-database.fixture.js'

export const GUARULHOS = '3518800'
export const GUARULHOS_POSTAL_CODE = '07010000'

export type SeedDeliveryAddressParams = {
  readonly city?: string
  readonly cityCode?: string
  readonly companyId?: string
  readonly documentId: string
  readonly postalCode?: string
  readonly state?: string
}

export async function seedDeliveryAddress(
  database: TestDatabase,
  params: SeedDeliveryAddressParams,
): Promise<void> {
  const companyId = params.companyId ?? COMPANY_CONTEXT.companyId
  const participantId = crypto.randomUUID()
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId: params.documentId,
    id: participantId,
    legalName: 'Local de Entrega Teste',
    role: 'delivery',
  })
  await database.db.insert(nfeAddresses).values({
    city: params.city ?? 'Guarulhos',
    cityCode: params.cityCode ?? GUARULHOS,
    companyId,
    number: '100',
    participantId,
    postalCode: params.postalCode ?? GUARULHOS_POSTAL_CODE,
    state: params.state ?? 'SP',
  })
}
