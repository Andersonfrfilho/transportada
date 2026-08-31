/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A rota de edição lia `taxId` e `phone` do corpo e os descartava: o tipo de entrada do caso de uso
 * não os declarava, e o spread compila sem reclamar. Editar o CPF de alguém não fazia nada, e nada
 * quebrava — o modo de falha silencioso que este contrato transforma em falha barulhenta.
 */
import { describe, expect, test } from 'bun:test'

import { createUpdateCompanyUserProfileUseCase } from '../../src/identity/application/update-company-user-profile.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const SUBJECT = 'a1b2c3d4-0000-4000-8000-ffffffffffff'

const EXISTING = {
  contactAddress: 'pessoa@empresa.test',
  contactChannel: 'email',
  email: 'pessoa@empresa.test',
  membershipId: '00000000-0000-4000-8000-0000000000bb',
  membershipStatus: 'active',
  name: 'Maria',
  phone: '',
  roles: ['operator'],
  taxId: '',
  userId: USER_ID,
  username: 'maria',
} as const

type UpdateCall = Record<string, unknown>

function createFakes() {
  const profileUpdates: UpdateCall[] = []
  const attributeUpdates: UpdateCall[] = []

  return {
    attributeUpdates,
    gateway: {
      async updateAttributes(input: UpdateCall) {
        attributeUpdates.push(input)
      },
      async updateUser() {},
    },
    pictures: {
      find: (): Promise<{
        bytes: Buffer
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
        publicToken: string | null
        sha256: string
      } | null> => Promise.resolve(null),
    },
    profileUpdates,
    repository: {
      async findByUserId() {
        return EXISTING
      },
      async findIdentitySubject() {
        return SUBJECT
      },
      async updateProfile(input: UpdateCall) {
        profileUpdates.push(input)
      },
    },
  }
}

function createUseCase(fakes: ReturnType<typeof createFakes>) {
  return createUpdateCompanyUserProfileUseCase({
    identityGateway: fakes.gateway,
    pictures: fakes.pictures,
    publicBaseUrl: 'https://api.test',
    repository: fakes.repository,
  } as unknown as Parameters<typeof createUpdateCompanyUserProfileUseCase>[0])
}

describe('edição de perfil — o documento chega ao banco e ao realm', () => {
  test('o CPF editado é gravado, em vez de descartado em silêncio', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      taxId: '12345678909',
      userId: USER_ID,
    })

    expect(fakes.profileUpdates[0]).toMatchObject({ taxId: '12345678909' })
  })

  test('o telefone editado também para de se perder', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      phone: '11999998888',
      userId: USER_ID,
    })

    expect(fakes.profileUpdates[0]).toMatchObject({ phone: '11999998888' })
  })

  /**
   * O Admin API substitui o conjunto de atributos inteiro. Mandar só o documento apagaria o
   * `company_id`, e o login seguinte entraria sem empresa.
   */
  test('o atributo do realm leva a empresa junto do documento', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      taxId: '12345678909',
      userId: USER_ID,
    })

    expect(fakes.attributeUpdates).toHaveLength(1)
    expect(fakes.attributeUpdates[0]).toMatchObject({
      attributes: { company_id: COMPANY_ID, tax_id: '12345678909' },
      userId: SUBJECT,
    })
  })

  /**
   * O Admin API **substitui o conjunto inteiro** de atributos. Mandar só o que mudou apagava o
   * resto: gravar o CPF derrubava a foto do provedor, e gravar o nome derrubava o CPF. Enquanto
   * ninguém lia o atributo isso era invisível; com a imagem morando lá, é perda de dado.
   *
   * Por isso toda edição escreve a ficha completa, mesmo a que não toca em atributo nenhum.
   */
  test('a escrita de atributo leva a ficha inteira, não só o que mudou', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      name: 'Maria Aparecida',
      userId: USER_ID,
    })

    expect(fakes.attributeUpdates[0]).toMatchObject({
      attributes: { company_id: COMPANY_ID },
      userId: SUBJECT,
    })
  })

  /** A foto vive aqui e o provedor é espelho: ela é relida a cada escrita para não se perder. */
  test('a foto guardada aqui sobrevive a uma edição de documento', async () => {
    const fakes = createFakes()
    const withPicture: ReturnType<typeof createFakes> = {
      ...fakes,
      pictures: {
        find: () =>
          Promise.resolve({
            bytes: Buffer.from([1, 2, 3]),
            mimeType: 'image/png',
            publicToken: 'z'.repeat(43),
            sha256: 'a'.repeat(64),
          }),
      },
    }

    await createUseCase(withPicture).execute({
      context: { companyId: COMPANY_ID },
      taxId: '12345678909',
      userId: USER_ID,
    })

    expect(withPicture.attributeUpdates[0]).toMatchObject({
      attributes: { picture: `https://api.test/public/company-users/${'z'.repeat(43)}/picture` },
    })
  })

  /** O telefone acompanha o documento: os dois servem para achar a pessoa do lado de lá. */
  test('o telefone guardado aqui vai para o provedor', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      phone: '11999998888',
      userId: USER_ID,
    })

    expect(fakes.attributeUpdates[0]).toMatchObject({
      attributes: { phone: '11999998888' },
    })
  })

  /** Apagar o CPF é uma decisão do operador: o atributo sai, e a empresa fica. */
  test('apagar o documento remove o atributo sem derrubar a empresa', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      taxId: '',
      userId: USER_ID,
    })

    expect(fakes.attributeUpdates[0]).toMatchObject({
      attributes: { company_id: COMPANY_ID },
    })
  })
})

/**
 * O login recusado pelo provedor não pode ficar gravado só deste lado. A recusa mais comum é o realm
 * com `editUsernameAllowed` desligado — padrão do Keycloak —, e ali repetir o pedido nunca converge:
 * o banco ficaria para sempre com um login que o provedor não conhece, e quem tentasse entrar com
 * ele não entraria, sem nada na tela dizendo por quê.
 */
describe('edição de perfil — o login recusado pelo provedor volta atrás', () => {
  function createRefusingFakes(): ReturnType<typeof createFakes> {
    const fakes = createFakes()
    return {
      ...fakes,
      gateway: {
        ...fakes.gateway,
        updateUser() {
          return Promise.reject(new Error('PROVEDOR_RECUSOU'))
        },
      },
    }
  }

  test('o erro do provedor sobe, e não é engolido', async () => {
    const fakes = createRefusingFakes()

    await expect(
      createUseCase(fakes).execute({
        context: { companyId: COMPANY_ID },
        userId: USER_ID,
        username: 'maria.silva',
      }),
    ).rejects.toThrow('PROVEDOR_RECUSOU')
  })

  test('o login volta ao valor anterior no banco', async () => {
    const fakes = createRefusingFakes()

    await createUseCase(fakes)
      .execute({ context: { companyId: COMPANY_ID }, userId: USER_ID, username: 'maria.silva' })
      .catch(() => undefined)

    expect(fakes.profileUpdates[0]).toMatchObject({ username: 'maria.silva' })
    expect(fakes.profileUpdates[1]).toMatchObject({ username: EXISTING.username })
  })

  /** Desfazer o resto perderia correção que já valia: só o login não converge ao repetir. */
  test('sem login no pedido, nada é desfeito', async () => {
    const fakes = createRefusingFakes()

    await createUseCase(fakes)
      .execute({ context: { companyId: COMPANY_ID }, name: 'Maria Silva', userId: USER_ID })
      .catch(() => undefined)

    expect(fakes.profileUpdates).toHaveLength(1)
  })
})
