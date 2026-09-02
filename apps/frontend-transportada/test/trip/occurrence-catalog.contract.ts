/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  separationOccurrenceTypes,
  TRIP_OCCURRENCE_TYPES,
} from '../../src/modules/trip/shared/occurrence.constant'

/**
 * Spec 079 T020. O gêmeo de `api-transportada/test/trip-occurrence/catalog.contract.ts`: os dois
 * restatam a mesma lista, porque o bundle não carrega código da API. Uma lista de sete itens se
 * confere de olho — é por isso que aqui a cópia é aceitável, ao contrário de um parser.
 */
describe('catálogo de ocorrência no bundle (spec 079 T020)', () => {
  it('os sete tipos, na mesma ordem da API', () => {
    expect(TRIP_OCCURRENCE_TYPES.map((entry) => entry.type)).toEqual([
      'item_faltante',
      'item_avariado',
      'divergencia_quantidade',
      'recusa_total',
      'recusa_parcial',
      'avaria_transporte',
      'destinatario_ausente',
    ])
  })

  /**
   * ⚠️ A tela do escritório oferece **só** os de separação. A ocorrência de rua é `trip.report`, e
   * um botão que a oferece aqui sempre responde 403 — pior que não existir, porque parece capaz.
   */
  it('a tela do escritório não oferece ocorrência de rua', () => {
    expect(separationOccurrenceTypes()).toEqual([
      'item_faltante',
      'item_avariado',
      'divergencia_quantidade',
    ])
  })

  /** Tipo sem rótulo aparece como chave crua na tela — e é o que acontece quando um é acrescentado. */
  it('todo tipo tem rótulo em português', () => {
    for (const entry of TRIP_OCCURRENCE_TYPES) {
      expect(trip.occurrence.type).toHaveProperty(entry.type)
    }
  })

  /**
   * ⚠️ **A ocorrência só anota.** Invalidar a chave da viagem depois de registrá-la daria a
   * impressão de que ela muda o estado da nota — e a decisão registrada na T020 é que não muda: sem
   * tela de resolução, bloquear deixaria a nota travada num estado que ninguém sabe destravar.
   */
  it('registrar ocorrência não invalida a viagem', () => {
    const source = readFileSync(
      new URL('../../src/modules/trip/hooks/useTripWorkspace.hook.ts', import.meta.url),
      'utf8',
    )
    const inicio = source.indexOf('registerOccurrenceMutation = useMutation')
    const trecho = source.slice(inicio, source.indexOf('})', source.indexOf('onSuccess', inicio)))

    expect(trecho).toInclude("'occurrences'")
    expect(trecho).not.toInclude('MUTATION_EFFECT')
  })

  /** Componente órfão não é entrega: o painel monta as ocorrências. */
  it('está montado no painel da nota', () => {
    const detail = readFileSync(
      new URL('../../src/modules/trip/components/TripDetail.component.tsx', import.meta.url),
      'utf8',
    )

    expect(detail).toMatch(/<TripOccurrences[\s/>]/u)
  })
})
