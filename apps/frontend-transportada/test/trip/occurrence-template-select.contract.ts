/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import {
  buildOccurrenceEmailTemplateOptions,
  findUnknownTemplatePlaceholders,
  OCCURRENCE_TEMPLATE_FROM_SCRATCH,
} from '../../src/modules/trip/shared/occurrenceTemplate.service'

const PANEL = new URL(
  '../../src/modules/trip/components/TripOccurrenceNotifications.component.tsx',
  import.meta.url,
)
const STYLES = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)

function buildTemplate(overrides: Partial<Record<string, unknown>>) {
  return {
    active: true,
    body: 'Olá {{razaoSocial}}',
    channel: 'email',
    id: 'template-1',
    key: 'trip.occurrence',
    locale: 'pt-BR',
    subject: 'Ocorrência {{numeroNota}}',
    version: 1,
    ...overrides,
  } as never
}

/**
 * O formulário de tipo de ocorrência: campos nos tokens do design system, e o modelo de e-mail
 * escolhido por select — alimentado pelos templates do módulo de notificações.
 */
describe('modelo de e-mail do tipo de ocorrência', () => {
  const source = readFileSync(PANEL, 'utf8')
  const styles = readFileSync(STYLES, 'utf8')

  /** Nenhum input cru: altura, padding e fonte vêm dos tokens (docs/frontend/fields.md). */
  it('estiliza os campos do formulário pelos tokens', () => {
    const rule = /\.occurrenceForm input,\s*\.occurrenceForm textarea \{([^}]*)\}/.exec(styles)?.[1]

    expect(rule).toBeString()
    expect(rule).toInclude('min-height: var(--field-height)')
    expect(rule).toInclude('padding: var(--field-padding)')
    expect(rule).toInclude('font-size: var(--field-font-size)')
  })

  /** O select existe, vem do design system e é alimentado pela consulta de templates. */
  it('oferece o select de modelo alimentado pela consulta do módulo de notificações', () => {
    expect(source).toInclude('useEmailTemplatesQuery')
    expect(source).toInclude("t('occurrence.emailTemplate')")
    expect(trip.occurrence.emailTemplate).toBeString()
    expect(tripEn.occurrence.emailTemplate).toBeString()
    expect(trip.occurrence.emailTemplateFromScratch).toBeString()
    expect(tripEn.occurrence.emailTemplateFromScratch).toBeString()
  })

  /** Escolher um modelo preenche assunto e corpo; os campos continuam editáveis. */
  it('preenche assunto e corpo ao escolher um modelo', () => {
    const chosen = buildOccurrenceEmailTemplateOptions([buildTemplate({})])[0]

    expect(chosen?.subject).toBe('Ocorrência {{numeroNota}}')
    expect(chosen?.body).toBe('Olá {{razaoSocial}}')
    expect(source).toInclude('setEmailSubject(chosen.subject)')
    expect(source).toInclude('setEmailBody(chosen.body)')
  })

  /** Só template de e-mail ativo vira opção — canal e versão desativada ficam de fora. */
  it('filtra canal e template desativado', () => {
    const options = buildOccurrenceEmailTemplateOptions([
      buildTemplate({}),
      buildTemplate({ channel: 'push', id: 'push-1' }),
      buildTemplate({ active: false, id: 'inactive-1' }),
    ])

    expect(options.map((option) => option.id)).toEqual(['template-1'])
    expect(OCCURRENCE_TEMPLATE_FROM_SCRATCH).toBe('')
  })

  /**
   * Marcador do template fora de `OCCURRENCE_TEMPLATE_PLACEHOLDERS` é avisado ao lado do campo:
   * o salvar já recusa, e o operador não pode descobrir isso só no erro.
   */
  it('avisa marcador fora da lista antes do salvar', () => {
    expect(findUnknownTemplatePlaceholders('Fatura {{invoiceNumber}} de {{razaoSocial}}')).toEqual([
      'invoiceNumber',
    ])
    expect(findUnknownTemplatePlaceholders('{{numeroNota}} {{motorista}}')).toEqual([])
    expect(source).toInclude('findUnknownTemplatePlaceholders')
    expect(source).toInclude("t('occurrence.unknownPlaceholders'")
    expect(trip.occurrence.unknownPlaceholders).toInclude('{{list}}')
    expect(tripEn.occurrence.unknownPlaceholders).toInclude('{{list}}')
  })
})

/** A consulta devolve uma linha por variante da mesma chave — o select mostra cada modelo uma vez. */
describe('as opções são deduplicadas por chave', () => {
  it('a mesma chave em quatro variantes vira uma opção', () => {
    const template = {
      active: true,
      body: 'corpo',
      channel: 'email',
      id: 'x',
      key: 'billing.invoice-due',
      subject: 'Fatura {{invoiceNumber}}',
    }
    const options = buildOccurrenceEmailTemplateOptions([
      template,
      { ...template, id: 'y' },
      { ...template, id: 'z' },
      { ...template, id: 'w' },
    ] as never)
    expect(options).toHaveLength(1)
  })
})
