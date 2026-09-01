/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O motorista e o agregado já existem em `fleet_drivers` antes do convite, e criar a ficha é que
 * costuma disparar o convite. Convidar pela tela de usuários é a porta contrária: sem casar o CPF
 * com a ficha existente, a mesma pessoa vira duas — usuário com papel Motorista que a frota não
 * conhece.
 */
import { describe, expect, test } from 'bun:test'

import {
  createInviteCompanyUserUseCase,
  type InviteCompanyUserInput,
} from '../../src/identity/application/invite-company-user.use-case.js'
import type { CreateInvitedUserInput } from '../../src/identity/application/company-user.port.js'
import {
  COMPANY_ID,
  createIdentityGatewayFake,
  createInvitationDeliveryFakes,
  createInvitationRepositoryFake,
} from '../fixtures/keycloak-sync.fixture'

const FLEET_DRIVER_ID = '7c9f1f2a-4a3b-4c5d-8e9f-0a1b2c3d4e5f'

function createRepositorySpy({ linkedFleetDriverId }: { linkedFleetDriverId: string | null }) {
  const calls: CreateInvitedUserInput[] = []
  return {
    calls,
    repository: {
      createInvitedUser(input: CreateInvitedUserInput) {
        calls.push(input)
        return Promise.resolve({ linkedFleetDriverId, membershipId: 'vinculo-de-teste' })
      },
    },
  }
}

async function invite({
  input,
  linkedFleetDriverId,
}: {
  input: Omit<InviteCompanyUserInput, 'context'>
  linkedFleetDriverId: string | null
}) {
  const { calls, repository } = createRepositorySpy({ linkedFleetDriverId })
  const result = await createInviteCompanyUserUseCase({
    ...createInvitationDeliveryFakes(),
    identityGateway: createIdentityGatewayFake(),
    invitations: createInvitationRepositoryFake(),
    issuer: 'https://keycloak.test/realms/transportada',
    now: () => new Date('2026-08-26T12:00:00.000Z'),
    repository,
  }).execute({ ...input, context: { companyId: COMPANY_ID } })
  return { calls, result }
}

describe('convite de usuário — vínculo com a ficha de frota', () => {
  test('papel de motorista com ficha encontrada relata o vínculo', async () => {
    const { result } = await invite({
      input: {
        channel: 'email',
        contact: 'motorista@empresa.test',
        name: 'Motorista Existente',
        roles: ['driver'],
        taxId: '12345678909',
      },
      linkedFleetDriverId: FLEET_DRIVER_ID,
    })

    expect(result.fleetLink).toBe('linked')
  })

  /**
   * Não é erro: convidar antes de cadastrar a ficha é caminho legítimo. Mas quem convidou precisa
   * saber, senão só descobre quando for montar uma viagem e a pessoa não estiver na frota.
   */
  test('papel de motorista sem ficha correspondente avisa em vez de falhar', async () => {
    const { result } = await invite({
      input: {
        channel: 'email',
        contact: 'novo@empresa.test',
        name: 'Motorista Sem Ficha',
        roles: ['driver'],
        taxId: '12345678909',
      },
      linkedFleetDriverId: null,
    })

    expect(result.fleetLink).toBe('no-driver-record')
  })

  test('o agregado procura ficha pelo mesmo caminho do motorista', async () => {
    const { result } = await invite({
      input: {
        channel: 'email',
        contact: 'agregado@empresa.test',
        name: 'Agregado Existente',
        roles: ['aggregate'],
        taxId: '12345678909',
      },
      linkedFleetDriverId: FLEET_DRIVER_ID,
    })

    expect(result.fleetLink).toBe('linked')
  })

  /** Fiscal e Financeiro não têm ficha de frota: procurar por eles seria ruído na tela. */
  test('papel sem frota não relata ausência de ficha', async () => {
    const { result } = await invite({
      input: {
        channel: 'email',
        contact: 'fiscal@empresa.test',
        name: 'Fiscal',
        roles: ['fiscal'],
        taxId: '12345678909',
      },
      linkedFleetDriverId: null,
    })

    expect(result.fleetLink).toBe('not-applicable')
  })
})

describe('convite de usuário — identidade separada do canal', () => {
  /**
   * O contato diz por onde o código sai, não quem a pessoa é. Antes destes campos, convidar por
   * WhatsApp deixava o perfil sem e-mail nenhum.
   */
  test('canal de e-mail preenche o e-mail do perfil quando nenhum foi informado', async () => {
    const { calls } = await invite({
      input: {
        channel: 'email',
        contact: 'pessoa@empresa.test',
        name: 'Pessoa',
        roles: ['operator'],
      },
      linkedFleetDriverId: null,
    })

    expect(calls[0]?.email).toBe('pessoa@empresa.test')
    expect(calls[0]?.phone).toBe('')
  })

  test('canal de WhatsApp preenche o telefone, e o e-mail informado sobrevive', async () => {
    const { calls } = await invite({
      input: {
        channel: 'whatsapp',
        contact: '11999998888',
        email: 'pessoa@empresa.test',
        name: 'Pessoa',
        roles: ['operator'],
      },
      linkedFleetDriverId: null,
    })

    expect(calls[0]?.phone).toBe('11999998888')
    expect(calls[0]?.email).toBe('pessoa@empresa.test')
  })

  /** Mascarar é do jeito do contato: a listagem serve para reconhecer, não para exportar a ficha. */
  test('a resposta não devolve o CPF por extenso', async () => {
    const { result } = await invite({
      input: {
        channel: 'email',
        contact: 'pessoa@empresa.test',
        name: 'Pessoa',
        roles: ['operator'],
        taxId: '12345678909',
      },
      linkedFleetDriverId: null,
    })

    expect(result.taxId).not.toContain('12345678')
    expect(result.taxId).toBe('***09')
  })
})
