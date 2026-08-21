/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createFleetDriversUseCase } from '../../src/fleet/application/fleet-drivers.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  createDriverAccountStub,
  createDriverContactDirectoryStub,
  createDriverRepositoryStub,
  FLEET_CONTEXT,
} from '../fixtures/fleet-application.fixture'
import {
  CREATE_DRIVER_BODY,
  DRIVER_FIELDS,
  DRIVER_ID,
  DRIVER_INPUT,
  MEMBERSHIP_ID,
} from '../fixtures/fleet-http-payload.fixture'

const CORRELATION_ID = 'fleet-drivers-application'

describe('fleet drivers use case contract', () => {
  // O motorista nasce usuário do sistema: quem cadastra não digita vínculo nenhum
  test('opens the system user with the chosen profile and links the driver to it', async () => {
    const stub = createDriverRepositoryStub()
    const account = createDriverAccountStub()
    const useCase = createFleetDriversUseCase({
      account: account.account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: stub.repository,
    })

    await useCase.create({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driver: DRIVER_FIELDS,
      profile: 'aggregate',
    })

    expect(account.calls).toEqual([
      {
        channel: 'email',
        contact: CREATE_DRIVER_BODY.email,
        context: { companyId: FLEET_CONTEXT.companyId },
        correlationId: CORRELATION_ID,
        name: CREATE_DRIVER_BODY.name,
        roles: ['aggregate'],
      },
    ])
    expect(stub.createCalls).toEqual([
      {
        companyId: FLEET_CONTEXT.companyId,
        driver: { ...DRIVER_INPUT, membershipId: MEMBERSHIP_ID },
      },
    ])
    // O vínculo acabou de nascer nesta empresa: conferi-lo seria consultar o que se escreveu
    expect(stub.membershipCalls).toEqual([])
  })

  // O motorista entrega pelo app dele: sem e-mail, o convite sai pelo telefone
  test('sends the invitation over whatsapp when the driver has only a phone', async () => {
    const stub = createDriverRepositoryStub()
    const account = createDriverAccountStub()
    const useCase = createFleetDriversUseCase({
      account: account.account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: stub.repository,
    })

    await useCase.create({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driver: { ...DRIVER_FIELDS, email: '' },
      profile: 'driver',
    })

    expect(account.calls).toEqual([
      {
        channel: 'whatsapp',
        contact: CREATE_DRIVER_BODY.phone,
        context: { companyId: FLEET_CONTEXT.companyId },
        correlationId: CORRELATION_ID,
        name: CREATE_DRIVER_BODY.name,
        roles: ['driver'],
      },
    ])
  })

  test('refuses a driver with neither e-mail nor phone', async () => {
    const stub = createDriverRepositoryStub()
    const account = createDriverAccountStub()
    const useCase = createFleetDriversUseCase({
      account: account.account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: stub.repository,
    })

    const failure = await useCase
      .create({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        driver: { ...DRIVER_FIELDS, email: '', phone: '' },
        profile: 'driver',
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(422)
    expect((failure as ApiError).code).toBe('FLEET_DRIVER_CONTACT_REQUIRED')
    expect(account.calls).toEqual([])
    expect(stub.createCalls).toEqual([])
  })

  // O membership tem que ser desta empresa — o vínculo do motorista nunca atravessa o tenant
  test('checks the membership inside the company before linking it on update', async () => {
    const stub = createDriverRepositoryStub()
    const useCase = createFleetDriversUseCase({
      account: createDriverAccountStub().account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: stub.repository,
    })

    await useCase.update({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driver: { ...DRIVER_INPUT, membershipId: MEMBERSHIP_ID },
      driverId: DRIVER_ID,
      expectedVersion: '1',
      status: 'active',
    })

    expect(stub.membershipCalls).toEqual([
      { companyId: FLEET_CONTEXT.companyId, membershipId: MEMBERSHIP_ID },
    ])
  })

  test('refuses a membership that does not belong to the company', async () => {
    const stub = createDriverRepositoryStub({ membershipBelongs: false })
    const useCase = createFleetDriversUseCase({
      account: createDriverAccountStub().account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: stub.repository,
    })

    const failure = await useCase
      .update({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        driver: { ...DRIVER_INPUT, membershipId: MEMBERSHIP_ID },
        driverId: DRIVER_ID,
        expectedVersion: '1',
        status: 'active',
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(422)
    expect((failure as ApiError).code).toBe('FLEET_DRIVER_MEMBERSHIP_NOT_FOUND')
    expect(stub.updateCalls).toEqual([])
  })

  test('separates the stale version from the missing driver on update', async () => {
    const conflictUseCase = createFleetDriversUseCase({
      account: createDriverAccountStub().account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: createDriverRepositoryStub({ updated: null }).repository,
    })
    const missingUseCase = createFleetDriversUseCase({
      account: createDriverAccountStub().account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: createDriverRepositoryStub({ current: null, updated: null }).repository,
    })
    const input = {
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driver: DRIVER_INPUT,
      driverId: DRIVER_ID,
      expectedVersion: '1',
      status: 'active',
    } as const

    const conflict = await conflictUseCase.update(input).catch((error: unknown) => error)
    const missing = await missingUseCase.update(input).catch((error: unknown) => error)

    expect((conflict as ApiError).code).toBe('FLEET_DRIVER_VERSION_CONFLICT')
    expect((conflict as ApiError).status).toBe(409)
    expect((missing as ApiError).code).toBe('FLEET_DRIVER_NOT_FOUND')
    expect((missing as ApiError).status).toBe(404)
  })

  /**
   * O CPF é único por empresa, e o usuário nasce antes da ficha: sem esta conferência o convite
   * abriria uma conta no provedor de identidade que o `INSERT` seguinte jogaria fora.
   */
  test('refuses a tax id already used before opening the system user', async () => {
    const stub = createDriverRepositoryStub({ conflicts: { licenseNumber: false, taxId: true } })
    const account = createDriverAccountStub()
    const useCase = createFleetDriversUseCase({
      account: account.account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: stub.repository,
    })

    const failure = await useCase
      .create({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        driver: DRIVER_FIELDS,
        profile: 'driver',
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(409)
    expect((failure as ApiError).code).toBe('FLEET_DRIVER_TAX_ID_TAKEN')
    expect(stub.conflictCalls).toEqual([
      {
        companyId: FLEET_CONTEXT.companyId,
        driverId: null,
        licenseNumber: DRIVER_FIELDS.licenseNumber,
        taxId: DRIVER_FIELDS.taxId,
      },
    ])
    expect(account.calls).toEqual([])
    expect(stub.createCalls).toEqual([])
  })

  test('refuses a license number already used before opening the system user', async () => {
    const stub = createDriverRepositoryStub({ conflicts: { licenseNumber: true, taxId: false } })
    const account = createDriverAccountStub()
    const useCase = createFleetDriversUseCase({
      account: account.account,
      contacts: createDriverContactDirectoryStub().contacts,
      repository: stub.repository,
    })

    const failure = await useCase
      .create({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        driver: DRIVER_FIELDS,
        profile: 'driver',
      })
      .catch((error: unknown) => error)

    expect((failure as ApiError).status).toBe(409)
    expect((failure as ApiError).code).toBe('FLEET_DRIVER_LICENSE_NUMBER_TAKEN')
    expect(account.calls).toEqual([])
    expect(stub.createCalls).toEqual([])
  })

  // O e-mail é único no provedor de identidade, não na tabela: quem sabe da colisão é ele
  test('refuses an e-mail already taken in the identity provider', async () => {
    const stub = createDriverRepositoryStub()
    const account = createDriverAccountStub()
    const contacts = createDriverContactDirectoryStub({ emailTaken: true })
    const useCase = createFleetDriversUseCase({
      account: account.account,
      contacts: contacts.contacts,
      repository: stub.repository,
    })

    const failure = await useCase
      .create({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        driver: DRIVER_FIELDS,
        profile: 'driver',
      })
      .catch((error: unknown) => error)

    expect((failure as ApiError).status).toBe(409)
    expect((failure as ApiError).code).toBe('FLEET_DRIVER_EMAIL_TAKEN')
    expect(contacts.calls).toEqual([{ email: DRIVER_FIELDS.email }])
    expect(account.calls).toEqual([])
    expect(stub.createCalls).toEqual([])
  })

  // Campo vazio é ausência, não colisão: o motorista sem e-mail entrega pelo telefone
  test('skips the directory when the driver has no e-mail', async () => {
    const stub = createDriverRepositoryStub()
    const contacts = createDriverContactDirectoryStub({ emailTaken: true })
    const useCase = createFleetDriversUseCase({
      account: createDriverAccountStub().account,
      contacts: contacts.contacts,
      repository: stub.repository,
    })

    await useCase.create({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driver: { ...DRIVER_FIELDS, email: '' },
      profile: 'driver',
    })

    expect(contacts.calls).toEqual([])
    expect(stub.createCalls).toHaveLength(1)
  })

  /** A conferência prévia do formulário: ela responde por campo, e não decide nada sozinha. */
  test('answers the availability of each unique field', async () => {
    const stub = createDriverRepositoryStub({ conflicts: { licenseNumber: false, taxId: true } })
    const contacts = createDriverContactDirectoryStub({ emailTaken: true })
    const useCase = createFleetDriversUseCase({
      account: createDriverAccountStub().account,
      contacts: contacts.contacts,
      repository: stub.repository,
    })

    const availability = await useCase.checkAvailability({
      context: FLEET_CONTEXT,
      driverId: DRIVER_ID,
      email: DRIVER_FIELDS.email,
      licenseNumber: DRIVER_FIELDS.licenseNumber,
      taxId: DRIVER_FIELDS.taxId,
    })

    expect(availability).toEqual({
      emailTaken: true,
      licenseNumberTaken: false,
      taxIdTaken: true,
    })
    // A ficha aberta não colide consigo mesma: o id sai do recorte da consulta
    expect(stub.conflictCalls).toEqual([
      {
        companyId: FLEET_CONTEXT.companyId,
        driverId: DRIVER_ID,
        licenseNumber: DRIVER_FIELDS.licenseNumber,
        taxId: DRIVER_FIELDS.taxId,
      },
    ])
  })

  test('leaves an empty field out of the availability check', async () => {
    const stub = createDriverRepositoryStub({ conflicts: { licenseNumber: true, taxId: true } })
    const contacts = createDriverContactDirectoryStub({ emailTaken: true })
    const useCase = createFleetDriversUseCase({
      account: createDriverAccountStub().account,
      contacts: contacts.contacts,
      repository: stub.repository,
    })

    const availability = await useCase.checkAvailability({
      context: FLEET_CONTEXT,
      driverId: null,
      email: '',
      licenseNumber: '',
      taxId: '',
    })

    expect(availability).toEqual({
      emailTaken: false,
      licenseNumberTaken: false,
      taxIdTaken: false,
    })
    expect(stub.conflictCalls).toEqual([])
    expect(contacts.calls).toEqual([])
  })
})
