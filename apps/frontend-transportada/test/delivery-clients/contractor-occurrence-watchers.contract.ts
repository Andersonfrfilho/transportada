/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 267 (T4.2, RF2): a ficha da contratante ganha a lista própria de responsáveis, logo depois dos contatos. O painel é
 * o autocontido do módulo da conversa, no escopo da contratante; a ficha só decide quando mostrá-lo (`settings.manage`).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const FICHA = 'src/modules/delivery-clients/components/ContractorFicha.component.tsx'
const SECTION = 'src/modules/delivery-clients/components/ContractorOccurrenceWatchers.component.tsx'

describe('a lista própria de responsáveis na ficha da contratante (spec 267 RF2)', () => {
  test('a seção vem logo depois dos contatos e só para quem gerencia', () => {
    const ficha = readFileSync(FICHA, 'utf8')

    expect(ficha).toContain('<ContractorOccurrenceWatchers')
    expect(ficha.indexOf('<ContractorContactsPanel')).toBeLessThan(
      ficha.indexOf('<ContractorOccurrenceWatchers'),
    )
    expect(ficha.indexOf('<ContractorOccurrenceWatchers')).toBeLessThan(
      ficha.indexOf('<PreviewEmailPanel'),
    )
    expect(ficha).toMatch(/canManage \? <ContractorOccurrenceWatchers/u)
  })

  test('a seção usa o painel autocontido no escopo da contratante e diz que substitui a lista da empresa', () => {
    const section = readFileSync(SECTION, 'utf8')

    expect(section).toContain('OccurrenceWatchersPanel')
    expect(section).toContain("kind: 'contractor'")
    expect(section).toContain('contractorId')
    for (const file of [
      'src/modules/delivery-clients/locales/contractorDirectory.locale.json',
      'src/modules/delivery-clients/locales/contractorDirectory.en.locale.json',
    ]) {
      const locale = JSON.parse(readFileSync(file, 'utf8')) as {
        watchers?: { description?: string; title?: string }
      }
      expect(locale.watchers?.title).toBeString()
      expect(locale.watchers?.description).toBeString()
    }
    const portuguese = JSON.parse(
      readFileSync('src/modules/delivery-clients/locales/contractorDirectory.locale.json', 'utf8'),
    ) as { watchers: { title: string } }
    expect(portuguese.watchers.title).toContain('substitui a lista da empresa')
  })
})
