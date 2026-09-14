/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveCargoComplement } from '@/modules/trip/shared/cargoComplement.service'
import {
  buildOverEarlierDeliveryRows,
  isOverEarlierDeliveryBox,
} from '@/modules/trip/shared/cargoOverEarlier.service'
import {
  buildCargoComplementSummary,
  buildCargoPrintSummary,
} from '@/modules/trip/shared/cargoPrintSummary.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const OVER_EARLIER = ['needsRehandling', 'overEarlierDelivery'] as const

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

function placedBox(
  overrides: Partial<{
    coversStops: readonly number[]
    documentId: string | null
    documentNumber: string | null
    label: string
    reasons: readonly string[]
    stopSequence: number
  }> = {},
) {
  return {
    documentId: 'doc-1',
    documentNumber: '101',
    label: 'Caixa A',
    reasons: [] as readonly string[],
    stopSequence: 5,
    ...overrides,
  }
}

function printableBox(complement: 'needsRehandling' | 'overEarlierDelivery' | null, xM: number) {
  return {
    complement,
    depthM: 0.5,
    isEstimated: false,
    isSplit: false,
    stopSequence: 2,
    widthM: 0.5,
    xM,
    yM: 0,
  }
}

/**
 * Spec 148 D5 (T3c, tela): a passada final põe a caixa que sobrou por cima de uma entrega que desce
 * antes (`overEarlierDelivery`, com `coversStops`). Quem descarrega precisa ver onde ela está, de qual
 * nota é, qual entrega ela cobre e em que parada ela sai do caminho.
 */
describe('trip cargo over earlier delivery contract (spec 148)', () => {
  it('lets overEarlierDelivery win over needsRehandling, which the box also carries', () => {
    expect(resolveCargoComplement({ reasons: OVER_EARLIER })).toBe('overEarlierDelivery')
    expect(resolveCargoComplement({ reasons: ['needsRehandling'] })).toBe('needsRehandling')
    expect(isOverEarlierDeliveryBox({ reasons: OVER_EARLIER })).toBe(true)
    expect(isOverEarlierDeliveryBox({ reasons: ['needsRehandling'] })).toBe(false)
  })

  describe('buildOverEarlierDeliveryRows', () => {
    it('lists box, note, delivery covered and the stop where it leaves the way', () => {
      const rows = buildOverEarlierDeliveryRows([
        placedBox(),
        placedBox({ coversStops: [3, 1], reasons: OVER_EARLIER }),
        placedBox({ coversStops: [1, 3], reasons: OVER_EARLIER }),
        placedBox({
          coversStops: [7],
          documentId: 'doc-2',
          documentNumber: '202',
          label: 'Caixa B',
          reasons: OVER_EARLIER,
          stopSequence: 9,
        }),
      ])

      expect(rows).toEqual([
        {
          boxes: 2,
          clearAtStop: 1,
          coversStops: [1, 3],
          documentId: 'doc-1',
          documentNumber: '101',
          label: 'Caixa A',
          stopSequence: 5,
        },
        {
          boxes: 1,
          clearAtStop: 7,
          coversStops: [7],
          documentId: 'doc-2',
          documentNumber: '202',
          label: 'Caixa B',
          stopSequence: 9,
        },
      ])
    })

    /** Planta anterior à 148 não traz `coversStops`: a linha aparece, sem inventar a parada. */
    it('keeps the box without coversStops, with no stop to clear at', () => {
      const rows = buildOverEarlierDeliveryRows([
        placedBox({ documentId: null, documentNumber: null, reasons: OVER_EARLIER }),
      ])

      expect(rows).toEqual([
        {
          boxes: 1,
          clearAtStop: null,
          coversStops: [],
          documentId: null,
          documentNumber: null,
          label: 'Caixa A',
          stopSequence: 5,
        },
      ])
    })
  })

  /**
   * ⚠️ A nota com caixa fora do lugar é carga dividida: o conferente não pode dar a entrega por
   * encerrada deixando parte dela no caminhão. Ela entra na coluna "Divididas" e no complemento, e
   * fica fora da faixa da parada, como a dividida e a do complemento.
   */
  it('counts the box over an earlier delivery as split and complement, outside the stop span', () => {
    const [row] = buildCargoPrintSummary([
      printableBox(null, 1),
      printableBox('overEarlierDelivery', 4),
    ])

    expect(row).toMatchObject({ boxes: 2, complement: 1, fromM: 1, split: 1, toM: 1.5 })
    expect(buildCargoComplementSummary([{ reasons: OVER_EARLIER }])).toMatchObject({
      complement: 1,
      recommended: 0,
    })
  })

  it('draws its own mark, solid and not copper, apart from the complement dash', () => {
    const component = readApplicationFile('src/components/ui/cargo-isometric.tsx')
    const css = readApplicationFile('src/components/ui/cargo-isometric.module.css')
    const mark = css.match(/\.faceOverEarlier \{([^}]*)\}/)?.[1] ?? ''

    expect(component).toContain("box.complement === 'overEarlierDelivery'")
    expect(component).toContain('styles.faceOverEarlier')
    expect(mark).toContain('stroke:')
    expect(mark).not.toContain('var(--color-copper)')
    expect(mark).not.toContain('var(--color-alert)')
    expect(mark).not.toContain('stroke-dasharray')
  })

  it('names the mark in the legend, lists the boxes and keys unplaced rows by note', () => {
    const layers = readApplicationFile('src/modules/trip/components/TripCargoLayers.component.tsx')
    const list = readApplicationFile(
      'src/modules/trip/components/TripCargoOverEarlierList.component.tsx',
    )

    expect(layers).toContain('<CargoLegendSample mark="overEarlier" />')
    expect(layers).toContain("t('cargoLayers.legend.overEarlier')")
    expect(layers).toContain('<TripCargoOverEarlierList')
    expect(layers).toContain('entry.documentId')
    expect(list).toContain("t('cargoLayers.overEarlier.title'")
    expect(list).toContain("t('cargoLayers.overEarlier.row'")
    expect(list).toContain("t('cargoLayers.overEarlier.rowWithoutStop'")
  })

  it('carries every text in both locales', () => {
    for (const locale of [trip, tripEn]) {
      const texts = locale.cargoLayers as unknown as {
        legend: Record<string, string>
        overEarlier: Record<string, string>
      }
      expect(texts.legend.overEarlier).toBeTruthy()
      expect(texts.overEarlier.title).toContain('{{count}}')
      expect(texts.overEarlier.row).toContain('{{clearAt}}')
      expect(texts.overEarlier.row).toContain('{{covers}}')
      expect(texts.overEarlier.row).toContain('{{note}}')
      expect(texts.overEarlier.row_other).toContain('{{count}}')
      expect(texts.overEarlier.rowWithoutStop).toBeTruthy()
    }
    const pt = trip.cargoLayers as unknown as { overEarlier: Record<string, string> }
    expect(pt.overEarlier.title).toContain('por cima')
  })

  it('accepts coversStops on the box and documentId on the unplaced row, untouched', () => {
    const preview = createTripResponseAdapters().tripCargoPreviewFromApi({
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
          layers: [{ boxes: [{ coversStops: [1], reasons: OVER_EARLIER }], heightM: 1, index: 0 }],
          source: 'measured',
          unplaced: [{ count: 2, documentId: 'doc-9', label: 'NF 9', reason: 'bedFull' }],
        },
        rows: [],
        stopsWithoutVolume: [],
      },
      cargoWeight: null,
      occupancy: null,
      weightConcentration: null,
    })

    expect(preview.cargoLayout?.placement?.layers[0]?.boxes[0]?.coversStops).toEqual([1])
    expect(preview.cargoLayout?.placement?.unplaced[0]?.documentId).toBe('doc-9')
  })
})
