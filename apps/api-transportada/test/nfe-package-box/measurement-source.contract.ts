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
  CAMERA_DIMENSIONS,
  isEditedDimension,
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
   * ⚠️ **O teto de 30 mm é por dimensão, e a digitada por cima é isenta** (R5, spec.md:383-385 —
   * "Se o conferente digitou por cima, a origem é `camera_adjusted` e a regra não se aplica a essa
   * dimensão"). A 2ª revisão mediu que aplicar o teto sobre o MÁXIMO das três recusava o caminho
   * D6 inteiro: a dimensão que a câmera não leu nasce vazia na tela, o conferente digita, e a
   * gravação voltava `400`. O teto roda sobre o mesmo conjunto de dimensões NÃO editadas que a
   * regra de 10 mm já usa — com `source: camera` as três contam sempre.
   */
  test('camera_adjusted: margem acima de 30 mm na dimensão digitada por cima grava — a regra não se aplica a ela', () => {
    const parsed = parsePackageBoxMeasurement(
      cameraBody({ impreciseConfirmed: true, lengthMarginMm: 31 }, 'camera_adjusted'),
    )

    expect(parsed.source).toBe('camera_adjusted')
    expect(parsed.camera?.lengthMarginMm).toBe(31)
  })

  /**
   * D6 ponta a ponta: a câmera leu comprimento e largura (propostas gravadas, aceitas como estão) e
   * não leu a altura (margem 45 mm, nenhuma proposta) — o conferente digitou 450 mm por cima.
   */
  test('camera_adjusted: altura não lida (45 mm) e digitada por cima grava', () => {
    const parsed = parsePackageBoxMeasurement(
      cameraBody(
        {
          heightMarginMm: 45,
          impreciseConfirmed: false,
          proposedLengthMm: TYPED_BODY.lengthMm,
          proposedWidthMm: TYPED_BODY.widthMm,
        },
        'camera_adjusted',
      ),
    )

    expect(parsed.source).toBe('camera_adjusted')
    expect(parsed.camera?.heightMarginMm).toBe(45)
  })

  /**
   * T14 item M2 da 2ª revisão: `proposed<Dim>Mm` é opcional, e comparar `undefined` com o valor
   * gravado dava "editada" às três de uma vez — `camera_adjusted` sem proposta nenhuma dispensava a
   * confirmação de imprecisão inteira. Dimensão sem proposta conhecida é tratada como NÃO editada
   * (lado seguro); a exceção é a que a câmera declarou não ter lido (margem acima do teto, D6).
   */
  test('camera_adjusted sem nenhuma proposta não dispensa a confirmação de imprecisão', () => {
    expect(() =>
      parsePackageBoxMeasurement(
        cameraBody({ impreciseConfirmed: false, lengthMarginMm: 11 }, 'camera_adjusted'),
      ),
    ).toThrow()
  })

  /**
   * Decisão de 2026-09-16 (T12, achado da T10/T3): a margem é da proposta da câmera (D17) e continua
   * indo mesmo quando o operador edita — mas a regra de confirmação de imprecisão do D15 é sobre o
   * *valor gravado*, e a dimensão que o operador corrigiu à mão já foi revista. Sem confirmação e com
   * a dimensão editada não é o mesmo risco de "número plausível sem aviso" (ADR-0044 §1) que um
   * valor puro da câmera sem revisão nenhuma. ⚠️ Vale só para a dimensão **comprovadamente** editada
   * — `proposed<Dim>Mm` presente e diferente do gravado (T14 item M2 da 2ª revisão).
   */
  test('margem acima de 10 mm sem confirmação com camera_adjusted grava na dimensão editada por cima', () => {
    const parsed = parsePackageBoxMeasurement(
      cameraBody(
        {
          impreciseConfirmed: false,
          lengthMarginMm: 11,
          proposedLengthMm: TYPED_BODY.lengthMm + 40,
        },
        'camera_adjusted',
      ),
    )
    expect(parsed.source).toBe('camera_adjusted')
    expect(parsed.camera?.lengthMarginMm).toBe(11)
  })

  /**
   * T14 item M1: a dispensa da confirmação em `camera_adjusted` é **por dimensão editada**, não
   * pelo bloco inteiro. Uma leitura em que só o comprimento foi corrigido continuava gravando
   * largura e altura imprecisas da câmera sem ninguém confirmar nada.
   */
  test('camera_adjusted: dimensão NÃO editada acima de 10 mm ainda exige confirmação', () => {
    expect(() =>
      parsePackageBoxMeasurement(
        cameraBody(
          {
            heightMarginMm: 11,
            impreciseConfirmed: false,
            proposedHeightMm: TYPED_BODY.heightMm,
            proposedLengthMm: 999,
          },
          'camera_adjusted',
        ),
      ),
    ).toThrow()
  })

  test('camera_adjusted: a dimensão editada por cima é a única dispensada', () => {
    const parsed = parsePackageBoxMeasurement(
      cameraBody(
        {
          impreciseConfirmed: false,
          lengthMarginMm: 11,
          proposedHeightMm: TYPED_BODY.heightMm,
          proposedLengthMm: TYPED_BODY.lengthMm + 40,
        },
        'camera_adjusted',
      ),
    )
    expect(parsed.source).toBe('camera_adjusted')
    expect(parsed.camera?.lengthMarginMm).toBe(11)
  })

  /**
   * T14 item M2: bloco `camera` sem margem nenhuma passava como se a margem fosse zero — a leitura
   * mais imprecisa possível entrava como a mais confiável de todas, sem confirmação de ninguém.
   */
  test('source camera sem margem nenhuma é recusado (400), não vale como margem zero', () => {
    expect(() =>
      parsePackageBoxMeasurement({
        ...TYPED_BODY,
        camera: { engine: 'aruco-homography-v1', impreciseConfirmed: false, warnings: [] },
        source: 'camera',
      }),
    ).toThrow()
  })

  test('uma margem só já basta — a câmera pode não propor as três', () => {
    const parsed = parsePackageBoxMeasurement({
      ...TYPED_BODY,
      camera: {
        engine: 'aruco-homography-v1',
        impreciseConfirmed: false,
        lengthMarginMm: 4,
        warnings: [],
      },
      source: 'camera',
    })
    expect(parsed.camera?.lengthMarginMm).toBe(4)
  })

  test('motivo fora do enum de D9 é recusado (400)', () => {
    expect(() => parsePackageBoxMeasurement(cameraBody({ warnings: ['naoExiste'] }))).toThrow()
  })

  test('campo a mais no corpo é recusado (.strict())', () => {
    expect(() => parsePackageBoxMeasurement({ ...TYPED_BODY, extra: true })).toThrow()
  })
})

/**
 * ⚠️ **A coluna da caixa guarda a incerteza do que a CÂMERA mediu, não do que o operador digitou.**
 * O máximo das três punha na caixa a margem de uma dimensão que a câmera nem chegou a propor: no
 * caminho D6 (altura não lida, margem 45 mm, digitada com a fita) a caixa ficava marcada com 45 mm
 * de incerteza sobre uma medida de fita, enquanto o schema já excluía essa dimensão das duas regras
 * de margem (3ª revisão). Agora é a mesma definição dos dois lados: o máximo das dimensões **não
 * editadas**, `null` quando todas foram. A margem de cada dimensão proposta segue no histórico
 * (D17), que é o que a validação lê.
 */
describe('resolveMeasurementMargin (D17)', () => {
  const RECORDED = { heightMm: 200, lengthMm: 300, widthMm: 100 } as const

  test('sem bloco camera, a margem é nula', () => {
    expect(
      resolveMeasurementMargin({ camera: undefined, recorded: RECORDED, source: 'typed' }),
    ).toBeNull()
  })

  test('nada editado: a margem gravada é a maior das três', () => {
    expect(
      resolveMeasurementMargin({
        camera: {
          heightMarginMm: 14,
          lengthMarginMm: 7,
          proposedHeightMm: RECORDED.heightMm,
          proposedLengthMm: RECORDED.lengthMm,
          proposedWidthMm: RECORDED.widthMm,
          widthMarginMm: 8,
        },
        recorded: RECORDED,
        source: 'camera',
      }),
    ).toBe(14)
  })

  test('D6: a dimensão não lida e digitada por cima não leva a incerteza dela para a caixa', () => {
    expect(
      resolveMeasurementMargin({
        camera: {
          heightMarginMm: 45,
          lengthMarginMm: 7,
          proposedLengthMm: RECORDED.lengthMm,
          proposedWidthMm: RECORDED.widthMm,
          widthMarginMm: 4,
        },
        recorded: RECORDED,
        source: 'camera_adjusted',
      }),
    ).toBe(7)
  })

  test('todas as três digitadas por cima: a caixa não guarda margem nenhuma', () => {
    expect(
      resolveMeasurementMargin({
        camera: {
          heightMarginMm: 14,
          lengthMarginMm: 7,
          proposedHeightMm: 1,
          proposedLengthMm: 2,
          proposedWidthMm: 3,
          widthMarginMm: 8,
        },
        recorded: RECORDED,
        source: 'camera_adjusted',
      }),
    ).toBeNull()
  })

  test('sem nenhuma margem informada, mesmo com o bloco presente, a margem é nula', () => {
    expect(
      resolveMeasurementMargin({ camera: {}, recorded: RECORDED, source: 'camera' }),
    ).toBeNull()
  })
})

/**
 * BAIXO-2 (T14, 4ª revisão): `isEditedDimension` é exportada porque precisa ser lida em paralelo
 * com a mesma pergunta na tela (`isOverriddenDimension`, frontend) — sem teste próprio, o `export`
 * ficava sem justificativa nenhuma no arquivo.
 */
describe('isEditedDimension (D16)', () => {
  const dimension = CAMERA_DIMENSIONS.find((entry) => entry.recorded === 'lengthMm')
  if (dimension === undefined) throw new Error('dimensão "length" ausente em CAMERA_DIMENSIONS')

  test('valor gravado igual ao proposto: não editada', () => {
    expect(isEditedDimension({ proposedLengthMm: 300 }, dimension, 300)).toBe(false)
  })

  test('valor gravado diferente do proposto: editada', () => {
    expect(isEditedDimension({ proposedLengthMm: 300 }, dimension, 340)).toBe(true)
  })

  test('sem proposta e margem dentro do teto de 30 mm (lado seguro): não editada', () => {
    expect(isEditedDimension({ lengthMarginMm: 20 }, dimension, 340)).toBe(false)
  })

  test('sem proposta e margem acima de 30 mm (D6): editada — a câmera não leu isso', () => {
    expect(isEditedDimension({ lengthMarginMm: 45 }, dimension, 340)).toBe(true)
  })

  /**
   * BAIXO-3 (T14, 5ª revisão): o ramo `?? 0` (margem ausente, não só zero) não tinha teste — sem
   * proposta e sem margem nenhuma no bloco `camera`, o lado seguro (0 mm) tem que ficar abaixo do
   * teto e marcar como não editada, igual ao caso com margem informada.
   */
  test('sem proposta e sem margem nenhuma informada (lado seguro do "?? 0"): não editada', () => {
    expect(isEditedDimension({}, dimension, 340)).toBe(false)
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
        getSiblings: () => Promise.reject(new Error('not stubbed')),
        list: () => Promise.resolve([]),
        measure: () => {
          capturedMeasure.called = true
          return Promise.resolve(true)
        },
        replicate: () => Promise.reject(new Error('not stubbed')),
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
      | { readonly measuredByUserId: string; readonly measurementMarginMm: number | null }
      | undefined
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

/**
 * Spec 155 T2.1 (D6): `replicated` é origem de banco, não de cliente. A rota de medir aceita só o
 * que o operador mede; a de replicar grava `replicated` por conta própria — aceitar no corpo de
 * medir deixaria qualquer cliente declarar medida replicada sem origem nenhuma.
 */
describe('a origem replicated (spec 155, T2.1)', () => {
  const MIGRATION_DIRECTORY = '20260917153054_package_box_replicated_source'

  async function readMigration(file: string): Promise<string> {
    return Bun.file(new URL(`../../drizzle/${MIGRATION_DIRECTORY}/${file}`, import.meta.url)).text()
  }

  test('o schema e o domínio conhecem replicated', () => {
    expect(SCHEMA_SOURCES).toContain('replicated')
    expect(PACKAGE_BOX_MEASUREMENT_SOURCES).toContain('replicated')
  })

  test('o corpo de medir recusa replicated, com ou sem bloco de câmera', () => {
    expect(() => parsePackageBoxMeasurement({ ...TYPED_BODY, source: 'replicated' })).toThrow()
    expect(() => parsePackageBoxMeasurement(cameraBody({}, 'replicated' as 'camera'))).toThrow()
  })

  test('a migration é aditiva e só alarga os checks para replicated', async () => {
    const migrationSql = await readMigration('migration.sql')

    expect(migrationSql).not.toMatch(/drop\s+(table|column)/i)
    expect(migrationSql).toContain('ADD COLUMN "replicated_from_box_id" uuid')
    expect(migrationSql).toMatch(/nfe_package_boxes_measurement_source_check[^;]*'replicated'/)
    expect(migrationSql).toMatch(/nfe_package_box_measurements_source_check[^;]*'replicated'/)
    expect(migrationSql).toMatch(
      /FOREIGN KEY \("company_id","replicated_from_box_id"\) REFERENCES "nfe_package_boxes"\("company_id","id"\)/,
    )
    expect(migrationSql).toContain('nfe_package_box_measurements_replicated_from_check')
  })

  test('o rollback recusa desfazer com medida replicada gravada', async () => {
    const rollbackSql = await readMigration('rollback.sql')

    expect(rollbackSql).toMatch(/RAISE EXCEPTION[^;]*replicated/)
    expect(rollbackSql).toContain(MIGRATION_DIRECTORY)
  })
})
