/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  findEmissionProfile,
  resolveMunicipalServicePolicy,
} from '../../src/cte-profiles/domain/emission-profile-resolution.policy.js'

const SENDER_TAX_ID = '05868574001090'
const SENDER_ROOT = '05868574'
const RECIPIENT_TAX_ID = '19354980000159'

const INVOICE = { recipientTaxId: RECIPIENT_TAX_ID, senderTaxId: SENDER_TAX_ID } as const

const buildProfile = (
  overrides: Partial<Parameters<typeof findEmissionProfile>[0]['profiles'][number]> = {},
) =>
  ({
    id: 'profile-root',
    matchMode: 'sender_tax_id',
    matchers: [{ matchRole: 'sender', taxId: SENDER_ROOT }],
    name: 'Spani',
    priority: 10n,
    status: 'active',
    ...overrides,
  }) as const

/**
 * A listagem de notas precisa saber qual perfil rege cada nota, e ela **não pode levantar exceção**
 * por isso: `resolveEmissionProfile` lança em três casos legítimos numa listagem — nota sem perfil,
 * empate, e CNPJ que não é CNPJ. Qualquer um deles derrubaria a tela inteira por causa de uma linha.
 */
describe('a consulta de perfil que a listagem faz (spec do portão municipal)', () => {
  test('acha o perfil pelo CNPJ do emitente, como a emissão acharia', () => {
    expect(findEmissionProfile({ invoice: INVOICE, profiles: [buildProfile()] })).toEqual({
      matchedBy: 'sender_tax_id',
      matchedTaxId: SENDER_ROOT,
      precision: 'root',
      profileId: 'profile-root',
    })
  })

  /** O CNPJ cheio vence a raiz — a mesma precedência da emissão, senão as duas discordariam. */
  test('o casamento cheio vence a raiz', () => {
    const resolved = findEmissionProfile({
      invoice: INVOICE,
      profiles: [
        buildProfile(),
        buildProfile({
          id: 'profile-full',
          matchers: [{ matchRole: 'sender', taxId: SENDER_TAX_ID }],
        }),
      ],
    })
    expect(resolved?.profileId).toBe('profile-full')
    expect(resolved?.precision).toBe('full')
  })

  /** Nota sem perfil é ausência, não erro: ela continua na tela, sem portão nenhum. */
  test('sem perfil devolve ausência', () => {
    expect(findEmissionProfile({ invoice: INVOICE, profiles: [] })).toBeNull()
  })

  /** Perfil inativo não rege nada — e também não derruba a listagem. */
  test('perfil inativo devolve ausência', () => {
    expect(
      findEmissionProfile({ invoice: INVOICE, profiles: [buildProfile({ status: 'inactive' })] }),
    ).toBeNull()
  })

  /**
   * ⚠️ **Empate devolve ausência, nunca um palpite.** Na emissão ele é
   * `CteEmissionProfileAmbiguousError` — ali a pessoa precisa resolver antes de emitir. Aqui, com
   * dois perfis igualmente bons, escolher um faria a listagem barrar por uma regra que a emissão
   * se recusaria a aplicar.
   */
  test('empate devolve ausência', () => {
    expect(
      findEmissionProfile({
        invoice: INVOICE,
        profiles: [buildProfile(), buildProfile({ id: 'profile-twin' })],
      }),
    ).toBeNull()
  })

  /** CNPJ que não é CNPJ é ausência: a listagem mostra a nota, e a emissão é que reclama. */
  test('documento fora do padrão devolve ausência', () => {
    expect(
      findEmissionProfile({
        invoice: { recipientTaxId: RECIPIENT_TAX_ID, senderTaxId: '123' },
        profiles: [buildProfile()],
      }),
    ).toBeNull()
  })
})

const BLOCKING = { ...buildProfile(), municipalServicePolicy: 'block' } as const
const ALLOWING = { ...buildProfile(), municipalServicePolicy: 'allow' } as const

/**
 * Dois consumidores fazem a mesma pergunta — a listagem de notas e a seleção do lote —, e se cada
 * um a respondesse do seu jeito a tela mostraria um bloqueio que a seleção não aplica, ou o
 * contrário.
 */
describe('a política de serviço municipal que rege uma nota', () => {
  test('vem do perfil que casa com o emitente', () => {
    expect(
      resolveMunicipalServicePolicy({
        profiles: [BLOCKING],
        recipientTaxId: RECIPIENT_TAX_ID,
        senderTaxId: SENDER_TAX_ID,
      }),
    ).toBe('block')
  })

  test('perfil que permite devolve allow', () => {
    expect(
      resolveMunicipalServicePolicy({
        profiles: [ALLOWING],
        recipientTaxId: RECIPIENT_TAX_ID,
        senderTaxId: SENDER_TAX_ID,
      }),
    ).toBe('allow')
  })

  /** Sem perfil não há quem tenha escolhido bloquear — e ausência nunca vira bloqueio. */
  test('nota sem perfil fica em allow', () => {
    expect(
      resolveMunicipalServicePolicy({
        profiles: [],
        recipientTaxId: RECIPIENT_TAX_ID,
        senderTaxId: SENDER_TAX_ID,
      }),
    ).toBe('allow')
  })

  /** Nota sem participante identificado também: ela já é barrada por outro motivo, se for o caso. */
  test('nota sem CNPJ dos participantes fica em allow', () => {
    expect(
      resolveMunicipalServicePolicy({
        profiles: [BLOCKING],
        recipientTaxId: null,
        senderTaxId: null,
      }),
    ).toBe('allow')
  })
})
