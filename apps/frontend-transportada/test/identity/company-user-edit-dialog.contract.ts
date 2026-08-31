/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { COMPANY_USER_PASSWORD_MIN_LENGTH } from '../../src/modules/identity/shared/companyUsers.constant'
import { createCompanyUsersClient } from '../../src/modules/identity/shared/companyUsersClient.service'
import {
  toIdentitySyncOutcome,
  toProfileFillOutcome,
} from '../../src/modules/identity/shared/companyUsersResponse.validation'
import type { ReconciliationEntry } from '../../src/modules/identity/shared/companyUsers.types'
import {
  summarizeReconciliation,
  toSynchronizeTargets,
} from '../../src/modules/identity/shared/reconciliationSummary.service'

const API_URL = 'https://transportada.test'
const USER_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93'

function entryOf(status: ReconciliationEntry['status'], suffix: string): ReconciliationEntry {
  return {
    local: {
      contact: 'a***@e***.test',
      email: '',
      membershipId: `membership-${suffix}`,
      name: '',
      taxId: '',
      userId: `user-${suffix}`,
    },
    matchedBy: 'subject',
    realm: { email: 'a***@e***.test', enabled: true, subject: `sub-${suffix}`, username: 'ana' },
    status,
  }
}

/**
 * O defeito que este contrato tranca: com a única divergência sendo ficha vazia, a tela anunciava
 * "criar 1 que falta" e o clique mandava dois conjuntos vazios para a API. O botão parecia quebrado
 * porque a contagem dele vinha de uma lista da qual ele não tira nenhum alvo.
 */
describe('a comparação separa quem falta de quem está sem ficha', () => {
  test('ficha vazia não conta como acesso a criar', () => {
    const summary = summarizeReconciliation([entryOf('profile-missing', '1')])

    expect(summary.missingSomewhere).toHaveLength(0)
    expect(summary.withoutProfile).toHaveLength(1)
    expect(summary.divergent).toBe(1)
  })

  test('as duas divergências somam no total e continuam separadas', () => {
    const summary = summarizeReconciliation([
      entryOf('profile-missing', '1'),
      entryOf('missing-in-realm', '2'),
      entryOf('missing-locally', '3'),
      entryOf('linked', '4'),
    ])

    expect(summary.divergent).toBe(3)
    expect(summary.missingSomewhere).toHaveLength(2)
    expect(summary.withoutProfile).toHaveLength(1)
  })

  test('o botão de criar só envia alvo de quem existe de um lado só', () => {
    const summary = summarizeReconciliation([
      entryOf('missing-in-realm', '2'),
      entryOf('missing-locally', '3'),
    ])
    const targets = toSynchronizeTargets(summary.missingSomewhere)

    expect(targets.userIds).toEqual(['user-2'])
    expect(targets.subjects).toEqual(['sub-3'])
  })

  test('sem quem criar, não há alvo nenhum a enviar', () => {
    expect(toSynchronizeTargets([entryOf('profile-missing', '1')])).toEqual({
      subjects: [],
      userIds: [],
    })
  })
})

/**
 * A API sempre devolveu o que fez e o que pulou; o cliente jogava o corpo fora. Preencher uma ficha
 * e pular outra produzia a mesma tela de antes do clique, e quem clicou concluía que não funcionou.
 */
describe('o resultado do conserto chega à tela', () => {
  test('o preenchimento devolve o que foi feito e a razão de cada pulo', () => {
    const outcome = toProfileFillOutcome({
      data: {
        filled: ['user-1'],
        skipped: [{ reason: 'profile-exists', userId: 'user-2' }],
      },
    })

    expect(outcome.filled).toEqual(['user-1'])
    expect(outcome.skipped[0]).toEqual({ reason: 'profile-exists', userId: 'user-2' })
  })

  test('a criação devolve os dois sentidos e os pulos', () => {
    const outcome = toIdentitySyncOutcome({
      data: {
        createdInRealm: ['user-1'],
        createdLocally: ['user-2'],
        skipped: [{ reason: 'service-account', subject: 'sub-3' }],
      },
    })

    expect(outcome.createdInRealm).toEqual(['user-1'])
    expect(outcome.createdLocally).toEqual(['user-2'])
    expect(outcome.skipped[0]?.reason).toBe('service-account')
  })

  /** Corpo ausente é o que a rota respondia antes: erro de formato aqui esconderia trabalho feito. */
  test('corpo vazio não vira erro de formato', () => {
    expect(toProfileFillOutcome(undefined)).toEqual({ filled: [], skipped: [] })
    expect(toIdentitySyncOutcome({})).toEqual({
      createdInRealm: [],
      createdLocally: [],
      skipped: [],
    })
  })
})

describe('a senha tem rota própria', () => {
  test('vai por PUT, com o `temporary` no corpo, e não volta em eco nenhum', async () => {
    const calls: Readonly<{ body: string; method: string; url: string }>[] = []
    const client = createCompanyUsersClient({
      apiUrl: API_URL,
      fetch: async (input) => {
        const request = input as Request
        calls.push({ body: await request.text(), method: request.method, url: request.url })
        return new Response(null, { status: 204 })
      },
      getAccessToken: () => Promise.resolve('token'),
      newIdempotencyKey: () => 'key',
    })

    await client.setPassword({
      password: 'senha-longa-o-suficiente',
      temporary: true,
      userId: USER_ID,
    })

    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.url).toBe(`${API_URL}/company-users/${USER_ID}/password`)
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      password: 'senha-longa-o-suficiente',
      temporary: true,
    })
  })

  /**
   * Cópia por valor do piso da API (`identity/domain/company-user-password.constant.ts`): o bundle
   * não carrega código do servidor. Mudou lá? este número muda aqui, e é este teste que cobra.
   */
  test('o piso da senha é o mesmo dos dois lados', () => {
    expect(COMPANY_USER_PASSWORD_MIN_LENGTH).toBe(12)
  })
})

/**
 * A conferência por texto de fonte existe porque esta app não tem DOM no teste: um bloco que some
 * do diálogo compila e passa em todo teste de serviço puro. Foi assim que a foto ficou só no
 * diálogo de permissões, e o telefone e o CPF ficaram fora da edição apesar de a rota os aceitar.
 */
describe('o diálogo de edição monta os blocos que a operação precisa', () => {
  const source = readFileSync(
    'src/modules/identity/components/CompanyUserEditDialog.component.tsx',
    'utf8',
  )

  test('a foto é editável na edição, não só no diálogo de permissões', () => {
    expect(source).toContain('CompanyUserPictureField')
  })

  test('o espelho do provedor e a senha estão no diálogo', () => {
    expect(source).toContain('CompanyUserRealmMirror')
    expect(source).toContain('CompanyUserPasswordPanel')
  })

  test('telefone e CPF entram formatados, pelo campo com máscara', () => {
    expect(source).toContain('format={formatPhone}')
    expect(source).toContain('format={formatTaxId}')
  })

  test('o campo de CNPJ/CPF não pede teclado numérico no telefone errado', () => {
    expect(source).not.toContain('inputMode="numeric"')
  })
})
