/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { type SQL, and, desc, eq, sql } from 'drizzle-orm'

import {
  companyFiscalProfiles,
  fleetDrivers,
  mdfeManifests,
  nfeAddresses,
} from '../../database/database.schema.js'
import type { PostalCodeDirectoryPort, PostalCodeQuery } from '../application/postal-code.port.js'
import {
  type PostalCodeAddressRow,
  type PostalCodeSuggestion,
  isCompletePostalCodeSuggestion,
  selectPostalCodeSuggestion,
} from '../domain/postal-code-suggestion.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type OriginQuery = PostalCodeQuery & { readonly database: Database }

type PostalCodeOrigin = {
  readonly buildFilters: (query: PostalCodeQuery) => readonly SQL[]
  readonly name: string
  readonly read: (query: OriginQuery) => Promise<readonly PostalCodeAddressRow[]>
}

type PostalCodeLookup = () => Promise<readonly PostalCodeAddressRow[]>

/**
 * Uma linha por origem. A ordem do `ORDER BY` é a mesma de `byStreetThenRecency`: aqui ela escolhe a
 * linha dentro da origem, lá ela escolhe entre origens.
 */
const ORIGIN_ROW_LIMIT = 1

const buildNfeAddressFilters = ({ companyId, postalCode }: PostalCodeQuery): readonly SQL[] => [
  eq(nfeAddresses.companyId, companyId),
  eq(nfeAddresses.postalCode, postalCode),
]

const buildCompanyFiscalProfileFilters = ({
  companyId,
  postalCode,
}: PostalCodeQuery): readonly SQL[] => [
  eq(companyFiscalProfiles.companyId, companyId),
  eq(companyFiscalProfiles.postalCode, postalCode),
]

const buildFleetDriverFilters = ({ companyId, postalCode }: PostalCodeQuery): readonly SQL[] => [
  eq(fleetDrivers.companyId, companyId),
  eq(fleetDrivers.postalCode, postalCode),
]

const buildMdfeLoadingFilters = ({ companyId, postalCode }: PostalCodeQuery): readonly SQL[] => [
  eq(mdfeManifests.companyId, companyId),
  eq(mdfeManifests.loadingPostalCode, postalCode),
]

const buildMdfeDischargeFilters = ({ companyId, postalCode }: PostalCodeQuery): readonly SQL[] => [
  eq(mdfeManifests.companyId, companyId),
  eq(mdfeManifests.dischargePostalCode, postalCode),
]

const readNfeAddress = async ({
  database,
  ...query
}: OriginQuery): Promise<readonly PostalCodeAddressRow[]> =>
  database
    .select({
      city: sql<string>`coalesce(${nfeAddresses.city}, '')`,
      district: sql<string>`coalesce(${nfeAddresses.district}, '')`,
      recordedAt: nfeAddresses.createdAt,
      state: sql<string>`coalesce(${nfeAddresses.state}, '')`,
      street: sql<string>`coalesce(${nfeAddresses.street}, '')`,
    })
    .from(nfeAddresses)
    .where(and(...buildNfeAddressFilters(query)))
    .orderBy(
      desc(sql`length(coalesce(${nfeAddresses.street}, '')) > 0`),
      desc(nfeAddresses.createdAt),
    )
    .limit(ORIGIN_ROW_LIMIT)

const readCompanyFiscalProfile = async ({
  database,
  ...query
}: OriginQuery): Promise<readonly PostalCodeAddressRow[]> =>
  database
    .select({
      city: companyFiscalProfiles.city,
      district: companyFiscalProfiles.district,
      recordedAt: companyFiscalProfiles.updatedAt,
      state: companyFiscalProfiles.state,
      street: companyFiscalProfiles.street,
    })
    .from(companyFiscalProfiles)
    .where(and(...buildCompanyFiscalProfileFilters(query)))
    .orderBy(desc(companyFiscalProfiles.updatedAt))
    .limit(ORIGIN_ROW_LIMIT)

const readFleetDriver = async ({
  database,
  ...query
}: OriginQuery): Promise<readonly PostalCodeAddressRow[]> =>
  database
    .select({
      city: fleetDrivers.city,
      district: fleetDrivers.district,
      recordedAt: fleetDrivers.updatedAt,
      state: fleetDrivers.state,
      street: fleetDrivers.street,
    })
    .from(fleetDrivers)
    .where(and(...buildFleetDriverFilters(query)))
    .orderBy(desc(sql`length(${fleetDrivers.street}) > 0`), desc(fleetDrivers.updatedAt))
    .limit(ORIGIN_ROW_LIMIT)

/** O manifesto responde só a UF: as duas colunas de CEP dele não têm logradouro nem bairro. */
const readMdfeLoading = async ({
  database,
  ...query
}: OriginQuery): Promise<readonly PostalCodeAddressRow[]> =>
  database
    .select({
      city: sql<string>`''`,
      district: sql<string>`''`,
      recordedAt: mdfeManifests.updatedAt,
      state: mdfeManifests.originState,
      street: sql<string>`''`,
    })
    .from(mdfeManifests)
    .where(and(...buildMdfeLoadingFilters(query)))
    .orderBy(desc(mdfeManifests.updatedAt))
    .limit(ORIGIN_ROW_LIMIT)

const readMdfeDischarge = async ({
  database,
  ...query
}: OriginQuery): Promise<readonly PostalCodeAddressRow[]> =>
  database
    .select({
      city: sql<string>`''`,
      district: sql<string>`''`,
      recordedAt: mdfeManifests.updatedAt,
      state: mdfeManifests.destinationState,
      street: sql<string>`''`,
    })
    .from(mdfeManifests)
    .where(and(...buildMdfeDischargeFilters(query)))
    .orderBy(desc(mdfeManifests.updatedAt))
    .limit(ORIGIN_ROW_LIMIT)

export const POSTAL_CODE_ORIGINS: readonly PostalCodeOrigin[] = [
  { buildFilters: buildNfeAddressFilters, name: 'nfeAddress', read: readNfeAddress },
  {
    buildFilters: buildCompanyFiscalProfileFilters,
    name: 'companyFiscalProfile',
    read: readCompanyFiscalProfile,
  },
  { buildFilters: buildFleetDriverFilters, name: 'fleetDriver', read: readFleetDriver },
  { buildFilters: buildMdfeLoadingFilters, name: 'mdfeLoading', read: readMdfeLoading },
  { buildFilters: buildMdfeDischargeFilters, name: 'mdfeDischarge', read: readMdfeDischarge },
]

/**
 * `Promise.race` cru não serve: ele entrega o primeiro a **terminar**, e a origem mais rápida costuma
 * ser a que não achou nada. Aqui vence a primeira sugestão **completa**; as parciais ficam de lado e
 * só respondem quando nenhuma origem soube o endereço inteiro. Consulta que falha sobe para a
 * fronteira — CEP sem resposta e banco quebrado não são a mesma coisa.
 */
export function raceCompleteSuggestion(
  lookups: readonly PostalCodeLookup[],
): Promise<PostalCodeSuggestion | null> {
  if (lookups.length === 0) return Promise.resolve(null)

  return new Promise<PostalCodeSuggestion | null>((resolve, reject) => {
    const partialRows: PostalCodeAddressRow[] = []
    let pendingOrigins = lookups.length
    let settled = false

    const settle = (suggestion: PostalCodeSuggestion | null): void => {
      if (settled) return
      settled = true
      resolve(suggestion)
    }

    const accept = (rows: readonly PostalCodeAddressRow[]): void => {
      const suggestion = selectPostalCodeSuggestion(rows)
      if (isCompletePostalCodeSuggestion(suggestion)) {
        settle(suggestion)
        return
      }

      partialRows.push(...rows)
      pendingOrigins -= 1
      if (pendingOrigins === 0) settle(selectPostalCodeSuggestion(partialRows))
    }

    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      reject(error)
    }

    for (const lookup of lookups) void lookup().then(accept, fail)
  })
}

export class DrizzlePostalCodeRepository implements PostalCodeDirectoryPort {
  public constructor(private readonly database: Database) {}

  public async findByPostalCode(query: PostalCodeQuery): Promise<PostalCodeSuggestion | null> {
    return raceCompleteSuggestion(
      POSTAL_CODE_ORIGINS.map((origin) => () => origin.read({ ...query, database: this.database })),
    )
  }
}
