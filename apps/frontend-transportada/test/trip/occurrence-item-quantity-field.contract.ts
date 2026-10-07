/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 166 T301/T302/T303: o formulário de registro ganha o campo de quantidade + unidade por
 * item marcado (RF7), e o campo de item vira seleção única quando o tipo não aceita vários (RF8).
 * A lógica em si já é coberta por `occurrence-product-selection.contract.ts`
 * (`resolveOccurrenceItemQuantityFields`, `formatOccurrenceProductsLine`) — este contrato prova a
 * **fiação** na tela: primitivo certo (nunca `<select>`/`<input type=checkbox>` cru), chave de
 * locale existente nos dois idiomas, e o `Select` substituindo o `MultiSelect` quando o tipo é de
 * item único.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripLocalePt from '../../src/modules/trip/locales/trip.locale.json'
import tripLocaleEn from '../../src/modules/trip/locales/trip.en.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripOccurrences.component.tsx',
  import.meta.url,
)
const SOURCE = readFileSync(COMPONENT, 'utf8')
const QUANTITIES_SOURCE = readFileSync(
  new URL(
    '../../src/modules/trip/components/OccurrenceItemQuantities.component.tsx',
    import.meta.url,
  ),
  'utf8',
)
const PRODUCT_SELECT_SOURCE = readFileSync(
  new URL(
    '../../src/modules/trip/components/OccurrenceProductSelect.component.tsx',
    import.meta.url,
  ),
  'utf8',
)

describe('spec 166: campo de quantidade por item em TripOccurrences', () => {
  it('o número sai do primitivo Select para a unidade, nunca de um <select> cru', () => {
    for (const source of [SOURCE, QUANTITIES_SOURCE, PRODUCT_SELECT_SOURCE]) {
      expect(source).not.toMatch(/<select[\s>]/u)
    }
    /**
     * Spec 172 RF2: as opções deixaram de ser a lista fixa `OCCURRENCE_QUANTITY_UNITS` — nascem
     * por item, com a unidade comercial da nota daquele item na frente do par unit/box.
     */
    expect(QUANTITIES_SOURCE).toContain('resolveOccurrenceItemQuantityUnitOptions(commercialUnit)')
    expect(QUANTITIES_SOURCE).toContain('units.map')
  })

  it('o campo de item vira Select único quando o tipo não aceita vários (RF8)', () => {
    expect(SOURCE).toContain('allowsMultipleItems')
    expect(PRODUCT_SELECT_SOURCE).toMatch(/allowsMultipleItems\s*\?\s*\(\s*<MultiSelect/u)
  })

  it('trocar de tipo para item único substitui a seleção em vez de somar', () => {
    expect(SOURCE).toContain('handleOccurrenceTypeChange')
    expect(SOURCE).toContain('resolveItemsOnTypeChange')
  })

  it('o envio monta as quantidades alinhadas por resolveOccurrenceItemQuantityFields', () => {
    expect(SOURCE).toContain('resolveOccurrenceItemQuantityFields')
    expect(SOURCE).toContain('productQuantities')
    expect(SOURCE).toContain('productQuantityUnits')
  })

  /**
   * ⚠️ Era `formatOccurrenceProductsLine`, que devolvia uma **linha só** com os códigos separados
   * por vírgula. A revisão de 22/09 trocou isso por `describeOccurrenceItems`: cada item em sua
   * linha, com o **nome** do produto ao lado do código — código sozinho não diz o que foi avariado.
   */
  it('a leitura descreve item a item, com nome e contagem (P3)', () => {
    expect(SOURCE).toContain('describeOccurrenceItems')
    expect(SOURCE).toContain('occurrenceEntryItemName')
    expect(SOURCE).toContain('occurrenceEntryItemQuantity')
  })

  /** Spec 172 RF2/CA02: o campo nasce marcado na unidade daquele item na nota, não numa escolha. */
  it('a unidade nasce na unidade comercial daquele item na nota', () => {
    expect(QUANTITIES_SOURCE).toContain('resolveOccurrenceItemDefaultQuantityUnit')
    expect(QUANTITIES_SOURCE).toContain('commercialUnitOf')
  })

  it('os textos novos existem nos dois locales', () => {
    expect(tripLocalePt.occurrence.quantityLabel).toBeString()
    expect(tripLocalePt.occurrence.quantityUnitLabel).toBeString()
    expect(tripLocalePt.occurrence.quantityUnits.box).toBeString()
    expect(tripLocalePt.occurrence.quantityUnits.unit).toBeString()
    expect(tripLocalePt.occurrence.singleItemHint).toBeString()
    expect(tripLocaleEn.occurrence.quantityLabel).toBeString()
    expect(tripLocaleEn.occurrence.quantityUnits.box).toBeString()
  })
})
