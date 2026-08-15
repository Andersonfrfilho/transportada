/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../../', import.meta.url)
const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)

/**
 * Nenhum provedor de consulta por placa é gratuito e nenhum combina placa e Renavam numa fonte
 * pública: o trilho inteiro saiu em favor da digitação pelo CRLV — ADR-0032, que substitui a 0020.
 */
const FORBIDDEN_NEEDLE = [
  '/fleet/vehicles/lookup',
  'FLEET_VEHICLE_LOOKUP',
  'FleetVehicleLookup',
  'lookupByPlate',
  'VehicleLookup',
  'vehicleLookup',
] as const

const SCANNED_GLOB = [
  'src/fleet/**/*.ts',
  'src/config/environment.schema.ts',
  'src/main.ts',
  'src/shared/api.constant.ts',
  'src/shared/api.types.ts',
] as const

const REMOVED_FILE = [
  'src/fleet/application/fleet-vehicle-lookup.use-case.ts',
  'src/fleet/domain/vehicle-lookup-payload.policy.ts',
  'src/fleet/infrastructure/http-vehicle-lookup.gateway.ts',
  'test/fleet-application/vehicle-lookup.contract.ts',
  'test/fleet-http/vehicle-lookup.contract.ts',
  'test/fleet-infrastructure/vehicle-lookup.contract.ts',
] as const

async function listScannedFiles(): Promise<readonly string[]> {
  const files: string[] = []
  for (const pattern of SCANNED_GLOB) {
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd: APPLICATION_ROOT.pathname })) files.push(file)
  }
  return [...new Set(files)].sort()
}

describe('fleet plate lookup removal contract', () => {
  test('leaves no plate lookup symbol in the fleet module or in the composition root', async () => {
    const files = await listScannedFiles()
    expect(files.length).toBeGreaterThan(0)

    const contents = await Promise.all(
      files.map((file) => Bun.file(new URL(file, APPLICATION_ROOT)).text()),
    )

    for (const [index, content] of contents.entries()) {
      for (const needle of FORBIDDEN_NEEDLE) {
        expect(`${files[index] ?? ''}:${content.includes(needle)}`).toBe(
          `${files[index] ?? ''}:false`,
        )
      }
    }
  })

  test('keeps the plate lookup files deleted', async () => {
    for (const filePath of REMOVED_FILE) {
      expect(await Bun.file(new URL(filePath, APPLICATION_ROOT)).exists()).toBe(false)
    }
  })

  test('asks for no plate lookup provider in the environment example', async () => {
    const example = await Bun.file(new URL('.env.example', REPOSITORY_ROOT)).text()

    expect(example).not.toContain('FLEET_VEHICLE_LOOKUP')
  })

  test('records the removal in an ADR that supersedes the gateway decision', async () => {
    const superseded = await Bun.file(
      new URL('docs/adr/0020-generic-plate-lookup-gateway.md', REPOSITORY_ROOT),
    ).text()
    const replacement = await Bun.file(
      new URL('docs/adr/0032-consulta-por-placa-sem-fonte-publica.md', REPOSITORY_ROOT),
    ).text()

    expect(superseded).toContain('Substituída pela ADR-0032')
    expect(replacement).toContain('Substitui a ADR-0020')
  })
})
