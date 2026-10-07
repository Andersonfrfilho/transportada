/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceTypeMinimums } from '@/modules/trip/components/OccurrenceTypeMinimums.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import { shouldHintAllItemsRule } from '@/modules/trip/shared/occurrenceItemsMinimumHint.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'

const HINT = 'Sem mínimo, o motorista marca todos os produtos da nota.'

function buildType(overrides: Partial<OccurrenceType>): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    declaredAmountMode: 'optional',
    declaredAmountScope: 'item',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMinimumCount: null,
    itemsMode: 'required',
    leavesDocumentBehind: false,
    name: 'Devolução',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

function render(type: OccurrenceType): string {
  return renderToStaticMarkup(
    <OccurrenceTypeMinimums
      disabled={false}
      hasPhotoMinimum={false}
      onEdit={() => undefined}
      type={type}
    />,
  )
}

describe('dica da regra "todos os itens" na aba Tipos (spec 247 T7.2b, N14)', () => {
  test('valor pago por linha + Produtos obrigatório + sem mínimo: a dica aparece, pt-BR', () => {
    expect(render(buildType({}))).toContain(HINT)
  })

  test('com mínimo definido, sem valor pago, valor da ocorrência ou Produtos opcional: sem dica', () => {
    const quiet: readonly Partial<OccurrenceType>[] = [
      { itemsMinimumCount: 2 },
      { declaredAmountMode: 'off' },
      { declaredAmountScope: 'occurrence' },
      { itemsMode: 'optional' },
    ]
    for (const overrides of quiet) {
      expect(shouldHintAllItemsRule(buildType(overrides))).toBe(false)
      expect(render(buildType(overrides))).not.toContain(HINT)
    }
  })
})
