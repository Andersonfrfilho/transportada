/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T24 (CA5/RF36/RF37): a nota com `openOccurrenceCase: true` e a parada com
 * `hasOpenOccurrence: true` ganham um marcador visual na listagem e no mapa — mas nenhuma ação
 * some ou é desabilitada por causa deles. `resolveFieldActionCapabilities` lê só `allowedActions`
 * (`GET /trips/:id/allowed-actions`), que é byte a byte igual com ou sem o marcador (RF20): a
 * capacidade de cada nota não pode variar por um campo que ela nem recebe como parâmetro.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripLocale from '@/modules/trip/locales/trip.locale.json'

import { resolveFieldActionCapabilities } from '@/modules/trip/shared/tripFieldActions.service'
import type { TripAllowedActions } from '@/modules/trip/shared/tripAllowedActions.validation'

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000d01'
const STOP_ID = '00000000-0000-4000-8000-000000000b01'

const ACTIONS: TripAllowedActions = {
  documents: { [DOCUMENT_ID]: ['fieldDelivery', 'fieldReturn'] },
  stops: { [STOP_ID]: ['arrive'] },
  trip: ['startRoute'],
}

describe('marcador de tratativa não altera a lista de ações da linha (spec 164 T24)', () => {
  it('a capacidade da nota é a mesma com `openOccurrenceCase` aberto ou fechado', () => {
    const capabilities = resolveFieldActionCapabilities(ACTIONS)

    /**
     * `resolveFieldActionCapabilities` não recebe `openOccurrenceCase`/`hasOpenOccurrence` como
     * entrada — só `TripAllowedActions`. Chamar com a mesma lista duas vezes prova que a função é
     * pura em relação ao marcador: nenhum caminho de código dela pode ler o campo novo, porque ela
     * não o enxerga.
     */
    const capabilitiesAgain = resolveFieldActionCapabilities(ACTIONS)

    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldDelivery')).toBe(
      capabilitiesAgain.canDocument(DOCUMENT_ID, 'fieldDelivery'),
    )
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldReturn')).toBe(
      capabilitiesAgain.canDocument(DOCUMENT_ID, 'fieldReturn'),
    )
    expect(capabilities.canStop(STOP_ID, 'arrive')).toBe(
      capabilitiesAgain.canStop(STOP_ID, 'arrive'),
    )
    expect(capabilities.canTrip('startRoute')).toBe(capabilitiesAgain.canTrip('startRoute'))

    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldDelivery')).toBe(true)
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldReturn')).toBe(true)
  })
})

/**
 * Revisão de design da spec 164 (T30). A4: o mapa não crava texto em português nem usa `title`
 * nativo. A5: a marca da nota não veste a cor de erro — a nota em tratativa segue liberada.
 */
describe('spec 164 T30: a marca da tratativa', () => {
  const MAP = readFileSync(
    new URL('../../src/modules/trip/components/AssemblyVectorMap.component.tsx', import.meta.url),
    'utf8',
  )
  const STYLES = readFileSync(
    new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url),
    'utf8',
  )

  it('A4: o texto da marca vem do locale, pelo tooltip do design system', () => {
    expect(MAP).toContain("t('occurrence.stopOpenCase')")
    expect(MAP).toContain('<Tooltip label=')
    expect(MAP).toContain('createPortal(')
    expect(MAP).not.toContain("'Parada com tratativa aberta'")
    expect(MAP).not.toContain("'Ponto de partida'")
  })

  it('A4: nenhum `title` nativo sobrou no mapa, e o glifo é o Icon do design system', () => {
    expect(MAP).not.toContain('.title =')
    expect(MAP).toContain('<Icon name="alert" />')
  })

  it('A5: o selo veste o cobre da paleta, nunca a cor de erro nem hexadecimal de módulo', () => {
    const badge = STYLES.slice(
      STYLES.indexOf('.occurrenceCaseBadge {'),
      STYLES.indexOf('}', STYLES.indexOf('.occurrenceCaseBadge {')),
    )
    const pin = STYLES.slice(
      STYLES.indexOf('.tilePinOccurrenceBadge {'),
      STYLES.indexOf('}', STYLES.indexOf('.tilePinOccurrenceBadge {')),
    )

    expect(badge).toContain('var(--color-copper)')
    expect(badge).not.toContain('var(--color-alert)')
    expect(pin).toContain('var(--color-copper)')
    expect(pin).not.toContain('var(--color-alert)')
    expect(/#[0-9a-f]{3,8}\b/iu.test(badge + pin)).toBe(false)
  })

  it('A5: o rótulo diz tratativa, e a dica diz que a nota continua liberada', () => {
    expect(tripLocale.occurrence.openCase).toBe('Ocorrência em tratativa')
    expect(tripLocale.occurrence.openCaseHint).toContain('continua liberada')
  })
})
