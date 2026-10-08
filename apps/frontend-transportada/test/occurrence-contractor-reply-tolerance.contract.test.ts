/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { readOccurrenceAttachmentOverrides } from '@/modules/trip/shared/occurrenceAttachmentOverrides.validation'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const TYPE_ID = '54ed0225-f293-47c3-84fe-0b66eff68784'

const CONTRACTOR_REPLY_TYPE_FIELDS = {
  contractorReplyMode: 'forward_automatic',
  contractorReplyAttachmentKind: 'pdf',
  driverReplyChannel: 'app_chat',
  driverReplyWindowClosedAction: 'fallback_app_chat',
  driverReplyTemplate: 'Boleto atualizado da NF {{numeroNotaSemSerie}}.',
  contractorReplyWaitHours: 6,
  contractorReplyAlertMode: 'alert_operator',
  contractorReplyAlertIntervalMinutes: 60,
  contractorReplyAlertMaxCount: 24,
  forwardToNoteRecipient: 'manual',
  forwardToInformedEmail: 'manual',
  forwardEmailSubject: 'Boleto atualizado – NF {{numeroNotaSemSerie}}',
  forwardEmailBody: 'Olá,',
} as const

function buildOccurrenceType(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    active: true,
    allowsMultipleItems: false,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TYPE_ID,
    name: 'Cliente pediu prorrogação do boleto',
    notifies: true,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
    ...extra,
  }
}

function buildTripOccurrence(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    createdAt: '2026-10-08T10:00:00Z',
    id: 'occurrence-001',
    note: 'Cliente pediu prorrogação',
    occurrenceTypeId: TYPE_ID,
    productCode: 'SKU-123',
    stage: 'delivery' as const,
    typeName: 'Cliente pediu prorrogação do boleto',
    ...extra,
  }
}

function buildOverridePair(contractorOverride: Readonly<Record<string, unknown>>) {
  return {
    contractorOverrides: [
      { attachmentMode: 'required', contractorId: 'contractor-1', ...contractorOverride },
    ],
    recipientOverrides: [],
  }
}

describe('tolerância aos campos do retorno da contratante no tipo (spec 248 T1.1)', () => {
  it('aceita tipo sem os campos do retorno (API anterior)', () => {
    const [type] = adapters.occurrenceTypesFromApi([buildOccurrenceType()])

    expect(type?.id).toBe(TYPE_ID)
  })

  it('aceita tipo com todos os campos do retorno no vocabulário', () => {
    const [type] = adapters.occurrenceTypesFromApi([
      buildOccurrenceType(CONTRACTOR_REPLY_TYPE_FIELDS),
    ])

    expect(type?.id).toBe(TYPE_ID)
  })

  it('aceita a espera nula (sem prazo)', () => {
    const [type] = adapters.occurrenceTypesFromApi([
      buildOccurrenceType({ contractorReplyWaitHours: null }),
    ])

    expect(type?.id).toBe(TYPE_ID)
  })

  it('recusa campo do retorno fora do vocabulário ou da faixa', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ contractorReplyMode: 'maybe' })]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ contractorReplyWaitHours: 0 })]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([
        buildOccurrenceType({ contractorReplyAlertIntervalMinutes: 14 }),
      ]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ forwardEmailBody: 42 })]),
    ).toThrow()
  })
})

describe('tolerância ao objeto contractorReply na ocorrência (spec 248 T1.1)', () => {
  it('aceita ocorrência sem contractorReply (API anterior)', () => {
    const occurrence = adapters.tripOccurrenceFromApi(buildTripOccurrence())

    expect(occurrence.id).toBe('occurrence-001')
  })

  it('aceita ocorrência com contractorReply nulo e com objeto', () => {
    const withNull = adapters.tripOccurrenceFromApi(buildTripOccurrence({ contractorReply: null }))
    const withObject = adapters.tripOccurrenceFromApi(
      buildTripOccurrence({ contractorReply: { status: 'awaiting_contractor' } }),
    )

    expect(withNull.id).toBe('occurrence-001')
    expect(withObject.id).toBe('occurrence-001')
  })

  it('recusa contractorReply que não é objeto', () => {
    expect(() =>
      adapters.tripOccurrenceFromApi(buildTripOccurrence({ contractorReply: 'awaiting' })),
    ).toThrow()
  })
})

describe('tolerância às três colunas da exceção por contratante (spec 248 T1.1)', () => {
  it('aceita exceção sem as colunas do retorno (API anterior)', () => {
    const result = readOccurrenceAttachmentOverrides(buildOverridePair({ noteMode: 'required' }))

    expect(result?.contractorOverrides).toHaveLength(1)
  })

  it('aceita exceção com as colunas do retorno, nulas ou preenchidas', () => {
    const result = readOccurrenceAttachmentOverrides(
      buildOverridePair({
        contractorReplyMode: 'forward_automatic',
        contractorReplyWaitHours: null,
        forwardToNoteRecipient: null,
      }),
    )

    expect(result?.contractorOverrides).toHaveLength(1)
  })

  it('recusa coluna da exceção fora do vocabulário', () => {
    const result = readOccurrenceAttachmentOverrides(
      buildOverridePair({ forwardToNoteRecipient: 'sometimes' }),
    )

    expect(result).toBeUndefined()
  })
})
