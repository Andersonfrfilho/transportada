/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T302: a recarga contra Postgres e MinIO de verdade — idempotência (a segunda recarga
 * não muda linha, `updated_at` incluso), D7 (nada apagado), objeto ausente, bytes trocados, trilha
 * em `audit_logs` e a trava global provada de forma determinística por uma conexão que a segura.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { auditLogs, tollBoothExtracts, tollBooths } from '../../src/database/database.schema.js'
import { TOLL_BOOTH_CATALOG_RELOAD_LOCK_ID } from '../../src/toll-booths/application/toll-booth-catalog.constant.js'
import {
  TollBoothCatalogReloadInProgressError,
  TollBoothExtractIntegrityError,
  TollBoothExtractObjectMissingError,
} from '../../src/toll-booths/domain/toll-booth-extract.error.js'
import {
  hasReloadInfrastructure,
  putObject,
  registerWithoutObject,
  type ReloadWorld,
  withReloadWorld,
} from '../fixtures/toll-booth-reload-integration.fixture.js'

const testWithInfrastructure = hasReloadInfrastructure ? test : test.skip
const OBSERVED_ON = '2026-09-14'
const BOOTH_A = {
  chargeCar: '4.2000',
  chargePerAxle: '4.2000',
  latitude: '-23.5101982',
  longitude: '-46.8172702',
  name: 'Barueri - 2',
  operator: 'Ecovias Raposo Castello',
  osmNodeId: '25937851',
}
const BOOTH_B = { ...BOOTH_A, name: 'Itapevi', osmNodeId: '25937852' }

function randomDataset(): string {
  return `sudeste-${crypto.randomUUID().slice(0, 8)}`
}

function encode(rows: readonly unknown[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(rows))
}

async function uploadExtract(world: ReloadWorld, rows: readonly (typeof BOOTH_A)[]) {
  const dataset = randomDataset()
  await world.upload.execute({
    actorUserId: world.userId,
    booths: rows,
    dataset,
    observedOn: OBSERVED_ON,
    rawBody: encode(rows),
  })
  return { dataset, observedOn: OBSERVED_ON }
}

function readBooths(world: ReloadWorld) {
  return world.database.db.select().from(tollBooths).orderBy(tollBooths.osmNodeId)
}

describe('toll booth catalog reload integration (spec 154, T302)', () => {
  testWithInfrastructure(
    'reloads idempotently, keeps booths outside the extract and audits once',
    async () => {
      await withReloadWorld(async (world) => {
        await world.database.db.insert(tollBooths).values({
          latitude: '-22.0000000',
          longitude: '-47.0000000',
          observedOn: '2026-01-01',
          osmNodeId: 99_999_999n,
        })
        const key = await uploadExtract(world, [BOOTH_A, BOOTH_B])

        const first = await world.reload(key)
        const afterFirst = await readBooths(world)
        const audits = await world.database.db.select().from(auditLogs)

        expect(first.savedBoothCount).toBe(2)
        expect(first.catalogBoothCount).toBe(3)
        expect(first.boothsMissingFromExtract).toBe(1)
        expect(afterFirst.find((row) => row.osmNodeId === 99_999_999n)?.observedOn).toBe(
          '2026-01-01',
        )
        expect(afterFirst.filter((row) => row.observedOn === OBSERVED_ON)).toHaveLength(2)
        expect(audits).toHaveLength(1)
        expect(audits[0]).toMatchObject({
          action: 'toll_booth_catalog.reloaded',
          actorUserId: world.userId,
          companyId: world.companyId,
          metadata: { ...key, savedBoothCount: 2 },
          permission: 'settings.manage',
          targetType: 'toll_booth_extract',
        })

        await world.reload(key)
        expect(await readBooths(world)).toEqual(afterFirst)
      })
    },
  )

  testWithInfrastructure(
    'answers 409 on a missing object, marks the row, and the next good reload clears it',
    async () => {
      await withReloadWorld(async (world) => {
        const bytes = encode([BOOTH_A])
        const { key, objectKey } = await registerWithoutObject(world, bytes)

        await expect(world.reload(key)).rejects.toBeInstanceOf(TollBoothExtractObjectMissingError)
        const [marked] = await world.database.db
          .select()
          .from(tollBoothExtracts)
          .where(eq(tollBoothExtracts.dataset, key.dataset))
        expect(marked?.missingObjectObservedAt).toBeInstanceOf(Date)
        expect(await readBooths(world)).toEqual([])

        await putObject(world, objectKey, bytes)
        await world.reload(key)
        const [cleared] = await world.database.db
          .select()
          .from(tollBoothExtracts)
          .where(eq(tollBoothExtracts.dataset, key.dataset))
        expect(cleared?.missingObjectObservedAt).toBeNull()
        expect(cleared?.reloadedBoothCount).toBe(1)
      })
    },
  )

  testWithInfrastructure(
    'answers 409 when the bytes under the key differ from the row',
    async () => {
      await withReloadWorld(async (world) => {
        const { key, objectKey } = await registerWithoutObject(world, encode([BOOTH_A]))
        await putObject(world, objectKey, encode([BOOTH_B]))

        await expect(world.reload(key)).rejects.toBeInstanceOf(TollBoothExtractIntegrityError)
        expect(await readBooths(world)).toEqual([])
      })
    },
  )

  testWithInfrastructure(
    'refuses a reload of a different extract while the catalog lock is held',
    async (): Promise<void> => {
      await withReloadWorld(async (world, url) => {
        const held = await uploadExtract(world, [BOOTH_A])
        await world.reload(held)
        const before = await readBooths(world)
        const other = await uploadExtract(world, [BOOTH_B])
        const connection = new SQL(url, { max: 1 })
        const holder = await connection.reserve()
        try {
          await holder`begin`
          await holder`select pg_advisory_xact_lock(${TOLL_BOOTH_CATALOG_RELOAD_LOCK_ID})`

          await expect(world.reload(other)).rejects.toBeInstanceOf(
            TollBoothCatalogReloadInProgressError,
          )
          expect(await readBooths(world)).toEqual(before)

          await holder`rollback`
          const reloaded = await world.reload(other)
          expect(reloaded.savedBoothCount).toBe(1)
        } finally {
          holder.release()
          await connection.close({ timeout: 0 })
        }
      })
    },
  )
})
