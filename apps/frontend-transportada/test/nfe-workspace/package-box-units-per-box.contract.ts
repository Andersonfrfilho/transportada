/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_UNITS_PER_BOX,
  resolveInitialUnitsPerBox,
} from '../../src/modules/nfe-workspace/shared/packageBoxUnitsPerBox.service'

/**
 * A importação da NF-e nunca preenche `unitsPerBox` (nasce `1`), enquanto a API já devolve
 * `packagingUnitCount` (o sufixo numérico da unidade comercial, `CX9` → 9) — o formulário pedia um
 * dado que já temos. `resolveInitialUnitsPerBox` decide o valor inicial do campo.
 */
describe('resolveInitialUnitsPerBox', () => {
  it('caixa pendente, padrão gravado, com packagingUnitCount: usa o packagingUnitCount', () => {
    expect(
      resolveInitialUnitsPerBox({
        measuredAt: null,
        packagingUnitCount: 9,
        unitsPerBox: DEFAULT_UNITS_PER_BOX,
      }),
    ).toBe(9)
  })

  it('caixa pendente, padrão gravado, sem packagingUnitCount: mantém o valor gravado', () => {
    expect(
      resolveInitialUnitsPerBox({
        measuredAt: null,
        packagingUnitCount: undefined,
        unitsPerBox: DEFAULT_UNITS_PER_BOX,
      }),
    ).toBe(DEFAULT_UNITS_PER_BOX)
  })

  it('caixa já medida: mantém o que está gravado, mesmo com packagingUnitCount disponível', () => {
    expect(
      resolveInitialUnitsPerBox({
        measuredAt: '2026-01-10T12:00:00.000Z',
        packagingUnitCount: 9,
        unitsPerBox: DEFAULT_UNITS_PER_BOX,
      }),
    ).toBe(DEFAULT_UNITS_PER_BOX)
  })

  it('caixa pendente com unitsPerBox já diferente do padrão: mantém o que está gravado', () => {
    expect(
      resolveInitialUnitsPerBox({
        measuredAt: null,
        packagingUnitCount: 9,
        unitsPerBox: 3,
      }),
    ).toBe(3)
  })
})

describe('o formulário abre com o valor resolvido, nunca com box.unitsPerBox cru', () => {
  it('PackageBoxMeasurementPanel resolve pelo caminho digitado', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain(
      "import { resolveInitialUnitsPerBox } from '../shared/packageBoxUnitsPerBox.service'",
    )
    expect(panel).toContain('unitsPerBox={resolveInitialUnitsPerBox(box)}')
  })

  it('PackageBoxCameraFlow resolve pelo caminho da câmera', async () => {
    const flow = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxCameraFlow.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(flow).toContain(
      "import { resolveInitialUnitsPerBox } from '../shared/packageBoxUnitsPerBox.service'",
    )
    expect(flow).toContain('unitsPerBox={resolveInitialUnitsPerBox(box)}')
  })
})
