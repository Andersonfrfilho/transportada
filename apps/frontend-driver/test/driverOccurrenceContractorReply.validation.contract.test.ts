/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, it, expect } from 'bun:test'
import { isDriverOccurrenceType } from '../src/modules/driver-trip/shared/driverTrip.types'

/** Ausentes são API anterior; presentes, só no vocabulário e na faixa. */

const TYPE_WITHOUT_REPLY_FIELDS = {
  id: 'type-1',
  name: 'Cliente pediu prorrogação do boleto',
  attachmentMode: 'required',
  noteMode: 'required',
  flow: 'document',
}

const TYPE_WITH_REPLY_FIELDS = {
  ...TYPE_WITHOUT_REPLY_FIELDS,
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
  forwardEmailSubject: 'Boleto atualizado',
  forwardEmailBody: 'Olá,',
}

describe('driverTrip.types — tolerância aos campos do retorno da contratante (spec 248 T1.2)', () => {
  it('aceita tipo sem os campos do retorno (API anterior)', () => {
    expect(isDriverOccurrenceType(TYPE_WITHOUT_REPLY_FIELDS)).toBe(true)
  })

  it('aceita tipo com todos os campos do retorno no vocabulário', () => {
    expect(isDriverOccurrenceType(TYPE_WITH_REPLY_FIELDS)).toBe(true)
  })

  it('aceita a espera nula (sem prazo)', () => {
    expect(
      isDriverOccurrenceType({ ...TYPE_WITH_REPLY_FIELDS, contractorReplyWaitHours: null }),
    ).toBe(true)
  })

  it('recusa campo do retorno fora do vocabulário ou da faixa', () => {
    expect(
      isDriverOccurrenceType({ ...TYPE_WITHOUT_REPLY_FIELDS, contractorReplyMode: 'maybe' }),
    ).toBe(false)
    expect(
      isDriverOccurrenceType({ ...TYPE_WITHOUT_REPLY_FIELDS, contractorReplyWaitHours: 0 }),
    ).toBe(false)
    expect(
      isDriverOccurrenceType({ ...TYPE_WITHOUT_REPLY_FIELDS, contractorReplyAlertMaxCount: 97 }),
    ).toBe(false)
    expect(isDriverOccurrenceType({ ...TYPE_WITHOUT_REPLY_FIELDS, forwardEmailBody: 42 })).toBe(
      false,
    )
  })
})
