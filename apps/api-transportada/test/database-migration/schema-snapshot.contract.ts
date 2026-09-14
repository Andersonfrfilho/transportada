/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api-postgres'

import * as databaseSchema from '../../src/database/database.schema.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

type PostgresSnapshot = Parameters<typeof generateMigration>[0]

/**
 * Daqui em diante toda pasta leva snapshot.json: as dez anteriores a esta foram escritas à mão sem
 * ele, e o db:generate passou a recriar migrations já aplicadas. As mais antigas sem snapshot ficam
 * como estão — o snapshot de 20260907182129_toll_booths já as absorveu.
 */
const FIRST_DIRECTORY_REQUIRING_SNAPSHOT = '20260910120000_vehicle_reference_every_type'
const SNAPSHOT_FILE = 'snapshot.json'

async function readSnapshot(directory: string): Promise<PostgresSnapshot | undefined> {
  const path = join(migrationsDirectory.pathname, directory, SNAPSHOT_FILE)
  const content = await readFile(path, 'utf8').catch(() => undefined)

  return content === undefined ? undefined : JSON.parse(content)
}

async function listSnapshotDirectories(): Promise<readonly string[]> {
  const directories = await listMigrationDirectories()
  const snapshots = await Promise.all(directories.map(readSnapshot))

  return directories.filter((_, index) => snapshots[index] !== undefined)
}

describe('drizzle snapshot chain', () => {
  test('every migration directory from the cutoff on ships a snapshot.json', async () => {
    const directories = await listMigrationDirectories()
    const snapshotDirectories = new Set(await listSnapshotDirectories())
    const withoutSnapshot = directories.filter(
      (directory) =>
        directory >= FIRST_DIRECTORY_REQUIRING_SNAPSHOT && !snapshotDirectories.has(directory),
    )

    expect(directories).toContain(FIRST_DIRECTORY_REQUIRING_SNAPSHOT)
    expect(withoutSnapshot).toEqual([])
  })

  test('the latest snapshot chains onto the one before it', async () => {
    const snapshotDirectories = await listSnapshotDirectories()
    const [previous, latest] = await Promise.all(
      snapshotDirectories.slice(-2).map(async (directory) => readSnapshot(directory)),
    )

    expect(latest?.prevIds).toEqual([previous?.id ?? ''])
  })

  // O db:check não pega esta divergência: ele só confere a cadeia de snapshots entre si.
  test('the latest snapshot matches the TypeScript schema, so db:generate starts from the truth', async () => {
    const latestDirectory = (await listSnapshotDirectories()).at(-1) ?? ''
    const latest = await readSnapshot(latestDirectory)
    if (latest === undefined) throw new Error(`missing ${SNAPSHOT_FILE} in ${latestDirectory}`)

    const current = await generateDrizzleJson({ ...databaseSchema }, latest.id)
    const pendingStatements = await generateMigration(latest, current)

    expect(pendingStatements).toEqual([])
  }, 60_000)
})
