/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  isComplementBox,
  resolveCargoComplement,
} from '@/modules/trip/shared/cargoComplement.service'
import { buildCargoComplementSummary } from '@/modules/trip/shared/cargoPrintSummary.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

function box(reasons: readonly string[]) {
  return { reasons }
}

/**
 * Spec 120: a caixa do complemento — entrou fora do mapa recomendado, funda demais para a mão de
 * quem descarrega de pé no piso (`outOfReach`) ou furando a ordem de descarga (`needsRehandling`).
 */
describe('trip cargo complement contract', () => {
  it('classifies a box by neither reason as the recommended map', () => {
    expect(resolveCargoComplement(box([]))).toBeNull()
    expect(resolveCargoComplement(box(['splitCargo']))).toBeNull()
    expect(isComplementBox(box([]))).toBe(false)
  })

  it('classifies a box by outOfReach or needsRehandling as the complement', () => {
    expect(resolveCargoComplement(box(['outOfReach']))).toBe('outOfReach')
    expect(resolveCargoComplement(box(['needsRehandling']))).toBe('needsRehandling')
    expect(isComplementBox(box(['outOfReach']))).toBe(true)
  })

  /**
   * ⚠️ **`needsRehandling` vence quando os dois aparecem juntos.** É o aviso mais grave — furar a
   * ordem de descarga obriga a remanejar outra entrega —, e desenhar as duas marcas juntas não
   * ajudaria quem carrega a decidir nada.
   */
  it('lets needsRehandling win when a box carries both reasons', () => {
    expect(resolveCargoComplement(box(['outOfReach', 'needsRehandling']))).toBe('needsRehandling')
  })

  describe('buildCargoComplementSummary', () => {
    it('splits the drawn boxes between the recommended map and the complement', () => {
      const summary = buildCargoComplementSummary([
        box([]),
        box([]),
        box(['outOfReach']),
        box(['needsRehandling']),
        box(['outOfReach', 'needsRehandling']),
      ])

      expect(summary).toEqual({
        complement: 3,
        needsRehandling: 2,
        outOfReach: 1,
        recommended: 2,
        requested: 5,
      })
    })

    /**
     * ⚠️ **`requested` soma o desenhado com o que nem chegou a ser desenhado.** Sem essa soma o
     * operador leria "2 no mapa recomendado" sem saber que a viagem pedia mais 3 caixas fora do
     * desenho — escondidas atrás de uma lista que ele pode nem abrir.
     */
    it('adds the unplaced count to what the trip asked for', () => {
      const summary = buildCargoComplementSummary(
        [box([]), box(['outOfReach'])],
        [{ count: 2 }, { count: 1 }],
      )

      expect(summary.requested).toBe(5)
      expect(summary.recommended).toBe(1)
      expect(summary.complement).toBe(1)
    })

    it('says nothing about complement when there is none', () => {
      expect(buildCargoComplementSummary([box([]), box([])])).toMatchObject({
        complement: 0,
        recommended: 2,
        requested: 2,
      })
    })
  })

  /**
   * ⚠️ **Sem complemento a forma é curta.** Imprimir "0 no complemento" faria o aviso deixar de ser
   * lido justamente quando ele importa — a mesma regra da dividida e da presumida (`chip.split` /
   * `chip.presumed`), que também só entram quando a contagem é maior que zero.
   */
  it('prints the short form only when the complement is empty, the long form otherwise', () => {
    const component = readApplicationFile(
      'src/modules/trip/components/TripCargoLayers.component.tsx',
    )

    expect(component).toContain('complementSummary.complement === 0')
    expect(component).toContain("t('cargoLayers.summary.short'")
    expect(component).toContain("t('cargoLayers.summary.long'")
    for (const locale of [trip, tripEn]) {
      expect(locale.cargoLayers.summary.short).toContain('{{recommended}}')
      expect(locale.cargoLayers.summary.short).toContain('{{requested}}')
      expect(locale.cargoLayers.summary.short).not.toContain('{{complement}}')
      expect(locale.cargoLayers.summary.long).toContain('{{complement}}')
    }
  })

  it('marks the complement box with its own dashed outline, distinct from split and presumed', () => {
    const component = readApplicationFile('src/components/ui/cargo-isometric.tsx')
    const css = readApplicationFile('src/components/ui/cargo-isometric.module.css')

    expect(component).toContain("box.complement === 'needsRehandling'")
    expect(component).toContain('styles.faceComplementStrong')
    expect(component).toContain('styles.faceComplement')
    const complement = css.match(/\.faceComplement \{([^}]*)\}/)?.[1] ?? ''
    const strong = css.match(/\.faceComplementStrong \{([^}]*)\}/)?.[1] ?? ''
    expect(complement).toContain('stroke-dasharray')
    expect(complement).not.toContain('fill: currentColor')
    expect(complement).toContain('var(--color-copper)')
    /** O traço mais grosso é o único jeito de diferenciar as duas marcas sem inventar cor nova. */
    expect(strong).toContain('var(--color-copper)')
    const complementWidth = Number.parseFloat(
      complement.match(/stroke-width:\s*([\d.]+)/)?.[1] ?? '0',
    )
    const strongWidth = Number.parseFloat(strong.match(/stroke-width:\s*([\d.]+)/)?.[1] ?? '0')
    expect(strongWidth).toBeGreaterThan(complementWidth)
  })

  it('names the complement in the legend and the print sheet header', () => {
    const component = readApplicationFile(
      'src/modules/trip/components/TripCargoLayers.component.tsx',
    )

    expect(component).toContain("t('cargoLayers.legend.complement')")
    expect(component).toContain("t('cargoLayers.print.complement')")
    expect(component).toContain('{row.complement}')
    expect(trip.cargoLayers.legend.complement).toContain('cobre')
    expect(trip.cargoLayers.print.complement).toBeTruthy()
    expect(tripEn.cargoLayers.legend.complement).toBeTruthy()
    expect(tripEn.cargoLayers.print.complement).toBeTruthy()
  })

  it('shows the per-stop complement badge only when it is greater than zero', () => {
    const component = readApplicationFile(
      'src/modules/trip/components/TripCargoLayers.component.tsx',
    )

    expect(component).toContain('facts.complement === 0 ? null')
    expect(component).toContain("t('cargoLayers.chip.complement', { count: facts.complement })")
  })

  /**
   * ⚠️ **Resposta sem `splitNotes` e com motivos novos continua válida.** A API sobe antes do
   * frontend, e uma validação estrita apagaria a planta inteira na janela entre os dois deploys.
   */
  describe('tolerância da validação a motivos novos e a splitNotes ausente', () => {
    const validation = createTripResponseAdapters()

    it('aceita placement sem splitNotes, com caixas usando os motivos novos', () => {
      const preview = validation.tripCargoPreviewFromApi({
        cargoLayout: {
          bedHeightM: null,
          bedLengthM: null,
          bedSource: null,
          bedWidthM: null,
          freeDepthM: null,
          freeRows: 0,
          loadingAccess: 'rear',
          occupancyKnown: false,
          overflowDepthM: null,
          overflowM3: '0.0000',
          orderIsBinding: false,
          placement: {
            layers: [
              {
                boxes: [{ reasons: ['outOfReach', 'needsRehandling'] }],
                heightM: 1,
                index: 0,
              },
            ],
            source: 'measured',
            unplaced: [],
          },
          rows: [],
          stopsWithoutVolume: [],
        },
        cargoWeight: null,
        occupancy: null,
        weightConcentration: null,
      })

      expect(preview.cargoLayout?.placement?.layers[0]?.boxes[0] as unknown).toEqual({
        reasons: ['outOfReach', 'needsRehandling'],
      })
    })

    it('não deixa splitNotes malformado derrubar a planta', () => {
      const preview = validation.tripCargoPreviewFromApi({
        cargoLayout: {
          bedHeightM: null,
          bedLengthM: null,
          bedSource: null,
          bedWidthM: null,
          freeDepthM: null,
          freeRows: 0,
          loadingAccess: 'rear',
          occupancyKnown: false,
          overflowDepthM: null,
          overflowM3: '0.0000',
          orderIsBinding: false,
          placement: {
            layers: [],
            source: 'measured',
            splitNotes: 'not-an-array',
            unplaced: [],
          },
          rows: [],
          stopsWithoutVolume: [],
        },
        cargoWeight: null,
        occupancy: null,
        weightConcentration: null,
      })

      expect(preview.cargoLayout).not.toBeNull()
    })
  })
})
