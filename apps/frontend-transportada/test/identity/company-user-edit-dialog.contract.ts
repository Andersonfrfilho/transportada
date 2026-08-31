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
import { summarizeReconciliation } from '@adatechnology/identity-reconciliation'

import { toSynchronizeTargets } from '../../src/modules/identity/shared/reconciliationTargets.service'

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
 *
 * A regra pura mora em `@adatechnology/identity-reconciliation` e tem os testes dela lá; o que se
 * prova aqui é a **fiação desta app** — que a tela consome o resumo do pacote e que a extração do
 * identificador daqui casa com o que a nossa rota espera.
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

  test('cada dado guardado tem valor, olho e lápis num lugar só', () => {
    expect(source).toContain('CompanyUserStoredField')
    expect(source).toContain('onStopEditing')
    expect(source).toContain('editor={editorOf(field)}')
  })

  /** Trocar o canal torna o contato obrigatório; fechado, o envio seria recusado sem campo à vista. */
  test('trocar o canal abre o contato sozinho', () => {
    expect(source).toContain('form.isContactRequired')
    const row = source.slice(source.indexOf('isEditing='), source.indexOf('isRevealing='))
    expect(row).toContain('isContactRequired')
  })

  /** Desistir da troca precisa limpar o digitado: senão o valor entra no PATCH mesmo assim. */
  test('fechar a edição limpa o que foi digitado', () => {
    expect(source).toContain('CLEAR_FIELD[field]()')
  })

  test('telefone e CPF entram formatados, pelo campo com máscara', () => {
    expect(source).toContain('format={formatPhone}')
    expect(source).toContain('format={formatTaxId}')
  })

  test('o campo de CNPJ/CPF não pede teclado numérico no telefone errado', () => {
    expect(source).not.toContain('inputMode="numeric"')
  })
})

/**
 * `.feedback` é vermelha por definição (`--color-alert`). Usá-la crua para anunciar sucesso fazia
 * "Senha definida." sair na cor de erro, e quem leu foi procurar um defeito que não existia.
 *
 * A varredura é dos dois avisos de **sucesso**, não de todo `role="status"` do módulo: a ressalva
 * de que o Keycloak tem mais contas do que a página trouxe continua vermelha de propósito — ela
 * avisa que pode haver divergência fora da vista, e verde ali diria o contrário.
 */
describe('sucesso não sai na cor do erro', () => {
  test('a senha definida e o link enviado saem no verde', () => {
    const source = readFileSync(
      'src/modules/identity/components/CompanyUserPasswordPanel.component.tsx',
      'utf8',
    )
    const successBlock = source.slice(source.indexOf("password.status === 'idle'"))

    expect(successBlock).toContain('styles.noticeReady')
    expect(successBlock).toContain("password.status === 'saved'")
  })

  test('o resultado do conserto sai no verde', () => {
    const source = readFileSync(
      'src/modules/identity/components/CompanyUserReconciliationPanel.component.tsx',
      'utf8',
    )
    const outcomeBlock = source.slice(source.indexOf('function ReconciliationOutcome'))

    expect(outcomeBlock).toContain('styles.noticeReady')
  })

  test('o aviso de erro da senha continua vermelho, sem o modificador', () => {
    const source = readFileSync(
      'src/modules/identity/components/CompanyUserPasswordPanel.component.tsx',
      'utf8',
    )
    const alertBlock = source.slice(0, source.indexOf('role="alert"')).slice(-220)

    expect(alertBlock).toContain('styles.feedback')
    expect(alertBlock).not.toContain('styles.noticeReady')
  })
})
