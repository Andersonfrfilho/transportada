/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const validation = createTripResponseAdapters()

const OCCUPANCY = {
  capacityDimensions: null,
  capacityM3: '10.000000',
  capacitySource: 'reference',
  documentsWithoutVolume: 0,
  loadedM3: '4.000000',
  occupancyRatio: '0.4000',
  source: 'measured',
}

describe('a ocupação com origem medida (spec 085 G006)', () => {
  /** As quatro origens chegam da API; recusá-las apagaria a ocupação inteira da tela. */
  it('aceita measured e partial ao lado de declared e estimated', () => {
    for (const source of ['declared', 'estimated', 'measured', 'partial'] as const) {
      expect(
        validation.tripCargoPreviewFromApi({
          cargoLayout: null,
          cargoWeight: null,
          occupancy: { ...OCCUPANCY, source },
          weightConcentration: null,
        }).occupancy?.source,
      ).toBe(source)
    }
  })

  /** Origem que não conhecemos é recusa, nunca número sem marca: a marca é o que separa cabe de deve caber. */
  it('recusa origem desconhecida', () => {
    expect(() =>
      validation.tripCargoPreviewFromApi({
        cargoLayout: null,
        cargoWeight: null,
        occupancy: { ...OCCUPANCY, source: 'chutado' },
        weightConcentration: null,
      }),
    ).toThrow()
  })

  it('lê o alerta de peso concentrado', () => {
    expect(
      validation.tripCargoPreviewFromApi({
        cargoLayout: null,
        cargoWeight: null,
        occupancy: null,
        weightConcentration: {
          label: 'AVENIDA 04, 50, ORLANDIA, SP',
          share: 0.72,
          stopId: 'porta-1',
        },
      }).weightConcentration,
    ).toEqual({ label: 'AVENIDA 04, 50, ORLANDIA, SP', share: 0.72, stopId: 'porta-1' })
  })

  /** Ausência é o normal — carga equilibrada é a maioria das viagens. */
  it('sem alerta a prévia continua válida', () => {
    expect(
      validation.tripCargoPreviewFromApi({ cargoLayout: null, cargoWeight: null, occupancy: null })
        .weightConcentration,
    ).toBeNull()
  })
})

/**
 * ⚠️ Contrato por texto de fonte: esta app não tem DOM nos testes, e o alerta é a única coisa na
 * tela que fala de **peso** — o desenho ao lado é de volume. Sem a fiação ele nunca aparece, e nada
 * quebra: a prévia continua desenhando um baú bonito com o eixo carregado de um lado só.
 */
describe('o alerta chega à tela de montagem', () => {
  it('o diálogo passa a concentração ao painel, e o painel a imprime', async () => {
    const dialog = await Bun.file(
      new URL(
        '../../src/modules/trip/components/TripQuickCreateDialog.component.tsx',
        import.meta.url,
      ),
    ).text()
    const panel = await Bun.file(
      new URL('../../src/modules/trip/components/TripCargoPanel.component.tsx', import.meta.url),
    ).text()

    expect(dialog).toContain('weightConcentration={cargoPreview.preview.weightConcentration}')
    expect(panel).toContain("t('occupancy.weightConcentration'")
    /** A origem parcial tem marca própria: dizer "estimado" nela seria mentir para o outro lado. */
    expect(panel).toContain("t('occupancy.partial')")
  })
})

/**
 * ⚠️ O aviso de peso concentrado imprime o **rótulo** da parada, nunca a chave que a agrupa. Ele
 * saía com `3534302|14620000|50` — o `buildStopAddressKey` cru, que é código IBGE, CEP e número —, e
 * quem lê não descobre de qual parada se trata justamente no aviso que pede uma ação.
 */
describe('rótulo do aviso de concentração', () => {
  it('imprime o endereço da parada, não a chave que a agrupa', () => {
    const source = readFileSync(
      new URL('src/modules/trip/components/TripCargoPanel.component.tsx', APPLICATION_ROOT),
      'utf8',
    )

    expect(source).toContain('stop: weightConcentration.label')
    expect(source).not.toContain('stop: weightConcentration.stopId')
  })
})
