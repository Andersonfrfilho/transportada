/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  PACKAGE_BOX_MEASUREMENT_SOURCES,
  PACKAGE_BOX_MEASUREMENT_WARNINGS,
} from '../../src/nfe-documents/domain/package-box-measurement.constant.js'
import {
  assertCameraMeasurementEnabled,
  resolveMeasurementMargin,
} from '../../src/nfe-documents/domain/package-box-measurement.policy.js'
import { PackageBoxCameraMeasurementDisabledError } from '../../src/nfe-documents/domain/package-box-measurement.error.js'
import { createMeasurePackageBox } from '../../src/nfe-documents/application/measure-package-box.use-case.js'
import type { CameraMeasurementSettingsPort } from '../../src/nfe-documents/application/camera-measurement-settings.port.js'
import type {
  PackageBoxMeasurement,
  PackageBoxRepositoryPort,
} from '../../src/nfe-documents/application/package-box.port.js'
import { parsePackageBoxMeasurement } from '../../src/nfe-documents/presentation/package-box.schema.js'
import {
  PACKAGE_BOX_MEASUREMENT_SOURCES as SCHEMA_SOURCES,
  PACKAGE_BOX_MEASUREMENT_WARNINGS as SCHEMA_WARNINGS,
} from '../../src/database/nfe.schema.js'

const TYPED_BODY = { heightMm: 200, lengthMm: 300, widthMm: 100 }

function cameraBody(
  cameraOverrides: Record<string, unknown> = {},
  source: 'camera' | 'camera_adjusted' = 'camera',
) {
  return {
    ...TYPED_BODY,
    camera: {
      engine: 'aruco-homography-v1',
      heightMarginMm: 5,
      impreciseConfirmed: false,
      lengthMarginMm: 7,
      warnings: [],
      widthMarginMm: 4,
      ...cameraOverrides,
    },
    source,
  }
}

/**
 * ⚠️ A lista de código deste domínio é uma **cópia por valor** do que `database/nfe.schema.ts`
 * declara (o domínio não importa schema de banco). Sem este contrato, as duas listas divergem em
 * silêncio, e a CHECK do banco recusaria com 500 o que o Zod já deveria ter barrado com 400.
 */
describe('paridade entre o domínio e o schema de banco (spec 152)', () => {
  test('as origens são as mesmas, na mesma ordem', () => {
    expect(PACKAGE_BOX_MEASUREMENT_SOURCES).toEqual(SCHEMA_SOURCES)
  })

  test('os motivos de imprecisão são os mesmos, na mesma ordem', () => {
    expect(PACKAGE_BOX_MEASUREMENT_WARNINGS).toEqual(SCHEMA_WARNINGS)
  })
})

describe('o schema do corpo da medida (spec 152, R5)', () => {
  test('o corpo antigo, sem source, grava typed e sem bloco camera', () => {
    const parsed = parsePackageBoxMeasurement(TYPED_BODY)
    expect(parsed.source).toBe('typed')
    expect(parsed.camera).toBeUndefined()
  })

  test('camera com source typed é recusado (400)', () => {
    expect(() =>
      parsePackageBoxMeasurement({ ...TYPED_BODY, camera: cameraBody().camera, source: 'typed' }),
    ).toThrow()
  })

  test('source diferente de typed sem o bloco camera é recusado (400)', () => {
    expect(() => parsePackageBoxMeasurement({ ...TYPED_BODY, source: 'camera' })).toThrow()
  })

  test('margem acima de 10 mm sem confirmação explícita é recusada (400)', () => {
    expect(() =>
      parsePackageBoxMeasurement(cameraBody({ impreciseConfirmed: false, lengthMarginMm: 11 })),
    ).toThrow()
  })

  test('margem acima de 10 mm com confirmação explícita grava', () => {
    const parsed = parsePackageBoxMeasurement(
      cameraBody({ impreciseConfirmed: true, lengthMarginMm: 11 }),
    )
    expect(parsed.camera?.impreciseConfirmed).toBe(true)
  })

  test('margem acima de 30 mm proposta por camera é recusada (400): a câmera não propõe o que não lê', () => {
    expect(() =>
      parsePackageBoxMeasurement(cameraBody({ impreciseConfirmed: true, lengthMarginMm: 31 })),
    ).toThrow()
  })

  /**
   * T14 item 3 (revisão de segurança): `camera_adjusted` não escapa mais do teto de imprecisão.
   * A margem acima de 30 mm é sobre a PROPOSTA da câmera, não sobre o valor que o operador digitou
   * por cima — e a câmera nunca poderia ter proposto algo tão impreciso, então o bloco `camera`
   * continua sendo recusado mesmo depois da edição.
   */
  test('margem acima de 30 mm proposta pela câmera é recusada mesmo com camera_adjusted', () => {
    expect(() =>
      parsePackageBoxMeasurement(
        cameraBody({ impreciseConfirmed: true, lengthMarginMm: 31 }, 'camera_adjusted'),
      ),
    ).toThrow()
  })

  /**
   * Decisão de 2026-09-16 (T12, achado da T10/T3): a margem é da proposta da câmera (D17) e continua
   * indo mesmo quando o operador edita — mas a regra de confirmação de imprecisão do D15 é sobre o
   * *valor gravado*, e um valor `camera_adjusted` já foi corrigido à mão. Sem confirmação e sem
   * margem editada não é o mesmo risco de "número plausível sem aviso" (ADR-0044 §1) que um valor
   * puro da câmera sem revisão nenhuma.
   */
  test('margem acima de 10 mm sem confirmação com camera_adjusted grava — o operador já editou por cima', () => {
    const parsed = parsePackageBoxMeasurement(
      cameraBody({ impreciseConfirmed: false, lengthMarginMm: 11 }, 'camera_adjusted'),
    )
    expect(parsed.source).toBe('camera_adjusted')
    expect(parsed.camera?.lengthMarginMm).toBe(11)
  })

  test('motivo fora do enum de D9 é recusado (400)', () => {
    expect(() => parsePackageBoxMeasurement(cameraBody({ warnings: ['naoExiste'] }))).toThrow()
  })

  test('campo a mais no corpo é recusado (.strict())', () => {
    expect(() => parsePackageBoxMeasurement({ ...TYPED_BODY, extra: true })).toThrow()
  })
})

describe('resolveMeasurementMargin (D17)', () => {
  test('sem bloco camera, a margem é nula', () => {
    expect(resolveMeasurementMargin(undefined)).toBeNull()
  })

  test('a margem gravada é a maior das três', () => {
    expect(
      resolveMeasurementMargin({ heightMarginMm: 14, lengthMarginMm: 7, widthMarginMm: 8 }),
    ).toBe(14)
  })

  test('sem nenhuma margem informada, mesmo com o bloco presente, a margem é nula', () => {
    expect(resolveMeasurementMargin({})).toBeNull()
  })
})

describe('assertCameraMeasurementEnabled (D14)', () => {
  test('typed nunca é recusado, ligado ou desligado', () => {
    expect(() => assertCameraMeasurementEnabled({ enabled: false, source: 'typed' })).not.toThrow()
    expect(() => assertCameraMeasurementEnabled({ enabled: true, source: 'typed' })).not.toThrow()
  })

  test('camera e camera_adjusted exigem a função ligada', () => {
    expect(() => assertCameraMeasurementEnabled({ enabled: false, source: 'camera' })).toThrow(
      PackageBoxCameraMeasurementDisabledError,
    )
    expect(() =>
      assertCameraMeasurementEnabled({ enabled: false, source: 'camera_adjusted' }),
    ).toThrow(PackageBoxCameraMeasurementDisabledError)
    expect(() => assertCameraMeasurementEnabled({ enabled: true, source: 'camera' })).not.toThrow()
  })
})

/**
 * ⚠️ Uma aba aberta antes do desligamento continua mandando `PUT` com `source: camera` — a recusa
 * vive no use case (I/O da leitura do interruptor), não só no schema (sem I/O).
 */
describe('createMeasurePackageBox recusa câmera com a função desligada (spec 152, R7)', () => {
  function buildDependencies(input: { readonly enabled: boolean }): {
    readonly cameraMeasurementSettings: CameraMeasurementSettingsPort
    readonly capturedMeasure: { called: boolean }
    readonly repository: PackageBoxRepositoryPort
  } {
    const capturedMeasure = { called: false }
    return {
      cameraMeasurementSettings: { readEnabled: () => Promise.resolve(input.enabled) },
      capturedMeasure,
      repository: {
        list: () => Promise.resolve([]),
        measure: () => {
          capturedMeasure.called = true
          return Promise.resolve(true)
        },
      },
    }
  }

  test('desligada: source camera é 422 e nada chega ao repositório', async () => {
    const { cameraMeasurementSettings, capturedMeasure, repository } = buildDependencies({
      enabled: false,
    })
    const measurePackageBox = createMeasurePackageBox({ cameraMeasurementSettings, repository })
    const measurement: PackageBoxMeasurement = {
      camera: {
        engine: 'aruco-homography-v1',
        impreciseConfirmed: false,
        warnings: [],
      },
      grossWeightGrams: null,
      heightMm: 200,
      lengthMm: 300,
      source: 'camera',
      unitsPerBox: 1,
      widthMm: 100,
    }

    await expect(
      measurePackageBox.execute({
        boxId: 'box-1',
        context: { companyId: 'company-1', userId: 'user-1' },
        measurement,
      }),
    ).rejects.toThrow(PackageBoxCameraMeasurementDisabledError)
    expect(capturedMeasure.called).toBe(false)
  })

  test('desligada: typed continua gravando normalmente', async () => {
    const { cameraMeasurementSettings, repository } = buildDependencies({ enabled: false })
    const measurePackageBox = createMeasurePackageBox({ cameraMeasurementSettings, repository })

    const measured = await measurePackageBox.execute({
      boxId: 'box-1',
      context: { companyId: 'company-1', userId: 'user-1' },
      measurement: {
        grossWeightGrams: null,
        heightMm: 200,
        lengthMm: 300,
        source: 'typed',
        unitsPerBox: 1,
        widthMm: 100,
      },
    })

    expect(measured).toBe(true)
  })

  test('ligada: source camera grava, e o ator vem do contexto — nunca do corpo', async () => {
    const { cameraMeasurementSettings, repository } = buildDependencies({ enabled: true })
    let captured:
      { readonly measuredByUserId: string; readonly measurementMarginMm: number | null } | undefined
    const spyRepository: PackageBoxRepositoryPort = {
      ...repository,
      measure: (input) => {
        captured = {
          measuredByUserId: input.measuredByUserId,
          measurementMarginMm: input.measurementMarginMm,
        }
        return Promise.resolve(true)
      },
    }
    const measurePackageBox = createMeasurePackageBox({
      cameraMeasurementSettings,
      repository: spyRepository,
    })

    await measurePackageBox.execute({
      boxId: 'box-1',
      context: { companyId: 'company-1', userId: 'user-42' },
      measurement: {
        camera: {
          engine: 'aruco-homography-v1',
          heightMarginMm: 5,
          impreciseConfirmed: false,
          lengthMarginMm: 9,
          warnings: [],
          widthMarginMm: 3,
        },
        grossWeightGrams: null,
        heightMm: 200,
        lengthMm: 300,
        source: 'camera',
        unitsPerBox: 1,
        widthMm: 100,
      },
    })

    expect(captured?.measuredByUserId).toBe('user-42')
    expect(captured?.measurementMarginMm).toBe(9)
  })
})
