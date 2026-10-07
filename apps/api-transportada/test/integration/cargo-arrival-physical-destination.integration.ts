/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.6 (ADR-0094 §6, decisão de 2026-10-06): a cidade do grupo `(rota, cidade)` é onde a carga
 * será entregue — o destino físico de `resolvePhysicalDestination` (`<entrega>` → `<enderDest>`) —, e
 * não o cadastro do destinatário. A forma da resposta não muda: o painel confere as chaves exatas.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { cargoArrivalDocuments, nfeAddresses } from '../../src/database/database.schema.js'
import {
  ARARAQUARA,
  hasTestDatabase,
  SAO_CARLOS,
  seedIssuedDocument,
  withCargoDatabase,
  type CargoTenants,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  GUARULHOS,
  seedDeliveryAddress,
} from '../fixtures/cargo-arrival-delivery-address.fixture.js'
import {
  buildPostRequest,
  callCargoArrival as call,
  createCargoArrivalHandler,
  SEPARATOR_PERMISSIONS as SEPARATOR,
} from '../fixtures/cargo-arrival-http.fixture.js'
import { authenticatedContext, jsonRequest } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const ARRIVED_AT = new Date(Date.now() - 2 * 3_600_000)
const RECIPIENT_CITY_NAME = 'Cidade Teste'
const GUARULHOS_CITY_NAME = 'Guarulhos'
const GROUP_KEYS = ['cityIbgeCode', 'counts', 'documents', 'routeName']
const DOCUMENT_KEYS = [
  'accessKey',
  'cityIbgeCode',
  'cityName',
  'isInLiveTrip',
  'nfeDocumentId',
  'number',
  'receivedAt',
  'recipientName',
  'routeName',
  'separatedAt',
  'separationState',
  'series',
]
const AVAILABLE_KEYS = [
  'accessKey',
  'cityIbgeCode',
  'cityName',
  'id',
  'issuedAt',
  'number',
  'recipientName',
  'series',
  'state',
  'totalValue',
]

type Group = {
  cityIbgeCode: string | null
  documents: { cityName: string | null; number: string }[]
  routeName: string | null
}

const handleOf = (database: TestDatabase) =>
  createCargoArrivalHandler({ context: authenticatedContext(SEPARATOR), database })

async function registerArrival(
  database: TestDatabase,
  input: { readonly tenants: CargoTenants; readonly documentIds: readonly string[] },
) {
  const body = {
    arrivedAt: ARRIVED_AT.toISOString(),
    contractorId: input.tenants.contractorId,
    documentIds: input.documentIds,
    palletCount: 2,
  }
  const response = await call(
    handleOf(database),
    buildPostRequest({ body, key: `arrival-key-${crypto.randomUUID()}`, path: '/cargo-arrivals' }),
  )
  expect(response.status).toBe(201)
  return { arrivalId: String(response.body.data?.id), groups: groupsOf(response.body.data) }
}

function groupsOf(data: unknown): Group[] {
  return (data as { groups: Group[] }).groups
}

async function readGroups(database: TestDatabase, arrivalId: string): Promise<Group[]> {
  const response = await call(
    handleOf(database),
    jsonRequest({ method: 'GET', path: `/cargo-arrivals/${arrivalId}` }),
  )
  expect(response.status).toBe(200)
  return groupsOf(response.body.data)
}

describe('a cidade do grupo é o destino físico da nota (spec 237 T2.6)', () => {
  testWithPostgres(
    '`<entrega>` vence o cadastro; sem `<entrega>` utilizável vale o `<enderDest>`',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const delivered = await seedIssuedDocument(database, { number: '1' })
        const registered = await seedIssuedDocument(database, { number: '2' })
        const unusable = await seedIssuedDocument(database, { cityCode: ARARAQUARA, number: '3' })
        await seedDeliveryAddress(database, { documentId: delivered })
        await seedDeliveryAddress(database, { documentId: unusable, postalCode: '0701' })

        const { groups } = await registerArrival(database, {
          documentIds: [delivered, registered, unusable],
          tenants,
        })

        expect(groups.map((group) => group.cityIbgeCode)).toEqual([
          ARARAQUARA,
          GUARULHOS,
          SAO_CARLOS,
        ])
        const byCity = new Map(groups.map((group) => [group.cityIbgeCode, group.documents]))
        expect(byCity.get(GUARULHOS)?.map((item) => item.number)).toEqual(['1'])
        expect(byCity.get(GUARULHOS)?.[0]?.cityName).toBe(GUARULHOS_CITY_NAME)
        expect(byCity.get(SAO_CARLOS)?.map((item) => item.number)).toEqual(['2'])
        expect(byCity.get(SAO_CARLOS)?.[0]?.cityName).toBe(RECIPIENT_CITY_NAME)
        const stored = await database.db.select().from(cargoArrivalDocuments)
        expect(stored.find((row) => row.nfeDocumentId === delivered)?.cityIbgeCode).toBe(GUARULHOS)
      })
    },
  )

  testWithPostgres('sem destino resolvível o grupo é o da nota sem cidade', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const lost = await seedIssuedDocument(database, { number: '1' })
      const found = await seedIssuedDocument(database, { number: '2' })
      await database.db.delete(nfeAddresses)
      await seedDeliveryAddress(database, { documentId: found })

      const { groups } = await registerArrival(database, { documentIds: [lost, found], tenants })

      expect(groups.map((group) => group.cityIbgeCode)).toEqual([GUARULHOS, null])
      expect(groups[1]?.documents).toMatchObject([{ cityName: null, number: '1' }])
    })
  })

  testWithPostgres('a mesma rota em cidades físicas diferentes são dois grupos', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const toGuarulhos = await seedIssuedDocument(database, { number: '1' })
      const stays = await seedIssuedDocument(database, { number: '2' })
      const alsoGuarulhos = await seedIssuedDocument(database, {
        cityCode: ARARAQUARA,
        number: '3',
      })
      await seedDeliveryAddress(database, { documentId: toGuarulhos })
      await seedDeliveryAddress(database, { documentId: alsoGuarulhos })
      const documentIds = [toGuarulhos, stays, alsoGuarulhos]
      const { arrivalId } = await registerArrival(database, { documentIds, tenants })

      const assigned = await call(
        handleOf(database),
        buildPostRequest({
          body: { documentIds, routeName: 'FR.S.CAR' },
          path: `/cargo-arrivals/${arrivalId}/route-assignment`,
        }),
      )
      expect(assigned.status).toBe(200)

      const groups = await readGroups(database, arrivalId)
      expect(groups.map((group) => [group.routeName, group.cityIbgeCode])).toEqual([
        ['FR.S.CAR', GUARULHOS],
        ['FR.S.CAR', SAO_CARLOS],
      ])
      expect(groups[0]?.documents.map((item) => item.number)).toEqual(['1', '3'])
    })
  })

  testWithPostgres('a leitura segue o destino físico de agora e não muda de forma', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const documentId = await seedIssuedDocument(database, { number: '1' })
      const { arrivalId, groups: before } = await registerArrival(database, {
        documentIds: [documentId],
        tenants,
      })
      expect(before.map((group) => group.cityIbgeCode)).toEqual([SAO_CARLOS])

      await seedDeliveryAddress(database, { documentId })
      const [group] = await readGroups(database, arrivalId)

      expect(group?.cityIbgeCode).toBe(GUARULHOS)
      expect(Object.keys(group ?? {}).sort()).toEqual(GROUP_KEYS)
      expect(Object.keys(group?.documents[0] ?? {}).sort()).toEqual(DOCUMENT_KEYS)
      const [stored] = await database.db
        .select()
        .from(cargoArrivalDocuments)
        .where(eq(cargoArrivalDocuments.nfeDocumentId, documentId))
      expect(stored?.cityIbgeCode).toBe(SAO_CARLOS)
    })
  })

  testWithPostgres('a lista de notas disponíveis mostra a cidade da entrega', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const delivered = await seedIssuedDocument(database, { number: '1' })
      await seedIssuedDocument(database, { number: '2' })
      await seedDeliveryAddress(database, { documentId: delivered })

      const response = await call(
        handleOf(database),
        jsonRequest({
          method: 'GET',
          path: `/cargo-arrivals/available-documents?contractorId=${tenants.contractorId}`,
        }),
      )

      const items = response.body.data as unknown as Record<string, unknown>[]
      const cities = items.map((item) => [
        item.number,
        item.cityIbgeCode,
        item.cityName,
        item.state,
      ])
      expect(cities.sort()).toEqual([
        ['1', GUARULHOS, GUARULHOS_CITY_NAME, 'SP'],
        ['2', SAO_CARLOS, RECIPIENT_CITY_NAME, 'SP'],
      ])
      expect(Object.keys(items[0] ?? {}).sort()).toEqual(AVAILABLE_KEYS)
    })
  })

  testWithPostgres('o destino de outra empresa nunca entra na chegada', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const own = await seedIssuedDocument(database, { number: '1' })
      const foreign = await seedIssuedDocument(database, {
        cityCode: ARARAQUARA,
        companyId: tenants.foreignCompanyId,
        number: '2',
      })
      await seedDeliveryAddress(database, {
        cityCode: '3550308',
        companyId: tenants.foreignCompanyId,
        documentId: foreign,
        postalCode: '01310100',
      })

      const { groups } = await registerArrival(database, { documentIds: [own], tenants })

      expect(groups.map((group) => group.cityIbgeCode)).toEqual([SAO_CARLOS])
      expect(groups.flatMap((group) => group.documents.map((item) => item.number))).toEqual(['1'])
    })
  })
})
