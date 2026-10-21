/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildRecipientOptions,
  buildWatcherOptions,
  countRecipientsLeavingScope,
  isWatcherSelectionAllowed,
  OCCURRENCE_TYPE_MAIL_WATCHERS_MAX,
} from '../../src/modules/trip/shared/occurrenceTypeMailChoices.service'

const LABELS = { inactive: 'inativo', notEligible: 'sem e-mail' }

describe('a escolha de responsáveis em cópia do tipo (spec 271 RF5)', () => {
  test('o teto é o da API: até 10; acima recusa, remover sempre passa', () => {
    const ten = Array.from({ length: OCCURRENCE_TYPE_MAIL_WATCHERS_MAX }, (_, index) => `u${index}`)

    expect(OCCURRENCE_TYPE_MAIL_WATCHERS_MAX).toBe(10)
    expect(isWatcherSelectionAllowed(ten.slice(0, 9), ten)).toBe(true)
    expect(isWatcherSelectionAllowed(ten, [...ten, 'u10'])).toBe(false)
    expect(isWatcherSelectionAllowed([...ten, 'u10'], ten)).toBe(true)
  })

  test('oferece só ativos e elegíveis; o escolhido que deixou de receber continua, marcado', () => {
    const options = buildWatcherOptions({
      chosen: [
        { eligible: true, name: 'Davi', status: 'inactive', userId: 'davi' },
        { eligible: false, name: 'Carla', status: 'active', userId: 'carla' },
      ],
      companyWatchers: [
        { eligible: true, maskedEmail: 'a', name: 'Ana', status: 'active', userId: 'ana' },
        { eligible: false, maskedEmail: null, name: 'Carla', status: 'active', userId: 'carla' },
        { eligible: true, maskedEmail: 'd', name: 'Davi', status: 'inactive', userId: 'davi' },
        { eligible: true, maskedEmail: 'e', name: 'Eva', status: 'inactive', userId: 'eva' },
      ],
      labels: LABELS,
    })

    expect(options.map((option) => [option.value, option.label])).toEqual([
      ['ana', 'Ana'],
      ['carla', 'Carla (sem e-mail)'],
      ['davi', 'Davi (inativo)'],
    ])
  })
})

describe('os destinatários do tipo (spec 271 RF6, RF7)', () => {
  const CONTRACTORS = [
    { displayName: 'ZARAGOZA', id: 'c-z', status: 'active', taxId: '1' },
    { displayName: 'RIBER', id: 'c-r', status: 'active', taxId: '2' },
  ]
  const RECIPIENT = (contactId: string, contractorId: string) => ({
    contactId,
    contractorId,
    email: `${contactId}@e.test`,
    name: '',
    receivesOccurrences: true,
    status: 'active',
  })

  test('agrupa pelas contratantes do tipo e marca o escolhido que saiu da lista de candidatos', () => {
    const options = buildRecipientOptions({
      candidates: [RECIPIENT('r1', 'c-r'), RECIPIENT('z1', 'c-z')],
      chosen: [{ ...RECIPIENT('old', 'c-z'), status: 'inactive' }],
      contractors: CONTRACTORS,
      labels: LABELS,
    })

    expect(options.map((option) => option.value)).toEqual(['z1', 'r1', 'old'])
    expect(options[2]?.label).toBe('old@e.test (inativo)')
  })

  test('tirar contratantes do escopo, ou trocar para Todas, leva os contatos delas', () => {
    const recipients = [RECIPIENT('z1', 'c-z'), RECIPIENT('r1', 'c-r')]

    expect(
      countRecipientsLeavingScope({ nextContractorIds: ['c-z'], nextScope: 'listed', recipients }),
    ).toBe(1)
    expect(
      countRecipientsLeavingScope({
        nextContractorIds: ['c-z', 'c-r'],
        nextScope: 'listed',
        recipients,
      }),
    ).toBe(0)
    expect(
      countRecipientsLeavingScope({ nextContractorIds: [], nextScope: 'all', recipients }),
    ).toBe(2)
  })
})
