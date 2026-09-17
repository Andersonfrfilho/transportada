/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type {
  PackageBox,
  PackageBoxSibling,
} from '@/modules/nfe-workspace/shared/packageBoxClient.service'
import { resolveFamilyReplicationSource } from '@/modules/nfe-workspace/shared/packageBoxFamilySource.service'

function buildCurrentBox(overrides: Partial<PackageBox> = {}): PackageBox {
  return {
    cartonGtin: null,
    commercialUnit: 'CX36',
    cumulativeShare: 0.1,
    description: 'SAB FARNESE 180G ERVA DOCE HORTE',
    emitterTaxId: '05868574001090',
    familyKey: '05868574001090|SAB FARNESE 180G|CX36',
    familyMeasuredCount: 1,
    familyPendingCount: 1,
    grossWeightGrams: null,
    heightMm: null,
    id: 'current',
    lengthMm: null,
    measuredAt: null,
    measurementMarginMm: null,
    measurementSource: null,
    packagingSiblingCount: 0,
    packagingUnitCount: 36,
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

function buildSibling(
  overrides: Partial<PackageBoxSibling> & { readonly id: string },
): PackageBoxSibling {
  return {
    commercialUnit: 'CX36',
    description: 'SAB FARNESE 180G AVEIA ESFOLIANT',
    grossWeightGrams: 500,
    heightMm: 150,
    lengthMm: 300,
    measuredAt: null,
    measurementSource: null,
    packagingUnitCount: 36,
    productCode: '6959',
    unitsPerBox: 1,
    variantLabel: 'AVEIA ESFOLIANT',
    widthMm: 200,
    ...overrides,
  }
}

/**
 * Spec 155 (D12, G012): a origem de "aplicar a todos" — extraída para função pura porque o botão
 * (`PackageBoxFamilyApplyButton`) busca as irmãs sob demanda e precisa decidir sem repetir a regra.
 */
describe('origem de "aplicar medida a todos os sabores" (D12, G012)', () => {
  it('prefere a irmã com medida conferida quando há conferida e replicada na família', () => {
    const currentBox = buildCurrentBox({ measuredAt: null })
    const replicatedSibling = buildSibling({
      id: 'replicated-sibling',
      measuredAt: '2026-09-16T12:00:00Z',
      measurementSource: 'replicated',
    })
    const confirmedSibling = buildSibling({
      id: 'confirmed-sibling',
      measuredAt: '2026-09-17T12:00:00Z',
      measurementSource: 'typed',
    })

    const offer = resolveFamilyReplicationSource({
      currentBox,
      siblings: [replicatedSibling, confirmedSibling],
    })

    expect(offer?.boxId).toBe('confirmed-sibling')
  })

  it('usa a replicada como origem quando é a única medida da família (MÉDIO-3, decisão 2026-09-17)', () => {
    const currentBox = buildCurrentBox({ measuredAt: null })
    const replicatedSibling = buildSibling({
      id: 'replicated-sibling',
      measuredAt: '2026-09-16T12:00:00Z',
      measurementSource: 'replicated',
    })

    const offer = resolveFamilyReplicationSource({ currentBox, siblings: [replicatedSibling] })

    expect(offer).toEqual({
      boxId: 'replicated-sibling',
      dimensions: { heightMm: 150, lengthMm: 300, unitsPerBox: 1, widthMm: 200 },
    })
  })

  it('nenhuma medida na família não resolve origem nenhuma', () => {
    const currentBox = buildCurrentBox({ measuredAt: null })
    const pendingSibling = buildSibling({ id: 'pending-sibling' })

    const offer = resolveFamilyReplicationSource({ currentBox, siblings: [pendingSibling] })

    expect(offer).toBeUndefined()
  })

  it('nenhuma pendente na família não resolve origem nenhuma', () => {
    const currentBox = buildCurrentBox({
      measuredAt: '2026-09-17T12:00:00Z',
      heightMm: 150,
      lengthMm: 300,
      widthMm: 200,
    })
    const measuredSibling = buildSibling({
      id: 'measured-sibling',
      measuredAt: '2026-09-16T12:00:00Z',
      measurementSource: 'typed',
    })

    const offer = resolveFamilyReplicationSource({ currentBox, siblings: [measuredSibling] })

    expect(offer).toBeUndefined()
  })

  it('usa a própria caixa como origem quando ela já está medida e há irmã pendente', () => {
    const currentBox = buildCurrentBox({
      grossWeightGrams: 500,
      heightMm: 150,
      lengthMm: 300,
      measuredAt: '2026-09-17T12:00:00Z',
      measurementSource: 'typed',
      unitsPerBox: 1,
      widthMm: 200,
    })
    const pendingSibling = buildSibling({ id: 'pending-sibling' })

    const offer = resolveFamilyReplicationSource({ currentBox, siblings: [pendingSibling] })

    expect(offer).toEqual({
      boxId: 'current',
      dimensions: { heightMm: 150, lengthMm: 300, unitsPerBox: 1, widthMm: 200 },
    })
  })
})

/**
 * ⚠️ Contrato por texto de fonte (mesmo padrão do resto desta suíte, sem DOM nos testes desta app).
 */
describe('botão "aplicar medida a todos os sabores" na linha da fila (D12, G012)', () => {
  it('busca as irmãs só no clique, resolve a origem e abre o diálogo de replicar existente', async () => {
    const button = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxFamilyApplyButton.component.tsx',
        import.meta.url,
      ),
    ).text()

    /** D9/T2.2: as irmãs nunca acompanham a fila de 50 — só o clique busca (M1/M2, re-revisão). */
    expect(button).toContain('usePackageBoxSiblingsFetcher')
    expect(button).toContain('resolveFamilyReplicationSource')
    expect(button).toContain('packageBoxes.family.applyToAll')
    expect(button).toContain('packageBoxes.family.applyUnresolved')
    expect(button).toContain('packageBoxes.family.applyFailed')
    /** M1: nenhum `useEffect` resolvendo a oferta — a busca e a decisão vivem no `onClick`. */
    expect(button).not.toContain('useEffect')
    expect(button).not.toContain('resolvedForRef')
  })

  it('a busca do clique pede staleTime 0 — nunca reaproveita cache obsoleto (M2)', async () => {
    const hook = await Bun.file(
      new URL('../../src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts', import.meta.url),
    ).text()

    expect(hook).toContain('usePackageBoxSiblingsFetcher')
    expect(hook).toContain('staleTime: 0')
  })

  it('a fila deriva a elegibilidade do botão pronto da API, sem somar de novo (D9)', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('PackageBoxFamilyApplyButton')
    expect(panel).toContain('canApplyFamilyMeasure')
    expect(panel).toContain('box.familyMeasuredCount >= 1')
    expect(panel).toContain('box.familyPendingCount >= 1')
    /** Reaproveita o diálogo e o reset já existentes — nada de um segundo caminho de gravação. */
    expect(panel).toContain('openReplicateDialogFromFamilyApply')
    expect(panel).toContain('onResetReplicate()')
  })
})
