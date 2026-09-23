/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 173: a viagem diz **onde** há ocorrência aberta. Para saber isso era preciso abrir o diálogo
 * de cada nota — dez paradas, dez aberturas, para responder "algo deu errado nesta viagem?".
 *
 * ⚠️ O dado já chegava e a tela o ignorava: `openOccurrenceCase` por nota e `hasOpenOccurrence` por
 * parada vêm da API desde a spec 164 T15, e em 23/09 eles derrubaram a viagem inteira por serem
 * desconhecidos do guard. Aceitar não é usar.
 *
 * Campo **ausente** (API anterior ao marcador) não marca e não assume falso: ausência é ausência,
 * nunca "não tem ocorrência".
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  countDocumentsWithOpenOccurrence,
  hasOpenOccurrenceMarker,
} from '@/modules/trip/shared/occurrenceMarker.service'

const LISTA = new URL(
  '../../src/modules/trip/components/TripStopList.component.tsx',
  import.meta.url,
)

describe('marcador de ocorrência aberta (spec 173)', () => {
  it('marca a nota com tratativa aberta', () => {
    expect(hasOpenOccurrenceMarker({ openOccurrenceCase: true })).toBe(true)
    expect(hasOpenOccurrenceMarker({ openOccurrenceCase: false })).toBe(false)
  })

  /** API anterior ao campo: sem marcador, e sem afirmar que não há ocorrência. */
  it('campo ausente não marca', () => {
    expect(hasOpenOccurrenceMarker({})).toBe(false)
  })

  it('conta as notas marcadas da viagem', () => {
    const documentos = [
      { openOccurrenceCase: true },
      { openOccurrenceCase: false },
      { openOccurrenceCase: true },
      {},
    ]

    expect(countDocumentsWithOpenOccurrence(documentos)).toBe(2)
  })

  it('viagem sem nenhum campo conta zero', () => {
    expect(countDocumentsWithOpenOccurrence([{}, {}])).toBe(0)
  })

  it('a lista de paradas desenha o marcador na nota e na parada', () => {
    const lista = readFileSync(LISTA, 'utf8')

    expect(lista).toContain('hasOpenOccurrenceMarker')
    expect(lista).toContain('stop.hasOpenOccurrence')
    /** A contagem é plural: "1 nota com ocorrência" / "3 notas com ocorrência". */
    expect(lista).toContain("t('stops.openOccurrence'")
    expect(lista).toContain("t('stops.openOccurrenceDocument')")
  })
})
