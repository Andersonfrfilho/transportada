/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it, test } from 'bun:test'

import { TRIP_OCCURRENCE_STAGE } from '@/modules/trip/shared/occurrence.constant'

/**
 * Spec 185 T6.1 (D2, RF6): o catálogo de ocorrências ganha "A viagem segue sem a nota" — só para
 * tipos de separação (CHECK do banco recusa em `delivery`), com dica curta explicando o efeito.
 */
const PANEL = new URL(
  '../../src/modules/company-settings/components/OccurrenceTypeCatalogPanel.component.tsx',
  import.meta.url,
)

describe('a caixa "a viagem segue sem a nota" só em tipo de separação (spec 185 D2/RF6)', () => {
  const panel = readFileSync(PANEL, 'utf8')

  it('usa o Checkbox do design system, nunca <input type=checkbox> cru', () => {
    const checkboxCount = panel.split('<Checkbox').length - 1
    expect(checkboxCount).toBeGreaterThan(0)
    expect(panel).not.toContain('type="checkbox"')
  })

  it('a caixa referencia leavesDocumentBehind e o estágio de separação', () => {
    expect(panel).toContain('leavesDocumentBehind')
    expect(panel).toContain('TRIP_OCCURRENCE_STAGE.separation')
  })

  it('tem uma dica curta ao lado — Tooltip do design system, não title nativo', () => {
    expect(panel).toContain('@/components/ui/tooltip')
    expect(panel).toContain('<Tooltip')
  })

  it('o grupo continua fixo — separation é galpão, delivery é rua', () => {
    expect(Object.values(TRIP_OCCURRENCE_STAGE).toSorted()).toEqual(['delivery', 'separation'])
  })
})

test('saveOccurrenceType manda leavesDocumentBehind ao servidor', () => {
  const cliente = readFileSync(
    new URL('../../src/modules/trip/shared/tripClient.service.ts', import.meta.url),
    'utf8',
  )
  const area = cliente.slice(
    cliente.indexOf('async saveOccurrenceType'),
    cliente.indexOf('async readDeliveryProofSettings'),
  )
  expect(area).toContain('leavesDocumentBehind')
})
