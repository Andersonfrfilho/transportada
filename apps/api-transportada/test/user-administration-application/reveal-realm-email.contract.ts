/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRevealCompanyUsersUseCase } from '../../src/identity/application/reveal-company-users.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const SUBJECT = 'a1b2c3d4-0000-4000-8000-ffffffffffff'

const REVEALED = {
  contact: 'pessoa@empresa.test',
  email: 'pessoa@empresa.test',
  name: 'Maria',
  phone: '',
  taxId: '',
  userId: USER_ID,
} as const

function createFakes(params: { readonly realmEmail?: string; readonly subject?: string } = {}) {
  const listUsersCalls: unknown[] = []

  return {
    gateway: {
      async listUsers(input: unknown) {
        listUsersCalls.push(input)
        return {
          hasMore: false,
          users: [
            {
              email: params.realmEmail ?? 'maria@provedor.test',
              enabled: true,
              subject: SUBJECT,
              taxId: '',
              username: 'maria',
            },
          ],
        }
      },
    },
    listUsersCalls,
    repository: {
      async findForReveal() {
        return [REVEALED]
      },
      async listForReconciliation() {
        return [
          {
            contactAddress: REVEALED.contact,
            contactChannel: 'email',
            email: '',
            hasProfile: true,
            membershipId: 'membership',
            name: REVEALED.name,
            taxId: '',
            userId: USER_ID,
            ...(params.subject === undefined ? { subject: SUBJECT } : { subject: params.subject }),
          },
        ]
      },
      async recordContactReveal() {},
    },
  }
}

function createUseCase(fakes: ReturnType<typeof createFakes>) {
  return createRevealCompanyUsersUseCase(
    fakes as unknown as Parameters<typeof createRevealCompanyUsersUseCase>[0],
  )
}

const INPUT = {
  context: { companyId: COMPANY_ID, userId: 'ator' },
  correlationId: 'correlacao',
  userIds: [USER_ID],
} as const

/**
 * O e-mail do provedor é mascarado na rota de comparação, e revelá-lo é a única forma de conferir se
 * os dois lados guardam o mesmo endereço. Ele sai pelo mesmo `users.reveal` do resto, e pela mesma
 * razão: mostrar dado pessoal sem máscara é ação com trilha.
 */
describe('revelar o e-mail do provedor', () => {
  test('sai quando pedido, sem máscara', async () => {
    const fakes = createFakes()

    const [revealed] = await createUseCase(fakes).execute({ ...INPUT, includeRealm: true })

    expect(revealed?.realmEmail).toBe('maria@provedor.test')
  })

  /** A listagem revela uma página inteira e não desenha este campo: pagar rede ali é desperdício. */
  test('não é pedido, não custa leitura do realm', async () => {
    const fakes = createFakes()

    const [revealed] = await createUseCase(fakes).execute(INPUT)

    expect(revealed?.realmEmail).toBeUndefined()
    expect(fakes.listUsersCalls).toHaveLength(0)
  })

  /**
   * O casamento é pelo `subject` gravado. Casar por e-mail seria usar o palpite do algoritmo para
   * decidir de quem é o endereço a mostrar sem máscara — e mostrar o de outra pessoa é pior do que
   * não mostrar nenhum.
   */
  test('sem vínculo gravado, nenhum e-mail do provedor é atribuído', async () => {
    const fakes = createFakes({ subject: 'outro-subject' })

    const [revealed] = await createUseCase(fakes).execute({ ...INPUT, includeRealm: true })

    expect(revealed?.realmEmail).toBe('')
  })

  /** Conta que nasceu pelo botão de sincronizar não tem e-mail: vazio é resposta, não falha. */
  test('conta do provedor sem e-mail devolve vazio, e não erro', async () => {
    const fakes = createFakes({ realmEmail: '' })

    const [revealed] = await createUseCase(fakes).execute({ ...INPUT, includeRealm: true })

    expect(revealed?.realmEmail).toBe('')
  })
})
