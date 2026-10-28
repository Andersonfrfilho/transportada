/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T3b (RF9): "Envio ao cliente" no cadastro do tipo. Desligado de fábrica; a edição manda só o que mudou;
 * o rótulo e cada opção existem nos dois idiomas; a resposta da API com valor fora da lista é recusada. Spec 281 T3b
 * (RF8): o mesmo para o canal com o cliente (`clientChannel`).
 */
import { describe, expect, it } from 'bun:test'

import settingsEn from '@/modules/company-settings/locales/companySettings.en.locale.json'
import settingsPt from '@/modules/company-settings/locales/companySettings.locale.json'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import {
  CLIENT_CHANNELS,
  CLIENT_EMAIL_SEND_MODES,
  CLIENT_EMAIL_TYPES,
} from '@/modules/trip/shared/occurrenceContractorReply.constant'
import { hasValidContractorReplyTypeFields } from '@/modules/trip/shared/occurrenceContractorReply.validation'
import { buildOccurrenceTypeUpdate } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

const TYPE = {
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'off',
  clientEmailType: 'off',
  emailTemplateKey: null,
  flow: 'document',
  id: 'type-1',
  leavesDocumentBehind: false,
  name: 'Prorrogação do boleto',
  notifies: false,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
} as unknown as OccurrenceType

describe('envio ao cliente no tipo da ocorrência (spec 279 RF9)', () => {
  it('o vocabulário começa em "off" e traz os tipos de e-mail do cliente', () => {
    expect(CLIENT_EMAIL_TYPES).toEqual(['off', 'boleto', 'invoice', 'finance', 'general'])
  })

  it('a edição manda o tipo escolhido', () => {
    expect(buildOccurrenceTypeUpdate(TYPE, { clientEmailType: 'boleto' })).toMatchObject({
      clientEmailType: 'boleto',
      occurrenceTypeId: 'type-1',
    })
  })

  it('a edição de outro campo não mexe no envio ao cliente', () => {
    expect(buildOccurrenceTypeUpdate(TYPE, { name: 'Boleto' })).not.toHaveProperty(
      'clientEmailType',
    )
  })

  it('o rótulo, a dica e cada opção existem nos dois idiomas', () => {
    for (const locale of [settingsPt, settingsEn]) {
      expect(locale.occurrenceTypeCatalog.clientEmailType).toBeString()
      expect(locale.occurrenceTypeCatalog.clientEmailTypeHint).toBeString()
      for (const type of CLIENT_EMAIL_TYPES) {
        expect(locale.occurrenceTypeCatalog.clientEmailTypeOptions[type]).toBeString()
      }
    }
  })
})

describe('envio automático ao cliente no tipo da ocorrência (spec 279 RF10)', () => {
  it('o vocabulário é "manual" e "automatic"', () => {
    expect(CLIENT_EMAIL_SEND_MODES).toEqual(['manual', 'automatic'])
  })

  it('a edição manda o modo escolhido e a de outro campo não mexe nele', () => {
    expect(
      buildOccurrenceTypeUpdate(
        { ...TYPE, clientEmailSendMode: 'manual', clientEmailType: 'boleto' },
        { clientEmailSendMode: 'automatic' },
      ),
    ).toMatchObject({ clientEmailSendMode: 'automatic', occurrenceTypeId: 'type-1' })
    expect(buildOccurrenceTypeUpdate(TYPE, { name: 'Boleto' })).not.toHaveProperty(
      'clientEmailSendMode',
    )
  })

  it('o rótulo, a dica e cada opção existem nos dois idiomas', () => {
    for (const locale of [settingsPt, settingsEn]) {
      expect(locale.occurrenceTypeCatalog.clientEmailSendMode).toBeString()
      expect(locale.occurrenceTypeCatalog.clientEmailSendModeHint).toBeString()
      for (const mode of CLIENT_EMAIL_SEND_MODES) {
        expect(locale.occurrenceTypeCatalog.clientEmailSendModeOptions[mode]).toBeString()
      }
    }
  })
})

describe('canal com o cliente no tipo da ocorrência (spec 281 RF8)', () => {
  it('o vocabulário é o da API: "off", "email", "whatsapp" e "both"', () => {
    expect(CLIENT_CHANNELS).toEqual(['off', 'email', 'whatsapp', 'both'])
  })

  it('a resposta aceita o canal ausente (API anterior) ou da lista, e recusa o resto', () => {
    expect(hasValidContractorReplyTypeFields({})).toBe(true)
    expect(hasValidContractorReplyTypeFields({ clientChannel: 'whatsapp' })).toBe(true)
    expect(hasValidContractorReplyTypeFields({ clientChannel: 'sms' })).toBe(false)
  })

  it('a edição manda o canal escolhido e a de outro campo não mexe nele', () => {
    expect(
      buildOccurrenceTypeUpdate({ ...TYPE, clientChannel: 'email' }, { clientChannel: 'both' }),
    ).toMatchObject({ clientChannel: 'both', occurrenceTypeId: 'type-1' })
    expect(buildOccurrenceTypeUpdate(TYPE, { name: 'Boleto' })).not.toHaveProperty('clientChannel')
  })

  it('o rótulo, a dica e cada opção existem nos dois idiomas', () => {
    for (const locale of [settingsPt, settingsEn]) {
      expect(locale.occurrenceTypeCatalog.clientChannel).toBeString()
      expect(locale.occurrenceTypeCatalog.clientChannelHint).toBeString()
      for (const channel of CLIENT_CHANNELS) {
        expect(locale.occurrenceTypeCatalog.clientChannelOptions[channel]).toBeString()
      }
    }
  })
})

describe('pedido de contato do cliente no tipo da ocorrência (spec 281 T8b)', () => {
  it('a resposta aceita o campo ausente (API anterior) ou booleano, e recusa o resto', () => {
    expect(hasValidContractorReplyTypeFields({})).toBe(true)
    expect(hasValidContractorReplyTypeFields({ asksClientContact: true })).toBe(true)
    expect(hasValidContractorReplyTypeFields({ asksClientContact: 'sim' })).toBe(false)
  })

  it('a edição manda o valor escolhido e a de outro campo não mexe nele', () => {
    expect(
      buildOccurrenceTypeUpdate({ ...TYPE, asksClientContact: false }, { asksClientContact: true }),
    ).toMatchObject({ asksClientContact: true, occurrenceTypeId: 'type-1' })
    expect(buildOccurrenceTypeUpdate(TYPE, { name: 'Boleto' })).not.toHaveProperty(
      'asksClientContact',
    )
  })

  it('o rótulo e a dica existem nos dois idiomas', () => {
    for (const locale of [settingsPt, settingsEn]) {
      expect(locale.occurrenceTypeCatalog.asksClientContact).toBeString()
      expect(locale.occurrenceTypeCatalog.asksClientContactHint).toBeString()
    }
  })
})

describe('nova data de vencimento opcional no tipo da ocorrência', () => {
  it('a resposta aceita o campo ausente (API anterior) ou booleano, e recusa o resto', () => {
    expect(hasValidContractorReplyTypeFields({ asksNewDueDate: true })).toBe(true)
    expect(hasValidContractorReplyTypeFields({ asksNewDueDate: 'sim' })).toBe(false)
  })

  it('a edição manda o valor escolhido e a de outro campo não mexe nele', () => {
    expect(
      buildOccurrenceTypeUpdate({ ...TYPE, asksNewDueDate: false }, { asksNewDueDate: true }),
    ).toMatchObject({ asksNewDueDate: true, occurrenceTypeId: 'type-1' })
    expect(buildOccurrenceTypeUpdate(TYPE, { name: 'Boleto' })).not.toHaveProperty('asksNewDueDate')
  })

  it('o rótulo e a dica existem nos dois idiomas', () => {
    for (const locale of [settingsPt, settingsEn]) {
      expect(locale.occurrenceTypeCatalog.asksNewDueDate).toBeString()
      expect(locale.occurrenceTypeCatalog.asksNewDueDateHint).toBeString()
    }
  })
})
