/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 248 T5.1: o bloco "Retorno da contratante" da aba Tipos. As CHECKs do banco aparecem como mensagem no
 * campo antes do `PUT`, e o conjunto dos oito campos vai de uma vez.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceType } from '../../src/modules/trip/shared/occurrence.constant'
import {
  buildContractorReplyEdit,
  isContractorReplyDraftChanged,
  readContractorReplyDraft,
  readContractorReplyProblems,
  type ContractorReplyDraft,
} from '../../src/modules/trip/shared/occurrenceContractorReplyDraft.service'
import { buildOccurrenceTypeUpdate } from '../../src/modules/trip/shared/occurrenceTypeUpdate.service'

const TYPE = {
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'off',
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: null,
  emailsContractor: true,
  flow: 'document',
  id: 'type-1',
  leavesDocumentBehind: false,
  name: 'Prorrogação de boleto',
  notifies: false,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
} as unknown as OccurrenceType

function draft(overrides: Partial<ContractorReplyDraft> = {}): ContractorReplyDraft {
  return { ...readContractorReplyDraft(TYPE), ...overrides }
}

describe('o rascunho do retorno da contratante (spec 248 T5.1)', () => {
  test('tipo de API anterior aos campos lê os padrões do banco', () => {
    expect(readContractorReplyDraft(TYPE)).toEqual({
      alertIntervalMinutes: '60',
      alertMaxCount: '24',
      alertMode: 'off',
      attachmentKind: 'pdf',
      driverReplyTemplate: '',
      forwardToNoteRecipient: 'off',
      mode: 'off',
      waitHours: '',
    })
  })

  test('desligado não reclama de nada, nem do e-mail à contratante desligado', () => {
    expect(readContractorReplyProblems({ draft: draft(), emailsContractor: false })).toEqual({})
  })

  test('retorno ligado exige o e-mail à contratante e o texto ao motorista, nos campos', () => {
    const problems = readContractorReplyProblems({
      draft: draft({ mode: 'forward_automatic' }),
      emailsContractor: false,
    })
    expect(problems.mode).toBe('needsContractorMail')
    expect(problems.driverReplyTemplate).toBe('templateRequired')
    expect(
      readContractorReplyProblems({
        draft: draft({ driverReplyTemplate: '   ', mode: 'forward_after_approval' }),
        emailsContractor: true,
      }).driverReplyTemplate,
    ).toBe('templateRequired')
  })

  test('alerta de atraso exige o prazo, e prazo e alerta ficam nas faixas do banco', () => {
    expect(
      readContractorReplyProblems({
        draft: draft({ alertMode: 'alert_operator' }),
        emailsContractor: true,
      }).waitHours,
    ).toBe('alertNeedsWaitHours')
    const outOfRange = readContractorReplyProblems({
      draft: draft({
        alertIntervalMinutes: '10',
        alertMaxCount: '97',
        alertMode: 'alert_operator',
        waitHours: '169',
      }),
      emailsContractor: true,
    })
    expect(outOfRange.waitHours).toBe('waitHoursOutOfRange')
    expect(outOfRange.alertIntervalMinutes).toBe('intervalOutOfRange')
    expect(outOfRange.alertMaxCount).toBe('maxCountOutOfRange')
    expect(
      readContractorReplyProblems({
        draft: draft({
          alertIntervalMinutes: '60',
          alertMaxCount: '24',
          alertMode: 'alert_operator',
          waitHours: '6',
        }),
        emailsContractor: true,
      }),
    ).toEqual({})
  })

  test('enviar automático ao cliente da nota exige o retorno ligado', () => {
    expect(
      readContractorReplyProblems({
        draft: draft({ forwardToNoteRecipient: 'automatic' }),
        emailsContractor: true,
      }).forwardToNoteRecipient,
    ).toBe('automaticNeedsReply')
    expect(
      readContractorReplyProblems({
        draft: draft({
          driverReplyTemplate: 'Segue o boleto atualizado.',
          forwardToNoteRecipient: 'automatic',
          mode: 'forward_automatic',
        }),
        emailsContractor: true,
      }),
    ).toEqual({})
  })

  test('o roteiro do SAC (6 h, alerta a cada 60 min, até 24) vira os oito campos e o PUT os leva', () => {
    const roteiro = draft({
      alertMode: 'alert_operator',
      driverReplyTemplate: 'Segue o boleto atualizado.',
      mode: 'forward_after_approval',
      waitHours: '6',
    })
    const edit = buildContractorReplyEdit(roteiro)
    expect(edit).toEqual({
      contractorReplyAlertIntervalMinutes: 60,
      contractorReplyAlertMaxCount: 24,
      contractorReplyAlertMode: 'alert_operator',
      contractorReplyAttachmentKind: 'pdf',
      contractorReplyMode: 'forward_after_approval',
      contractorReplyWaitHours: 6,
      driverReplyTemplate: 'Segue o boleto atualizado.',
      forwardToNoteRecipient: 'off',
    })
    expect(buildOccurrenceTypeUpdate(TYPE, edit)).toMatchObject(edit)
    expect(buildContractorReplyEdit(draft()).contractorReplyWaitHours).toBeNull()
  })

  test('o rascunho só conta como mudado quando algum campo difere do salvo', () => {
    expect(isContractorReplyDraftChanged(draft(), draft())).toBe(false)
    expect(isContractorReplyDraftChanged(draft({ waitHours: '6' }), draft())).toBe(true)
  })
})
