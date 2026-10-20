/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T4: "Pedido repetido na mesma nota" no cadastro do tipo. O tipo novo nasce bloqueando enquanto o
 * pedido estiver aberto; a API anterior ao campo não o recebe (o `PUT` dela é `.strict()`); a edição manda só
 * o que mudou.
 */
import { describe, expect, it } from 'bun:test'

import settingsEn from '@/modules/company-settings/locales/companySettings.en.locale.json'
import settingsPt from '@/modules/company-settings/locales/companySettings.locale.json'
import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import tripPt from '@/modules/trip/locales/trip.locale.json'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import {
  DUPLICATE_REQUEST_POLICIES,
  DUPLICATE_REQUEST_POLICY_FOR_NEW_TYPE,
} from '@/modules/trip/shared/occurrenceContractorReply.constant'
import { OCCURRENCE_TEMPLATE_NONE } from '@/modules/trip/shared/occurrenceTemplate.service'
import { buildOccurrenceTypeCreateInput } from '@/modules/trip/shared/occurrenceTypeCreate.service'
import { buildOccurrenceTypeUpdate } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import { TRIP_FEEDBACK_KEY_BY_ERROR } from '@/modules/trip/shared/trip.constant'

const DRAFT = {
  allowsMultipleItems: true,
  attachmentMode: 'off',
  contractorIds: [],
  contractorScope: 'all',
  duplicateRequestPolicy: 'while_request_open',
  emailTemplateKey: OCCURRENCE_TEMPLATE_NONE,
  itemsMode: 'optional',
  leavesDocumentBehind: false,
  moments: ['document'],
  name: 'Prorrogação do boleto',
  noteMode: 'optional',
  notifies: false,
  redeliveryPolicy: 'unset',
  signatureMode: 'off',
} as const

const SUPPORT = {
  hasContractorScope: true,
  hasDuplicateRequestPolicy: true,
  hasItemsMode: true,
  hasMoments: true,
  hasRequirementModes: true,
}

const TYPE = {
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'off',
  duplicateRequestPolicy: 'allow',
  emailTemplateKey: null,
  flow: 'document',
  id: 'type-1',
  leavesDocumentBehind: false,
  name: 'Prorrogação do boleto',
  notifies: false,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
} as unknown as OccurrenceType

describe('pedido repetido na mesma nota (spec 276 T4)', () => {
  it('o tipo novo nasce bloqueando enquanto o pedido estiver aberto', () => {
    expect(DUPLICATE_REQUEST_POLICY_FOR_NEW_TYPE).toBe('while_request_open')
  })

  it('o cadastro manda a escolha do rascunho', () => {
    const input = buildOccurrenceTypeCreateInput({
      draft: { ...DRAFT, duplicateRequestPolicy: 'until_resolved' },
      support: SUPPORT,
    })

    expect(input.duplicateRequestPolicy).toBe('until_resolved')
  })

  it('API anterior ao campo não recebe a trava', () => {
    const input = buildOccurrenceTypeCreateInput({
      draft: DRAFT,
      support: { ...SUPPORT, hasDuplicateRequestPolicy: false },
    })

    expect(input).not.toHaveProperty('duplicateRequestPolicy')
  })

  it('a edição manda a política nova', () => {
    expect(
      buildOccurrenceTypeUpdate(TYPE, { duplicateRequestPolicy: 'until_resolved' }),
    ).toMatchObject({ duplicateRequestPolicy: 'until_resolved', occurrenceTypeId: 'type-1' })
  })

  it('a edição de outro campo não mexe na trava', () => {
    expect(buildOccurrenceTypeUpdate(TYPE, { name: 'Boleto' })).not.toHaveProperty(
      'duplicateRequestPolicy',
    )
  })

  it('o rótulo e cada opção existem nos dois idiomas', () => {
    for (const locale of [settingsPt, settingsEn]) {
      expect(locale.occurrenceTypeCatalog.duplicateRequestPolicy).toBeString()
      for (const policy of DUPLICATE_REQUEST_POLICIES) {
        expect(locale.occurrenceTypeCatalog.duplicateRequestPolicyOptions[policy]).toBeString()
      }
    }
  })

  it('a recusa do pedido repetido tem frase própria nos dois idiomas', () => {
    const key = TRIP_FEEDBACK_KEY_BY_ERROR.TRIP_OCCURRENCE_DUPLICATE_REQUEST
    expect(key).toBeString()
    expect((tripPt.feedback as Record<string, string>)[key ?? '']).toBeString()
    expect((tripEn.feedback as Record<string, string>)[key ?? '']).toBeString()
  })
})
