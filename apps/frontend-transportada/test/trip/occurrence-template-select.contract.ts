/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import {
  buildOccurrenceEmailTemplateOptions,
  OCCURRENCE_TEMPLATE_NONE,
} from '../../src/modules/trip/shared/occurrenceTemplate.service'

const PANEL = new URL(
  '../../src/modules/trip/components/TripOccurrenceNotifications.component.tsx',
  import.meta.url,
)
const STYLES = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)
const CLIENT = new URL('../../src/modules/trip/shared/tripClient.service.ts', import.meta.url)

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
 * O texto do aviso mora **só** no módulo de notificações: o formulário do tipo de ocorrência não
 * digita assunto nem corpo — ele **seleciona** o modelo pela chave, e é a chave que vai gravada.
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
    expect(trip.occurrence.emailTemplateNone).toBeString()
    expect(tripEn.occurrence.emailTemplateNone).toBeString()
  })

  /** O valor da opção — e o que se grava — é a **chave** do template, nunca o id da variante. */
  it('grava a chave do template, não o id da variante', () => {
    const chosen = buildOccurrenceEmailTemplateOptions([buildTemplate({})])[0]

    expect(chosen?.key).toBe('trip.occurrence')
    expect(source).toInclude('emailTemplateKey')
    expect(source).toInclude('option.key')

    const client = readFileSync(CLIENT, 'utf8')
    expect(client).toInclude('emailTemplateKey: input.emailTemplateKey')
  })

  /** Assunto e corpo saíram do formulário: o texto é assunto do editor de templates. */
  it('não tem mais campos de assunto e corpo nem aviso de marcadores', () => {
    expect(source).not.toInclude("t('occurrence.emailSubject')")
    expect(source).not.toInclude("t('occurrence.emailBody')")
    expect(source).not.toInclude('findUnknownTemplatePlaceholders')
    expect(source).not.toInclude('OCCURRENCE_TEMPLATE_PLACEHOLDERS')
  })

  /** Só template de e-mail ativo vira opção — canal e versão desativada ficam de fora. */
  it('filtra canal e template desativado', () => {
    const options = buildOccurrenceEmailTemplateOptions([
      buildTemplate({}),
      buildTemplate({ channel: 'push', id: 'push-1', key: 'push.key' }),
      buildTemplate({ active: false, id: 'inactive-1', key: 'inactive.key' }),
    ])

    expect(options.map((option) => option.key)).toEqual(['trip.occurrence'])
    expect(OCCURRENCE_TEMPLATE_NONE).toBe('')
  })

  /** A linha do tipo mostra o modelo escolhido; a linha legada mostra o assunto com a marca. */
  it('nomeia o modelo na linha, e marca o legado', () => {
    expect(source).toInclude('legacyTemplate')
    expect(trip.occurrence.legacyTemplate).toInclude('legado')
    expect(tripEn.occurrence.legacyTemplate).toBeString()
  })

  /** O atalho leva ao editor de templates do módulo de notificações, pela navegação do shell. */
  it('tem o atalho para editar os modelos', () => {
    expect(source).toInclude("t('occurrence.editTemplates')")
    expect(source).toInclude('NOTIFICATION_SETTINGS_HREF')
    expect(trip.occurrence.editTemplates).toBeString()
    expect(tripEn.occurrence.editTemplates).toBeString()
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
