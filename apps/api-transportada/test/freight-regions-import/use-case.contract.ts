/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import type {
  FreightRegion,
  FreightRegionImportPort,
  FreightRegionInput,
} from '../../src/freight-regions/application/freight-region.port.js'
import { createImportFreightRegionsUseCase } from '../../src/freight-regions/application/import-freight-regions.use-case.js'
import type { FreightRegionStatus } from '../../src/database/freight-region.schema.js'

const COMPANY_ID = '2f6c1d1a-6a2f-4a2f-8f5a-0b1c2d3e4f50'
const USER_ID = '9d1e2f3a-4b5c-4d6e-8f90-1a2b3c4d5e6f'
const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID } as const

const BARRETOS: FreightRegionInput = {
  cities: [
    { city: 'BARRETOS', state: 'SP' },
    { city: 'BARRINHA', state: 'SP' },
  ],
  code: '1.000',
  name: 'BARRETOS',
  rates: [
    { driverAmount: '848.5300', freightClass: 'toco' },
    { driverAmount: '540.0000', freightClass: 'van' },
  ],
}

const JABOTICABAL: FreightRegionInput = {
  cities: [{ city: 'JABOTICABAL', state: 'SP' }],
  code: '5.000',
  name: 'JABOTICABAL',
  rates: [{ driverAmount: '480.0000', freightClass: 'van' }],
}

type UpdateCall = {
  readonly expectedVersion: string
  readonly region: FreightRegionInput
  readonly regionId: string
  readonly status: FreightRegionStatus
}

class FakeRepository implements FreightRegionImportPort {
  public readonly createCalls: FreightRegionInput[] = []
  public readonly updateCalls: UpdateCall[] = []
  private readonly stored: FreightRegion[] = []
  private sequence = 0

  public constructor(
    regions: readonly {
      readonly region: FreightRegionInput
      readonly status?: FreightRegionStatus
    }[] = [],
  ) {
    for (const entry of regions) this.seed(entry.region, entry.status ?? 'active')
  }

  public async create(input: {
    readonly companyId: string
    readonly region: FreightRegionInput
  }): Promise<FreightRegion> {
    expect(input.companyId).toBe(COMPANY_ID)
    this.createCalls.push(input.region)
    return this.seed(input.region, 'active')
  }

  public async listAll(input: { readonly companyId: string }): Promise<readonly FreightRegion[]> {
    expect(input.companyId).toBe(COMPANY_ID)
    return [...this.stored]
  }

  public async update(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly region: FreightRegionInput
    readonly regionId: string
    readonly status: FreightRegionStatus
  }): Promise<FreightRegion | null> {
    expect(input.companyId).toBe(COMPANY_ID)
    this.updateCalls.push({
      expectedVersion: input.expectedVersion,
      region: input.region,
      regionId: input.regionId,
      status: input.status,
    })
    const index = this.stored.findIndex((region) => region.id === input.regionId)
    const current = this.stored[index]
    if (current === undefined) return null
    const next: FreightRegion = {
      ...current,
      ...input.region,
      status: input.status,
      version: String(BigInt(input.expectedVersion) + 1n),
    }
    this.stored[index] = next
    return next
  }

  private seed(region: FreightRegionInput, status: FreightRegionStatus): FreightRegion {
    this.sequence += 1
    const stored: FreightRegion = {
      ...region,
      createdAt: new Date('2026-08-19T12:00:00.000Z').toISOString(),
      id: `00000000-0000-4000-8000-00000000000${this.sequence}`,
      status,
      updatedAt: new Date('2026-08-19T12:00:00.000Z').toISOString(),
      version: '1',
      zone: Number(region.code.slice(-1)) + (region.code.startsWith('0.') ? 0 : 1),
    }
    this.stored.push(stored)
    return stored
  }
}

describe('import freight regions use case', () => {
  let repository: FakeRepository

  beforeEach(() => {
    repository = new FakeRepository()
  })

  test('creates every region of an empty company', async () => {
    const useCase = createImportFreightRegionsUseCase({ repository })

    const summary = await useCase.import({ context: CONTEXT, regions: [BARRETOS, JABOTICABAL] })

    expect(summary).toEqual({ created: 2, deactivated: 0, updated: 0 })
    expect(repository.createCalls).toEqual([BARRETOS, JABOTICABAL])
    expect(repository.updateCalls).toEqual([])
  })

  /**
   * O aceite da task: reimportar o mesmo arquivo não escreve nada. `created: 0` sozinho passaria
   * com 29 updates cegos — a rota que não mudou não pode nem subir de versão.
   */
  test('re-importing the same file writes nothing', async () => {
    const seeded = new FakeRepository([{ region: BARRETOS }, { region: JABOTICABAL }])
    const useCase = createImportFreightRegionsUseCase({ repository: seeded })

    const summary = await useCase.import({ context: CONTEXT, regions: [BARRETOS, JABOTICABAL] })

    expect(summary).toEqual({ created: 0, deactivated: 0, updated: 0 })
    expect(seeded.createCalls).toEqual([])
    expect(seeded.updateCalls).toEqual([])
  })

  test('updates the region whose value changed, by the natural key', async () => {
    const seeded = new FakeRepository([{ region: BARRETOS }])
    const useCase = createImportFreightRegionsUseCase({ repository: seeded })
    const raised: FreightRegionInput = {
      ...BARRETOS,
      rates: [
        { driverAmount: '900.0000', freightClass: 'toco' },
        { driverAmount: '540.0000', freightClass: 'van' },
      ],
    }

    const summary = await useCase.import({ context: CONTEXT, regions: [raised] })

    expect(summary).toEqual({ created: 0, deactivated: 0, updated: 1 })
    expect(seeded.updateCalls).toEqual([
      {
        expectedVersion: '1',
        region: raised,
        regionId: '00000000-0000-4000-8000-000000000001',
        status: 'active',
      },
    ])
  })

  /** Cidade retirada da tabela do cliente deixa de valer; a rota continua a mesma rota. */
  test('updates when only the city list changed', async () => {
    const seeded = new FakeRepository([{ region: BARRETOS }])
    const useCase = createImportFreightRegionsUseCase({ repository: seeded })
    const shrunk: FreightRegionInput = { ...BARRETOS, cities: [{ city: 'BARRETOS', state: 'SP' }] }

    const summary = await useCase.import({ context: CONTEXT, regions: [shrunk] })

    expect(summary).toEqual({ created: 0, deactivated: 0, updated: 1 })
  })

  /**
   * Rota fora do arquivo é rota que a transportadora parou de atender — e o motorista continua
   * ligado a ela. Apagar levaria a cobertura junto por cascata; inativar guarda o histórico.
   */
  test('deactivates the region missing from the file instead of deleting it', async () => {
    const seeded = new FakeRepository([{ region: BARRETOS }, { region: JABOTICABAL }])
    const useCase = createImportFreightRegionsUseCase({ repository: seeded })

    const summary = await useCase.import({ context: CONTEXT, regions: [BARRETOS] })

    expect(summary).toEqual({ created: 0, deactivated: 1, updated: 0 })
    expect(seeded.updateCalls).toEqual([
      {
        expectedVersion: '1',
        region: JABOTICABAL,
        regionId: '00000000-0000-4000-8000-000000000002',
        status: 'inactive',
      },
    ])
  })

  test('does not deactivate twice what is already inactive', async () => {
    const seeded = new FakeRepository([{ region: BARRETOS, status: 'inactive' }])
    const useCase = createImportFreightRegionsUseCase({ repository: seeded })

    const summary = await useCase.import({ context: CONTEXT, regions: [] })

    expect(summary).toEqual({ created: 0, deactivated: 0, updated: 0 })
    expect(seeded.updateCalls).toEqual([])
  })

  /** Rota que voltou ao arquivo volta a valer sem cadastro novo — a chave natural é a mesma. */
  test('reactivates the inactive region that came back in the file', async () => {
    const seeded = new FakeRepository([{ region: BARRETOS, status: 'inactive' }])
    const useCase = createImportFreightRegionsUseCase({ repository: seeded })

    const summary = await useCase.import({ context: CONTEXT, regions: [BARRETOS] })

    expect(summary).toEqual({ created: 0, deactivated: 0, updated: 1 })
    expect(seeded.updateCalls[0]?.status).toBe('active')
  })

  /** Escrita perdida por versão é edição concorrente: o resumo não pode dizer que gravou. */
  test('fails loudly when the region changed under the import', async () => {
    const seeded = new FakeRepository([{ region: BARRETOS }])
    const conflicting: FreightRegionImportPort = {
      create: (input) => seeded.create(input),
      listAll: (input) => seeded.listAll(input),
      update: async () => null,
    }
    const useCase = createImportFreightRegionsUseCase({ repository: conflicting })

    await expect(
      useCase.import({ context: CONTEXT, regions: [{ ...BARRETOS, name: 'BARRETOS ZONA 1' }] }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FREIGHT_REGION_VERSION_CONFLICT' }))
  })
})
