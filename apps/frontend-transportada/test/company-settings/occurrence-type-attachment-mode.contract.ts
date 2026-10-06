/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import companySettingsEn from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import companySettingsPt from '../../src/modules/company-settings/locales/companySettings.locale.json'
import { OCCURRENCE_ATTACHMENT_MODES } from '../../src/modules/trip/shared/occurrence.constant'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import {
  readOccurrenceTypeCreateSource,
  readOccurrenceTypePanelSource,
  readOccurrenceTypeUpdateSource,
} from './occurrenceTypePanelSource.helper'

const PANEL = readOccurrenceTypePanelSource()
const CREATE_BUILDER = readOccurrenceTypeCreateSource()
const UPDATE_BUILDER = readOccurrenceTypeUpdateSource()
const CLIENT = readFileSync(
  new URL('../../src/modules/trip/shared/tripClient.service.ts', import.meta.url),
  'utf8',
)

function rawType(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: 'type-1',
    name: 'Recusa total',
    notifies: false,
    stage: 'delivery',
    ...overrides,
  }
}

/**
 * Spec 179 T401 (CA01, RF1, RF10): o editor de tipos marca a exigência de comprovante, no
 * vocabulário que o produto já usa (`off`/`optional`/`required`). A marca vale só para tipo de rua —
 * o motorista é quem tira a foto, e o painel não oferece o que a tela não cumpre.
 */
describe('a exigência de comprovante no editor de tipos (spec 179 T401)', () => {
  const adapters = createTripResponseAdapters()

  it('o vocabulário é o do comprovante de entrega', () => {
    expect([...OCCURRENCE_ATTACHMENT_MODES]).toEqual(['off', 'optional', 'required'])
  })

  it('lê a marca que a API devolve', () => {
    expect(adapters.occurrenceTypeFromApi(rawType({ attachmentMode: 'required' }))).toMatchObject({
      attachmentMode: 'required',
    })
  })

  /** CA07/CA08: tipo sem a marca (ou API anterior a ela) continua como sempre — sem foto exigida. */
  it('ausente vira off', () => {
    expect(adapters.occurrenceTypeFromApi(rawType())).toMatchObject({ attachmentMode: 'off' })
  })

  it('valor fora do vocabulário reprova a resposta, não vira marca inventada', () => {
    expect(() => adapters.occurrenceTypeFromApi(rawType({ attachmentMode: 'sempre' }))).toThrow()
  })

  it('o cliente manda a marca ao salvar', () => {
    const area = CLIENT.slice(
      CLIENT.indexOf('async saveOccurrenceType'),
      CLIENT.indexOf('async readDeliveryProofSettings'),
    )
    expect(area).toContain('attachmentMode: input.attachmentMode')
  })

  it('o painel oferece a foto só onde o momento a cobra, pelo seletor de três estados', () => {
    expect(PANEL).toContain('readRequirementFieldsOfMoments')
    expect(PANEL).toContain('OccurrenceRequirementModeSelect')
    expect(PANEL).not.toContain('<select')
  })

  /** Toda gravação leva a marca que o tipo já tinha — mexer no aviso não pode desligar a foto. */
  it('toda gravação do painel leva attachmentMode', () => {
    /** Nenhum `onSave({...})` escrito à mão no painel: toda gravação sai de um dos dois montadores. */
    expect(PANEL.split('onSave({').length - 1).toBe(0)
    for (const builder of [UPDATE_BUILDER, CREATE_BUILDER]) {
      expect(builder).toContain('attachmentMode')
    }
  })

  it('os textos existem em pt-BR e en', () => {
    for (const locale of [companySettingsPt, companySettingsEn]) {
      const catalog = locale.occurrenceTypeCatalog
      expect(catalog.attachmentMode).toBeString()
      expect(catalog.attachmentModeHint).toBeString()
      expect(catalog.attachmentModeOff).toBeString()
      expect(catalog.attachmentModeOptional).toBeString()
      expect(catalog.attachmentModeRequired).toBeString()
    }
    expect(companySettingsPt.occurrenceTypeCatalog.attachmentModeRequired.toLowerCase()).toContain(
      'obrigatória',
    )
  })
})
