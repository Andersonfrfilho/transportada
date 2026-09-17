/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  PackageBoxNotFoundError,
  PackageBoxReplicationSourceNotMeasuredError,
  PackageBoxReplicationTargetAlreadyMeasuredError,
  PackageBoxReplicationTargetOutsideFamilyError,
} from '../../src/nfe-documents/domain/package-box-measurement.error.js'
import { createListPackageBoxSiblings } from '../../src/nfe-documents/application/list-package-box-siblings.use-case.js'
import { createReplicatePackageBoxMeasurement } from '../../src/nfe-documents/application/replicate-package-box-measurement.use-case.js'
import type { PackageBoxRepositoryPort } from '../../src/nfe-documents/application/package-box.port.js'

function unusedRepository(): PackageBoxRepositoryPort {
  return {
    getSiblings: () => Promise.reject(new Error('not stubbed')),
    list: () => Promise.reject(new Error('not stubbed')),
    measure: () => Promise.reject(new Error('not stubbed')),
    replicate: () => Promise.reject(new Error('not stubbed')),
  }
}

const SIBLING_ITEM = {
  commercialUnit: 'CX36',
  description: 'SAB FARNESE 180G AVEIA ESFOLIANT',
  grossWeightGrams: null,
  heightMm: null,
  id: 'sibling-1',
  lengthMm: null,
  measuredAt: null,
  measurementSource: null,
  packagingUnitCount: 36,
  productCode: '6959',
  unitsPerBox: 1,
  variantLabel: 'AVEIA ESFOLIANT',
  widthMm: null,
}

describe('GET /nfe-package-boxes/:id/siblings (spec 155 G003)', () => {
  test('devolve a família e o grupo de embalagem em listas separadas', async () => {
    const repository: PackageBoxRepositoryPort = {
      ...unusedRepository(),
      getSiblings: (input) => {
        expect(input).toEqual({ boxId: 'box-1', companyId: 'company-1' })
        return Promise.resolve({
          family: [SIBLING_ITEM],
          originVariantLabel: 'PURO E HIDRATAN',
          packaging: [],
        })
      },
    }

    const result = await createListPackageBoxSiblings({ repository }).execute({
      boxId: 'box-1',
      context: { companyId: 'company-1' },
    })

    expect(result).toEqual({
      family: [SIBLING_ITEM],
      isLowConfidenceFamily: false,
      originVariantLabel: 'PURO E HIDRATAN',
      packaging: [],
    })
  })

  /**
   * D11/G011: a tela só abre o diálogo desmarcado se a API disser que a família é assimétrica — o
   * rótulo da origem entra na conta, senão `VACUO TRADICION` sozinho contra `EXTRA FORTE TRA` some.
   */
  test('família de formato assimétrico chega marcada, contando o rótulo da origem', async () => {
    const repository: PackageBoxRepositoryPort = {
      ...unusedRepository(),
      getSiblings: () =>
        Promise.resolve({
          family: [{ ...SIBLING_ITEM, variantLabel: 'EXTRA FORTE TRA' }],
          originVariantLabel: 'VACUO TRADICION',
          packaging: [],
        }),
    }

    const result = await createListPackageBoxSiblings({ repository }).execute({
      boxId: 'box-1',
      context: { companyId: 'company-1' },
    })

    expect(result.isLowConfidenceFamily).toBe(true)
  })

  /** Caixa de outra empresa (ou inexistente) é a mesma coisa para quem procurou: 404. */
  test('caixa de outra empresa devolve PackageBoxNotFoundError', async () => {
    const repository: PackageBoxRepositoryPort = {
      ...unusedRepository(),
      getSiblings: () => Promise.resolve(null),
    }

    await expect(
      createListPackageBoxSiblings({ repository }).execute({
        boxId: 'box-de-outra-empresa',
        context: { companyId: 'company-1' },
      }),
    ).rejects.toBeInstanceOf(PackageBoxNotFoundError)
  })
})

describe('POST /nfe-package-boxes/:id/replicate (spec 155 G004/G005/G006)', () => {
  test('devolve quantas gravou', async () => {
    const repository: PackageBoxRepositoryPort = {
      ...unusedRepository(),
      replicate: (input) => {
        expect(input).toEqual({
          boxId: 'origem',
          companyId: 'company-1',
          measuredByUserId: 'user-1',
          targetIds: ['alvo-1', 'alvo-2'],
        })
        return Promise.resolve(2)
      },
    }

    const result = await createReplicatePackageBoxMeasurement({ repository }).execute({
      boxId: 'origem',
      context: { companyId: 'company-1', userId: 'user-1' },
      targetIds: ['alvo-1', 'alvo-2'],
    })

    expect(result).toEqual({ replicatedCount: 2 })
  })

  /** D4/G005: os quatro caminhos de recusa propagam do repositório, sem o use case interpretar nada. */
  test.each([
    ['origem sem medida', new PackageBoxReplicationSourceNotMeasuredError()],
    ['alvo de outra empresa', new PackageBoxNotFoundError()],
    ['alvo fora da família', new PackageBoxReplicationTargetOutsideFamilyError()],
    ['alvo já medido', new PackageBoxReplicationTargetAlreadyMeasuredError()],
  ])('propaga o erro de domínio: %s', async (_label, error) => {
    const repository: PackageBoxRepositoryPort = {
      ...unusedRepository(),
      replicate: () => Promise.reject(error),
    }

    await expect(
      createReplicatePackageBoxMeasurement({ repository }).execute({
        boxId: 'origem',
        context: { companyId: 'company-1', userId: 'user-1' },
        targetIds: ['alvo-1'],
      }),
    ).rejects.toBe(error)
  })

  /** D4: replicar de novo na mesma família não grava nada — a segunda chamada recusa o alvo já medido. */
  test('repetir a mesma chamada não reescreve nada (idempotência via 409)', async () => {
    let calls = 0
    const repository: PackageBoxRepositoryPort = {
      ...unusedRepository(),
      replicate: () => {
        calls += 1
        return calls === 1
          ? Promise.resolve(1)
          : Promise.reject(new PackageBoxReplicationTargetAlreadyMeasuredError())
      },
    }

    const replicate = createReplicatePackageBoxMeasurement({ repository })
    const input = {
      boxId: 'origem',
      context: { companyId: 'company-1', userId: 'user-1' },
      targetIds: ['alvo-1'],
    }

    await expect(replicate.execute(input)).resolves.toEqual({ replicatedCount: 1 })
    await expect(replicate.execute(input)).rejects.toBeInstanceOf(
      PackageBoxReplicationTargetAlreadyMeasuredError,
    )
  })
})

describe('erros de domínio da réplica (spec 155 D4/G005)', () => {
  test.each([
    [new PackageBoxNotFoundError(), 404],
    [new PackageBoxReplicationSourceNotMeasuredError(), 422],
    [new PackageBoxReplicationTargetOutsideFamilyError(), 422],
    [new PackageBoxReplicationTargetAlreadyMeasuredError(), 409],
  ])('%s responde %i', (error, status) => {
    expect(error.status).toBe(status)
  })
})
