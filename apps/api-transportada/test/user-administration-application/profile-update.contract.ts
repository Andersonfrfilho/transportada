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

  test('edição que não toca no documento não mexe nos atributos', async () => {
    const fakes = createFakes()

    await createUseCase(fakes).execute({
      context: { companyId: COMPANY_ID },
      name: 'Maria Aparecida',
      userId: USER_ID,
    })

    expect(fakes.attributeUpdates).toHaveLength(0)
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
