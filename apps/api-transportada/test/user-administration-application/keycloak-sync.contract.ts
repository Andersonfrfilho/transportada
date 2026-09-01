/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * R6 da feature 026: toda mudança de situação chega ao Keycloak, e o Admin API é sempre endereçado
 * pelo `subject` do provedor — nunca pelo `identity_users.id` da aplicação.
 */
import { describe, expect, test } from 'bun:test'

import { createActivateInvitationUseCase } from '../../src/identity/application/activate-invitation.use-case.js'
import { createChangeCompanyUserStatusUseCase } from '../../src/identity/application/change-company-user-status.use-case.js'
import { createInviteCompanyUserUseCase } from '../../src/identity/application/invite-company-user.use-case.js'
import { createRemoveCompanyUserMembershipUseCase } from '../../src/identity/application/remove-company-user-membership.use-case.js'
import {
  ACTIVATION_CODE,
  ANOTHER_COMPANY_ID,
  COMPANY_ID,
  createIdentityGatewayFake,
  createInvitationDeliveryFakes,
  createInvitationRepositoryFake,
  createCompanyUserRepositoryFake,
  KEYCLOAK_SUBJECT,
  TARGET_USER_ID,
} from '../fixtures/keycloak-sync.fixture'

describe('sincronização com o Keycloak — convite', () => {
  test('grava nome e a empresa como atributo no usuário criado', async () => {
    const gateway = createIdentityGatewayFake()
    const repository = createCompanyUserRepositoryFake()
    const invitations = createInvitationRepositoryFake()

    await createInviteCompanyUserUseCase({
      ...createInvitationDeliveryFakes(),
      identityGateway: gateway,
      invitations,
      issuer: 'https://keycloak.test/realms/transportada',
      now: () => new Date('2026-08-06T12:00:00.000Z'),
      repository,
    }).execute({
      channel: 'email',
      contact: 'pessoa@empresa.test',
      context: { companyId: COMPANY_ID },
      name: 'Maria Aparecida Souza',
      roles: ['operator'],
    })

    expect(gateway.createUserCalls).toHaveLength(1)
    expect(gateway.createUserCalls[0]).toMatchObject({
      attributes: { company_id: COMPANY_ID },
      firstName: 'Maria',
      lastName: 'Aparecida Souza',
    })
  })

  /**
   * ⚠️ A decisão mudou em 31/08/2026: o telefone **passa** a viver no realm, ao lado do documento,
   * porque o provedor é onde a identificação da pessoa tem de estar completa. Quando o canal do
   * convite é telefone, contato e telefone são o mesmo valor por construção — não há como guardar um
   * e não o outro. O que continua fora, e não se negocia, é a senha.
   */
  test('a senha nunca entra nos atributos', async () => {
    const gateway = createIdentityGatewayFake()

    await createInviteCompanyUserUseCase({
      ...createInvitationDeliveryFakes(),
      identityGateway: gateway,
      invitations: createInvitationRepositoryFake(),
      issuer: 'https://keycloak.test/realms/transportada',
      now: () => new Date('2026-08-06T12:00:00.000Z'),
      repository: createCompanyUserRepositoryFake(),
    }).execute({
      channel: 'whatsapp',
      contact: '11999998888',
      context: { companyId: COMPANY_ID },
      name: 'João',
      roles: ['viewer'],
    })

    const attributes = gateway.createUserCalls[0]?.attributes ?? {}
    const values = Object.values(attributes).join(' ')

    expect(values).not.toContain('password')
    expect(gateway.createUserCalls[0]).not.toHaveProperty('credentials')
  })

  test('o telefone do convite vai para o provedor, por decisão de 31/08/2026', async () => {
    const gateway = createIdentityGatewayFake()

    await createInviteCompanyUserUseCase({
      ...createInvitationDeliveryFakes(),
      identityGateway: gateway,
      invitations: createInvitationRepositoryFake(),
      issuer: 'https://keycloak.test/realms/transportada',
      now: () => new Date('2026-08-06T12:00:00.000Z'),
      repository: createCompanyUserRepositoryFake(),
    }).execute({
      channel: 'whatsapp',
      contact: '11999998888',
      context: { companyId: COMPANY_ID },
      name: 'João',
      roles: ['viewer'],
    })

    const attributes = gateway.createUserCalls[0]?.attributes ?? {}
    expect(Object.values(attributes)).toContain('11999998888')
  })

  /**
   * O documento é o degrau que casa a pessoa dos dois lados na reconciliação: escrevê-lo só na
   * edição deixaria todo convite novo fora do casamento, e o e-mail é ambíguo por natureza.
   */
  test('grava o documento como atributo, ao lado da empresa', async () => {
    const gateway = createIdentityGatewayFake()

    await createInviteCompanyUserUseCase({
      ...createInvitationDeliveryFakes(),
      identityGateway: gateway,
      invitations: createInvitationRepositoryFake(),
      issuer: 'https://keycloak.test/realms/transportada',
      now: () => new Date('2026-08-06T12:00:00.000Z'),
      repository: createCompanyUserRepositoryFake(),
    }).execute({
      channel: 'email',
      contact: 'pessoa@empresa.test',
      context: { companyId: COMPANY_ID },
      name: 'Maria',
      roles: ['operator'],
      taxId: '12345678909',
    })

    expect(gateway.createUserCalls[0]?.attributes).toEqual({
      company_id: COMPANY_ID,
      tax_id: '12345678909',
    })
  })

  /** Atributo vazio não é dado: gravá-lo faria a reconciliação casar dois brancos como a mesma. */
  test('sem documento, o atributo não é inventado', async () => {
    const gateway = createIdentityGatewayFake()

    await createInviteCompanyUserUseCase({
      ...createInvitationDeliveryFakes(),
      identityGateway: gateway,
      invitations: createInvitationRepositoryFake(),
      issuer: 'https://keycloak.test/realms/transportada',
      now: () => new Date('2026-08-06T12:00:00.000Z'),
      repository: createCompanyUserRepositoryFake(),
    }).execute({
      channel: 'email',
      contact: 'pessoa@empresa.test',
      context: { companyId: COMPANY_ID },
      name: 'Maria',
      roles: ['operator'],
    })

    expect(gateway.createUserCalls[0]?.attributes).toEqual({ company_id: COMPANY_ID })
  })
})

describe('sincronização com o Keycloak — ativação', () => {
  test('endereça o Admin API pelo subject do provedor, não pelo id interno', async () => {
    const gateway = createIdentityGatewayFake()
    const invitations = createInvitationRepositoryFake({ withPendingCode: ACTIVATION_CODE })

    await createActivateInvitationUseCase({
      identities: { findIdentitySubject: async () => KEYCLOAK_SUBJECT },
      identityProvider: gateway,
      invitations,
      now: () => new Date('2026-08-06T12:00:00.000Z'),
    }).execute({ code: ACTIVATION_CODE, password: 'senha-de-teste-nao-real' })

    expect(gateway.setPasswordCalls[0]?.userId).toBe(KEYCLOAK_SUBJECT)
    expect(gateway.setEnabledCalls[0]).toMatchObject({ enabled: true, userId: KEYCLOAK_SUBJECT })
    expect(gateway.setPasswordCalls[0]?.userId).not.toBe(TARGET_USER_ID)
  })
})

describe('sincronização com o Keycloak — situação do vínculo', () => {
  test('suspender desabilita o usuário no provedor', async () => {
    const gateway = createIdentityGatewayFake()
    const repository = createCompanyUserRepositoryFake()

    await createChangeCompanyUserStatusUseCase({ identityGateway: gateway, repository }).execute({
      context: { companyId: COMPANY_ID },
      status: 'suspended',
      userId: TARGET_USER_ID,
    })

    expect(gateway.setEnabledCalls).toEqual([{ enabled: false, userId: KEYCLOAK_SUBJECT }])
  })

  test('reativar habilita o usuário no provedor', async () => {
    const gateway = createIdentityGatewayFake()
    const repository = createCompanyUserRepositoryFake({ membershipStatus: 'disabled' })

    await createChangeCompanyUserStatusUseCase({ identityGateway: gateway, repository }).execute({
      context: { companyId: COMPANY_ID },
      status: 'active',
      userId: TARGET_USER_ID,
    })

    expect(gateway.setEnabledCalls).toEqual([{ enabled: true, userId: KEYCLOAK_SUBJECT }])
  })

  test('não desabilita quem ainda tem vínculo ativo em outra empresa', async () => {
    const gateway = createIdentityGatewayFake()
    const repository = createCompanyUserRepositoryFake({
      activeMembershipCompanyIds: [COMPANY_ID, ANOTHER_COMPANY_ID],
    })

    await createChangeCompanyUserStatusUseCase({ identityGateway: gateway, repository }).execute({
      context: { companyId: COMPANY_ID },
      status: 'suspended',
      userId: TARGET_USER_ID,
    })

    expect(gateway.setEnabledCalls).toEqual([])
    expect(repository.setMembershipStatusCalls).toHaveLength(1)
  })

  test('falha do provedor ao desabilitar reprova a operação antes de tocar no banco', async () => {
    const gateway = createIdentityGatewayFake({ failSetEnabled: true })
    const repository = createCompanyUserRepositoryFake()

    const useCase = createChangeCompanyUserStatusUseCase({ identityGateway: gateway, repository })
    const execution = useCase.execute({
      context: { companyId: COMPANY_ID },
      status: 'suspended',
      userId: TARGET_USER_ID,
    })

    await expect(execution).rejects.toThrow()
    expect(repository.setMembershipStatusCalls).toEqual([])
  })

  test('falha do provedor ao habilitar deixa o usuário sem acesso, nunca com acesso indevido', async () => {
    const gateway = createIdentityGatewayFake({ failSetEnabled: true })
    const repository = createCompanyUserRepositoryFake({ membershipStatus: 'disabled' })

    const useCase = createChangeCompanyUserStatusUseCase({ identityGateway: gateway, repository })
    const execution = useCase.execute({
      context: { companyId: COMPANY_ID },
      status: 'active',
      userId: TARGET_USER_ID,
    })

    await expect(execution).rejects.toThrow()
    expect(gateway.setEnabledCalls).toEqual([])
  })
})

describe('sincronização com o Keycloak — remoção de vínculo', () => {
  test('remover o último vínculo desabilita o usuário no provedor', async () => {
    const gateway = createIdentityGatewayFake()
    const repository = createCompanyUserRepositoryFake()

    await createRemoveCompanyUserMembershipUseCase({
      identityGateway: gateway,
      repository,
    }).execute({
      context: { companyId: COMPANY_ID, userId: '00000000-0000-4000-8000-0000000000aa' },
      userId: TARGET_USER_ID,
    })

    expect(gateway.setEnabledCalls).toEqual([{ enabled: false, userId: KEYCLOAK_SUBJECT }])
    expect(repository.removeMembershipCalls).toHaveLength(1)
  })

  test('remover um vínculo entre vários não desabilita o usuário no provedor', async () => {
    const gateway = createIdentityGatewayFake()
    const repository = createCompanyUserRepositoryFake({
      activeMembershipCompanyIds: [COMPANY_ID, ANOTHER_COMPANY_ID],
    })

    await createRemoveCompanyUserMembershipUseCase({
      identityGateway: gateway,
      repository,
    }).execute({
      context: { companyId: COMPANY_ID, userId: '00000000-0000-4000-8000-0000000000aa' },
      userId: TARGET_USER_ID,
    })

    expect(gateway.setEnabledCalls).toEqual([])
    expect(repository.removeMembershipCalls).toHaveLength(1)
  })
})
