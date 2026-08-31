/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { COMPANY_USER_PASSWORD_MIN_LENGTH } from '../../src/modules/identity/shared/companyUsers.constant'
import { createCompanyUsersClient } from '../../src/modules/identity/shared/companyUsersClient.service'
import {
  toIdentitySyncOutcome,
  toCompanyUsersReconciliation,
  toProfileFillOutcome,
  toRealmAdoptionOutcome,
  toRevealedCompanyUsers,
} from '../../src/modules/identity/shared/companyUsersResponse.validation'
import type { ReconciliationEntry } from '../../src/modules/identity/shared/companyUsers.types'
import { summarizeReconciliation } from '@adatechnology/identity-reconciliation'

import { toSynchronizeTargets } from '../../src/modules/identity/shared/reconciliationTargets.service'

const API_URL = 'https://transportada.test'
const USER_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93'

function entryOf(status: ReconciliationEntry['status'], suffix: string): ReconciliationEntry {
  return {
    differences: [],
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

  test('a senha está no diálogo', () => {
    expect(source).toContain('CompanyUserPasswordPanel')
  })

  /**
   * O diálogo não fala do provedor de identidade. Quem administra acessos não precisa saber que
   * existe um Keycloak atrás — e o bloco que o mostrava perdeu a função quando a conciliação de
   * campo passou a acontecer sozinha: o valor do provedor já chega como o cadastro daqui.
   */
  test('o encanamento do provedor não aparece na tela', () => {
    expect(source).not.toContain('RealmMirror')
    expect(source).not.toContain('realmEntry')
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
  /**
   * A classe presente não basta: `.feedback` é declarada depois de `.noticeReady` e tem a mesma
   * especificidade, então o vermelho dela vencia e todo aviso de sucesso saía na cor do erro. Quem
   * decide é o seletor composto, e é ele que este contrato cobra.
   */
  test('o verde vence o vermelho sem depender da ordem das regras', () => {
    const stylesheet = readFileSync(
      'src/modules/identity/styles/userAdministration.module.css',
      'utf8',
    )

    expect(stylesheet).toContain('.feedback.noticeReady')
  })

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

/**
 * A rota de foto responde erro em JSON mesmo quando o sucesso é binário, e o cliente achatava tudo
 * em "requisição falhou". Arquivo grande demais se comprime; formato não aceito se converte — e a
 * tela não tinha como dizer qual dos dois era, porque o código nunca chegava nela.
 */
describe('a falha ao enviar a foto chega à tela', () => {
  async function uploadAgainst(response: Response): Promise<string> {
    const client = createCompanyUsersClient({
      apiUrl: API_URL,
      fetch: () => Promise.resolve(response),
      getAccessToken: () => Promise.resolve('token'),
      newIdempotencyKey: () => 'key',
    })

    const failure = await client
      .replacePicture({ file: new Blob([new Uint8Array([1])]), userId: USER_ID })
      .catch((error: unknown) => error)

    return failure instanceof Error ? failure.message : 'sem erro'
  }

  test('o código do formato não aceito atravessa o cliente', async () => {
    const body = JSON.stringify({ error: { code: 'USER_PICTURE_UNSUPPORTED_FORMAT' } })

    expect(await uploadAgainst(new Response(body, { status: 400 }))).toBe(
      'USER_PICTURE_UNSUPPORTED_FORMAT',
    )
  })

  test('o código do arquivo grande demais também', async () => {
    const body = JSON.stringify({ error: { code: 'USER_PICTURE_TOO_LARGE' } })

    expect(await uploadAgainst(new Response(body, { status: 400 }))).toBe('USER_PICTURE_TOO_LARGE')
  })

  /** Corpo que não é JSON continua sendo falha de requisição: inventar código seria pior. */
  test('resposta sem corpo utilizável continua genérica', async () => {
    expect(await uploadAgainst(new Response('<html>', { status: 502 }))).toBe(
      'COMPANY_USERS_REQUEST_FAILED',
    )
  })

  test('o campo de foto renderiza o erro que recebe', () => {
    const source = readFileSync(
      'src/modules/identity/components/CompanyUserPictureField.component.tsx',
      'utf8',
    )

    expect(source).toContain('users.errors.${errorCode}')
    expect(source).toContain('role="alert"')
  })
})

/**
 * O papel é o caminho para a ficha da frota, e o caminho tem de estar na palavra certa: linkar
 * "Administrador" para a ficha de motorista penduraria a ação no rótulo errado.
 */
describe('a listagem liga o papel à ficha da frota', () => {
  const source = readFileSync(
    'src/modules/identity/components/CompanyUserTable.component.tsx',
    'utf8',
  )

  test('o papel da frota é o que vira link', () => {
    expect(source).toContain('FLEET_ROLES')
    expect(source).toContain("['driver', 'aggregate']")
  })

  test('sem ficha na frota o papel continua etiqueta', () => {
    expect(source).toContain('user.fleet === undefined || fleetRole === undefined')
  })

  test('o documento tem coluna própria, com olho', () => {
    expect(source).toContain('RevealedTaxIdCell')
    expect(source).toContain('users.columnTaxId')
  })

  /** Seis células e cinco títulos foi o que aconteceu ao acrescentar a coluna sem o cabeçalho. */
  test('cada célula da linha tem um título de coluna', () => {
    const head = source.slice(source.indexOf('<thead>'), source.indexOf('</thead>'))
    const body = source.slice(source.indexOf('<tbody>'), source.indexOf('</tbody>'))
    /** `<th[\s>]` e não `<th`: sem a borda, o próprio `<thead>` era contado como coluna. */
    const headerCount = (head.match(/<th[\s>]/gu) ?? []).length
    const cellCount = (body.match(/<td[\s>]/gu) ?? []).length

    expect(cellCount).toBe(headerCount)
  })

  test('dá para esconder uma linha sem esconder todas', () => {
    expect(source).toContain('reveal.hideOne(user.id)')
  })
})

/**
 * O e-mail do provedor chega mascarado da API, e revelá-lo custa uma leitura do realm. O olho pede
 * essa leitura explicitamente — a listagem, que revela uma página inteira, não pede.
 */
describe('o e-mail do provedor tem olho próprio', () => {
  test('o pedido do modal marca `includeRealm`', async () => {
    const bodies: string[] = []
    const client = createCompanyUsersClient({
      apiUrl: API_URL,
      fetch: async (input) => {
        bodies.push(await (input as Request).text())
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      },
      getAccessToken: () => Promise.resolve('token'),
      newIdempotencyKey: () => 'key',
    })

    await client.revealUsers({ includeRealm: true, userIds: [USER_ID] })

    expect(JSON.parse(bodies[0] ?? '{}')).toEqual({ includeRealm: true, userIds: [USER_ID] })
  })

  test('sem pedir, a chave não vai no corpo', async () => {
    const bodies: string[] = []
    const client = createCompanyUsersClient({
      apiUrl: API_URL,
      fetch: async (input) => {
        bodies.push(await (input as Request).text())
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      },
      getAccessToken: () => Promise.resolve('token'),
      newIdempotencyKey: () => 'key',
    })

    await client.revealUsers({ userIds: [USER_ID] })

    expect(JSON.parse(bodies[0] ?? '{}')).toEqual({ userIds: [USER_ID] })
  })

  test('o valor revelado atravessa a validação da resposta', () => {
    const [revealed] = toRevealedCompanyUsers({
      data: [
        {
          contact: 'a@b.test',
          email: '',
          name: 'Ana',
          phone: '',
          realmEmail: 'ana@provedor.test',
          taxId: '',
          userId: USER_ID,
        },
      ],
    })

    expect(revealed?.realmEmail).toBe('ana@provedor.test')
  })

  /** Ausente e vazio dizem coisas diferentes: não foi pedido, e a conta lá não tem e-mail. */
  test('sem o campo na resposta, ele continua ausente', () => {
    const [revealed] = toRevealedCompanyUsers({
      data: [
        { contact: 'a@b.test', email: '', name: 'Ana', phone: '', taxId: '', userId: USER_ID },
      ],
    })

    expect(revealed?.realmEmail).toBeUndefined()
  })

  /** O bloco que mostrava o e-mail do provedor saiu da tela; o transporte fica, e é o que se prova. */
  test('o valor revelado continua atravessando o cliente', () => {
    expect(toRevealedCompanyUsers({ data: [] })).toEqual([])
  })
})

/**
 * O painel escreve no provedor a cada edição, e o provedor nunca escrevia aqui: quem alterasse o
 * login ou o e-mail no console do Keycloak deixava os dois lados discordando — e a comparação ainda
 * dizia "Sincronizado", porque o estado responde se a pessoa existe nos dois lados, não se os
 * campos batem.
 */
describe('a divergência de campo chega à tela', () => {
  test('as diferenças atravessam a validação da resposta', () => {
    const result = toCompanyUsersReconciliation({
      data: {
        hasMoreRealmUsers: false,
        items: [
          {
            differences: ['username', 'email'],
            local: { contact: 'a***@e***.test', userId: 'user-1' },
            matchedBy: 'subject',
            realm: { email: 'a***@e***.test', enabled: true, subject: 'sub-1', username: 'ana' },
            status: 'linked',
          },
        ],
      },
    })

    expect(result.items[0]?.differences).toEqual(['username', 'email'])
  })

  /** Resposta de API antiga não pode virar erro de formato: sem o campo, não há divergência. */
  test('resposta sem o campo devolve lista vazia', () => {
    const result = toCompanyUsersReconciliation({
      data: {
        hasMoreRealmUsers: false,
        items: [{ matchedBy: 'subject', status: 'linked' }],
      },
    })

    expect(result.items[0]?.differences).toEqual([])
  })

  test('o resultado de trazer do provedor diz o que mudou e o que pulou', () => {
    const outcome = toRealmAdoptionOutcome({
      data: {
        adopted: [{ fields: ['email'], userId: 'user-1' }],
        skipped: [{ reason: 'already-equal', userId: 'user-2' }],
      },
    })

    expect(outcome.adopted[0]).toEqual({ fields: ['email'], userId: 'user-1' })
    expect(outcome.skipped[0]?.reason).toBe('already-equal')
  })

  test('o painel oferece o conserto na linha divergente', () => {
    const source = readFileSync(
      'src/modules/identity/components/CompanyUserReconciliationPanel.component.tsx',
      'utf8',
    )

    expect(source).toContain('entry.differences.length > 0')
    expect(source).toContain('onAdoptRealmFields')
    expect(source).toContain('users.sync.status.out-of-sync')
  })
})

/**
 * A foto do cabeçalho vinha do claim `picture` do token e nunca aparecia: o claim aponta para a rota
 * autenticada da foto, e `<img src>` não manda o `Authorization` — e um claim só entra em token
 * novo, então a foto enviada agora só surgiria no próximo login.
 */
describe('a foto do cabeçalho vem da API, não do token', () => {
  const source = readFileSync('src/main.tsx', 'utf8')

  test('o cabeçalho busca a foto pela mesma via dos diálogos', () => {
    expect(source).toContain('useCompanyUserPicture')
    expect(source).toContain('headerPicture.objectUrl')
  })

  test('o claim do token deixa de ser a fonte da imagem', () => {
    expect(source).not.toContain('src={userProfile.pictureUrl}')
  })
})

/**
 * Divergência de campo se concilia sozinha: o provedor é a fonte de login, e-mail e documento, e um
 * cadastro que discorda dele em silêncio é o defeito que a tela veio mostrar — não uma escolha a ser
 * confirmada toda vez. Criar conta e preencher ficha vazia continuam sendo botão, porque ali o
 * conserto **inventa** registro.
 */
describe('a conciliação de campo não espera clique', () => {
  const source = readFileSync(
    'src/modules/identity/hooks/useCompanyUsersReconciliation.hook.ts',
    'utf8',
  )

  test('a divergência dispara a adoção sozinha', () => {
    expect(source).toContain('adoptMutation.mutate(pending)')
    expect(source).toContain('entry.differences.length > 0')
  })

  /** Adotar invalida a consulta; sem memória do tentado, a recusa do provedor viraria laço. */
  test('o que já foi tentado não é pedido de novo', () => {
    expect(source).toContain('attempted.current')
  })

  /**
   * Ficha vazia e cadastro sem acesso também se consertam sozinhos: o dado vem da conta que a pessoa
   * já usa para entrar, e o acesso que se cria é de quem já existe aqui. Nada é inventado.
   */
  test('ficha vazia e cadastro sem acesso também se consertam sozinhos', () => {
    expect(source).toContain('fillProfilesMutation.mutate(pending)')
    expect(source).toContain('synchronizeMutation.mutate({ subjects: [], userIds: pending })')
  })

  /**
   * ⚠️ Acesso sem cadastro continua sendo botão. O provedor pode ser compartilhado com outros
   * produtos: importar em bloco cego traria para dentro da empresa cada conta que existe lá.
   */
  test('acesso sem cadastro nunca é importado sozinho', () => {
    expect(source).not.toContain("keyOf('missing-locally')")
    expect(source).toContain('subjects: []')
  })
})
