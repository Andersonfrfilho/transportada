/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, ilike, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { fleetDrivers, userCompanyMemberships } from '../../database/database.schema.js'
import type { DriverHomeState } from '../domain/driver-home-geocoding.policy.js'
import type { FleetDriverStatus } from '../../database/fleet.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import type {
  FleetDriver,
  FleetDriverDocumentConflicts,
  FleetDriverFilters,
  FleetDriverInput,
  FleetDriverPage,
  FleetDriverRepositoryPort,
} from '../application/fleet.port.js'
import {
  FleetDriverLicenseNumberTakenError,
  FleetDriverMembershipTakenError,
  FleetDriverTaxIdTakenError,
} from '../domain/fleet.error.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import { mapDriver, toDriverColumns } from './fleet.mapper.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ACTIVE_MEMBERSHIP_STATUS = 'active'
const LICENSE_NUMBER_CONSTRAINT = 'fleet_drivers_company_license_number_unique'
const MEMBERSHIP_CONSTRAINT = 'fleet_drivers_company_membership_unique'
const TAX_ID_CONSTRAINT = 'fleet_drivers_company_id_tax_id_unique'

export class DrizzleFleetDriverRepository implements FleetDriverRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async create(input: {
    readonly companyId: string
    readonly driver: FleetDriverInput
  }): Promise<FleetDriver> {
    const record = await runGuarded(async () => {
      const [created] = await this.database
        .insert(fleetDrivers)
        .values({ ...toDriverColumns(input.driver), companyId: input.companyId })
        .returning()
      return created
    })
    if (record === undefined) throw new Error('FLEET_DRIVER_CREATE_FAILED')
    return mapDriver(record)
  }

  /**
   * A conferência prévia do formulário, num acesso só. Ela não decide nada: entre esta leitura e o
   * `INSERT` cabe outra escrita, e quem recusa a colisão de verdade é o índice único.
   */
  public async findDocumentConflicts(input: {
    readonly companyId: string
    readonly driverId: string | null
    readonly licenseNumber: string
    readonly taxId: string
  }): Promise<FleetDriverDocumentConflicts> {
    const wanted = [
      input.taxId === '' ? undefined : eq(fleetDrivers.taxId, input.taxId),
      input.licenseNumber === '' ? undefined : eq(fleetDrivers.licenseNumber, input.licenseNumber),
    ].filter((match) => match !== undefined)
    if (wanted.length === 0) return { licenseNumber: false, taxId: false }

    const records = await this.database
      .select({ licenseNumber: fleetDrivers.licenseNumber, taxId: fleetDrivers.taxId })
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          // A ficha aberta não colide consigo mesma
          input.driverId === null ? undefined : ne(fleetDrivers.id, input.driverId),
          or(...wanted),
        ),
      )
      .limit(wanted.length)

    return {
      licenseNumber:
        input.licenseNumber !== '' &&
        records.some((record) => record.licenseNumber === input.licenseNumber),
      taxId: input.taxId !== '' && records.some((record) => record.taxId === input.taxId),
    }
  }

  public async findById(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<FleetDriver | null> {
    const [record] = await this.database
      .select()
      .from(fleetDrivers)
      .where(and(eq(fleetDrivers.companyId, input.companyId), eq(fleetDrivers.id, input.driverId)))
      .limit(1)
    return record === undefined ? null : mapDriver(record)
  }

  /** Um membership desligado não loga no app — vincular motorista a ele nasceria morto. */
  public async hasMembership(input: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<boolean> {
    const [record] = await this.database
      .select({ id: userCompanyMemberships.id })
      .from(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.id, input.membershipId),
          eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
        ),
      )
      .limit(1)
    return record !== undefined
  }

  public async list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: FleetDriverFilters
    readonly limit: number
  }): Promise<FleetDriverPage> {
    const cursor = decodeKeysetCursor(input.cursor)
    const records = await this.database
      .select()
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          cursor === null
            ? undefined
            : or(
                lt(fleetDrivers.createdAt, cursor.createdAt),
                and(eq(fleetDrivers.createdAt, cursor.createdAt), lt(fleetDrivers.id, cursor.id)),
              ),
          input.filters?.statusEq === undefined
            ? undefined
            : eq(fleetDrivers.status, input.filters.statusEq),
          input.filters?.nameContains === undefined
            ? undefined
            : ilike(fleetDrivers.name, `%${input.filters.nameContains}%`),
        ),
      )
      .orderBy(desc(fleetDrivers.createdAt), desc(fleetDrivers.id))
      .limit(input.limit + 1)

    const pageRecords = records.slice(0, input.limit)
    const last = pageRecords.at(-1)

    return {
      items: pageRecords.map(mapDriver),
      nextCursor:
        records.length > input.limit && last !== undefined ? encodeKeysetCursor(last) : null,
    }
  }

  /** A ficha, só com o que a busca da casa precisa — nunca o registro inteiro. */
  public async readHome(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<DriverHomeState | null> {
    const [row] = await this.database
      .select({
        city: fleetDrivers.city,
        geocodedAt: fleetDrivers.homeGeocodedAt,
        latitude: fleetDrivers.homeLatitude,
        longitude: fleetDrivers.homeLongitude,
        number: fleetDrivers.number,
        postalCode: fleetDrivers.postalCode,
        state: fleetDrivers.state,
        street: fleetDrivers.street,
      })
      .from(fleetDrivers)
      .where(and(eq(fleetDrivers.companyId, input.companyId), eq(fleetDrivers.id, input.driverId)))
      .limit(1)
    return row ?? null
  }

  /**
   * ⚠️ A marca é carimbada **sempre**, com ou sem coordenada: é ela que diz "já procurei", e sem o
   * carimbo o motorista que o provedor não acha seria procurado de novo a cada salvamento.
   *
   * ⚠️ Não mexe em `version`: a busca é enriquecimento nosso, não edição do operador, e subir a
   * versão faria a tela aberta ao lado receber conflito de concorrência por um campo que ela nem
   * mostra.
   */
  public async writeHome(input: {
    readonly companyId: string
    readonly coordinate: { readonly latitude: string; readonly longitude: string } | null
    readonly driverId: string
  }): Promise<void> {
    await this.database
      .update(fleetDrivers)
      .set({
        homeGeocodedAt: new Date(),
        homeLatitude: input.coordinate?.latitude ?? null,
        homeLongitude: input.coordinate?.longitude ?? null,
      })
      .where(and(eq(fleetDrivers.companyId, input.companyId), eq(fleetDrivers.id, input.driverId)))
  }

  public async update(input: {
    readonly companyId: string
    readonly driver: FleetDriverInput
    readonly driverId: string
    readonly expectedVersion: string
    readonly status: FleetDriverStatus
  }): Promise<FleetDriver | null> {
    const record = await runGuarded(async () => {
      const [updated] = await this.database
        .update(fleetDrivers)
        .set({
          ...toDriverColumns(input.driver),
          /**
           * ⚠️ **Endereço editado zera a coordenada e a marca de busca.** Sem isto, corrigir a rua
           * do motorista deixaria o par gravado apontando para a casa antiga — e a marca de "já
           * procurei" impediria a busca de acontecer de novo, para sempre. A rota de retorno
           * terminaria num endereço que ninguém mais mora, sem nada na tela denunciando.
           *
           * A comparação é `is distinct from` sobre os cinco campos que formam o lugar; o
           * complemento fica de fora de propósito — apartamento não muda a coordenada da porta.
           */
          homeGeocodedAt: clearOnAddressChange(fleetDrivers.homeGeocodedAt, input.driver),
          homeLatitude: clearOnAddressChange(fleetDrivers.homeLatitude, input.driver),
          homeLongitude: clearOnAddressChange(fleetDrivers.homeLongitude, input.driver),
          status: input.status,
          updatedAt: new Date(),
          version: BigInt(input.expectedVersion) + 1n,
        })
        .where(
          and(
            eq(fleetDrivers.companyId, input.companyId),
            eq(fleetDrivers.id, input.driverId),
            eq(fleetDrivers.version, BigInt(input.expectedVersion)),
          ),
        )
        .returning()
      return updated
    })
    return record === undefined ? null : mapDriver(record)
  }
}

async function runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    const constraint = violatedUniqueConstraint(error)
    if (constraint === TAX_ID_CONSTRAINT) throw new FleetDriverTaxIdTakenError()
    if (constraint === MEMBERSHIP_CONSTRAINT) throw new FleetDriverMembershipTakenError()
    if (constraint === LICENSE_NUMBER_CONSTRAINT) throw new FleetDriverLicenseNumberTakenError()
    throw error
  }
}

/**
 * Zera o campo quando o endereço mudou, e o preserva quando não mudou.
 *
 * ⚠️ Em `UPDATE` do Postgres, a coluna citada à direita ainda é o **valor antigo** — é isso que
 * permite comparar o gravado com o que está entrando sem uma leitura a mais. Fazer a comparação em
 * TypeScript exigiria ler a ficha antes de escrevê-la, e entre a leitura e a escrita cabe outra
 * atualização.
 *
 * O complemento fica de fora dos cinco campos de propósito: apartamento não muda a coordenada da
 * porta, e zerar por causa dele mandaria buscar de novo à toa.
 */
function clearOnAddressChange<TColumn extends AnyPgColumn>(
  column: TColumn,
  driver: FleetDriverInput,
): SQL {
  return sql`case when (${fleetDrivers.postalCode}, ${fleetDrivers.street}, ${fleetDrivers.number}, ${fleetDrivers.city}, ${fleetDrivers.state}) is distinct from (${driver.address.postalCode}, ${driver.address.street}, ${driver.address.number}, ${driver.address.city}, ${driver.address.state}) then null else ${column} end`
}
