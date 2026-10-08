/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import { OccurrenceTypeIcon } from '@/modules/driver-trip/components/OccurrenceTypeIcon.component'
import { OCCURRENCE_TYPE_ICON_NAMES } from '@/modules/driver-trip/shared/occurrenceTypeIcon.constant'

/**
 * Spec 255 (T3.3, RF5, CA1): o chip do tipo mostra o ícone escolhido antes do nome; sem ícone (chave
 * ausente, nula ou fora do catálogo) o chip é exatamente o de antes. Renderização estática, sem DOM.
 */
function source(path: string): string {
  return readFileSync(new URL(`../../src/modules/driver-trip/${path}`, import.meta.url), 'utf8')
}

describe('ícone do chip do tipo de ocorrência (spec 255 T3.3)', () => {
  test('nome do catálogo desenha um svg decorativo', () => {
    const html = renderToStaticMarkup(<OccurrenceTypeIcon iconName="truck" />)

    expect(html).toStartWith('<svg')
    expect(html).toContain('aria-hidden="true"')
  })

  test.each([[undefined], [null], ['desconhecido'], ['sun'], ['']])(
    'sem ícone (%p) não renderiza nada: markup do chip igual ao de antes',
    (iconName) => {
      expect(renderToStaticMarkup(<OccurrenceTypeIcon iconName={iconName} />)).toBe('')
    },
  )

  test('a lista do motorista é a do catálogo da API', () => {
    const api = readFileSync(
      new URL('../../../api-transportada/src/shared/trip-occurrence.constant.ts', import.meta.url),
      'utf8',
    )
    const block = /OCCURRENCE_TYPE_ICON_NAMES = \[([^\]]+)\]/u.exec(api)?.[1] ?? ''
    const apiNames = [...block.matchAll(/'([^']+)'/gu)].map((match) => match[1] ?? '')

    const driverNames: readonly string[] = OCCURRENCE_TYPE_ICON_NAMES

    expect([...driverNames]).toEqual(apiNames)
  })

  test('o chip põe o ícone antes do nome e não muda o nome acessível', () => {
    const form = source('components/DriverOccurrenceRegistrationForm.component.tsx')
    const chipStart = form.indexOf('key={type.id}')
    const chip = form.slice(chipStart, form.indexOf('</Button>', chipStart))

    expect(chip).toContain('<OccurrenceTypeIcon iconName={type.iconName} />')
    expect(chip.indexOf('<OccurrenceTypeIcon')).toBeLessThan(chip.indexOf('{type.name}'))
    expect(chip).not.toContain('aria-label')
  })
})
