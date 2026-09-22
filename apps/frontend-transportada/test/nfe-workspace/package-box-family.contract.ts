/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { groupPackageBoxesByPackaging } from '@/modules/nfe-workspace/shared/packageBoxPackagingGroup.service'
import type { PackageBox } from '@/modules/nfe-workspace/shared/packageBoxClient.service'

function buildBox(overrides: Partial<PackageBox> & { readonly id: string }): PackageBox {
  return {
    cartonGtin: null,
    commercialUnit: 'CX36',
    cumulativeShare: 0.1,
    description: 'SAB FARNESE 180G ERVA DOCE HORTE',
    emitterTaxId: '05868574001090',
    familyKey: undefined,
    familyMeasuredCount: 0,
    familyPendingCount: 0,
    grossWeightGrams: null,
    heightMm: null,
    lengthMm: null,
    measuredAt: null,
    measurementMarginMm: null,
    measurementSource: null,
    packagingSiblingCount: 0,
    packagingUnitCount: undefined,
    productCode: '6961',
    share: 0.1,
    transportedVolumes: 10,
    unitsPerBox: 1,
    variantLabel: 'ERVA DOCE HORTE',
    widthMm: null,
    withinCoverage: true,
    ...overrides,
  }
}

/**
 * Spec 155 (D3, D8, G008, T3.2): a fila junta as linhas do mesmo grupo de embalagem
 * `(emitente, cProd)` na tela, sem apagar nenhuma — a "duplicata" reportada em produção eram
 * `CX36`/`FR12` do mesmo sabão, cada uma com sua própria medida pendente.
 */
describe('agrupamento por embalagem na fila (spec 155 D3, D8, G008)', () => {
  it('junta as linhas do mesmo emitente e cProd, preservando a ordem de chegada', () => {
    const cx36 = buildBox({ commercialUnit: 'CX36', id: 'cx36', packagingUnitCount: 36 })
    const other = buildBox({ id: 'other', productCode: '9999' })
    const fr12 = buildBox({ commercialUnit: 'FR12', id: 'fr12', packagingUnitCount: 12 })

    const groups = groupPackageBoxesByPackaging([cx36, other, fr12])

    expect(groups).toHaveLength(2)
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['cx36', 'fr12'])
    expect(groups[1]?.items.map((item) => item.id)).toEqual(['other'])
  })

  /** D3: o mesmo cProd de emitentes diferentes NUNCA é o mesmo grupo — produtos distintos. */
  it('não junta o mesmo cProd de emitentes diferentes', () => {
    const first = buildBox({ emitterTaxId: '11111111000100', id: 'first' })
    const second = buildBox({ emitterTaxId: '22222222000100', id: 'second' })

    const groups = groupPackageBoxesByPackaging([first, second])

    expect(groups).toHaveLength(2)
  })

  it('devolve grupo de um item quando não há embalagem irmã na página', () => {
    const solo = buildBox({ id: 'solo' })

    const groups = groupPackageBoxesByPackaging([solo])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.items).toEqual([solo])
    expect(groups[0]?.key).toBe(`${solo.emitterTaxId}|${solo.productCode}`)
  })
})

/**
 * ⚠️ Contrato por texto de fonte (mesmo padrão do resto desta suíte): a app não roda DOM em teste.
 */
describe('badge de unidade e contador de família na linha (spec 155 D8, D9, G008)', () => {
  it('cada linha mostra a unidade em destaque e agrupa por embalagem', async () => {
    const source = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(source).toContain('groupPackageBoxesByPackaging')
    expect(source).toContain('packageBoxes.packagingUnitBadge')
    /** D9: o contador de família vem pronto da API — a tela nunca refaz a conta local. */
    expect(source).toContain('familyMeasuredCount')
    expect(source).toContain('familyPendingCount')
    expect(source).toContain('packageBoxes.family.counter')
  })
})
