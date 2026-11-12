/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b: a forma dos contatos do cliente no `/me` do motorista — número vira E.164 antes de guardar, e-mail fora
 * da forma é 400, e o caso de uso nunca devolve o endereço em claro (o repositório já entrega mascarado).
 */
import { describe, expect, test } from 'bun:test'

import { createDriverClientContactsUseCase } from '../../src/delivery-clients/application/driver-client-contacts.use-case.js'
import type { DriverClientContactRepositoryPort } from '../../src/delivery-clients/application/driver-client-contact.port.js'

const actor = { companyId: 'c', correlationId: 'k', driverId: 'd', userId: 'u' }

function repositoryOf(overrides: Partial<DriverClientContactRepositoryPort> = {}) {
  const saved: string[] = []
  const repository: DriverClientContactRepositoryPort = {
    create: (input) => {
      saved.push(input.address)
      return Promise.resolve({
        contact: {
          addressMasked: '***',
          channel: input.channel,
          contactId: 'x',
          editable: true,
          label: input.label,
        },
        created: true,
      })
    },
    list: () => Promise.resolve([]),
    remove: () => Promise.resolve(true),
    update: () => Promise.resolve(null),
    ...overrides,
  }
  return { repository, saved }
}

describe('contatos do cliente para o motorista (spec 281 T8b)', () => {
  test('o número é normalizado para E.164 antes de guardar', async () => {
    const { repository, saved } = repositoryOf()
    const useCase = createDriverClientContactsUseCase({ repository })
    await useCase.add({
      actor,
      address: '(16) 99999-1111',
      channel: 'whatsapp',
      documentId: 'n',
      label: '',
    })
    expect(saved).toEqual(['+5516999991111'])
  })

  test('número e e-mail fora da forma são recusados sem tocar o repositório', async () => {
    const { repository, saved } = repositoryOf()
    const useCase = createDriverClientContactsUseCase({ repository })
    await expect(
      useCase.add({ actor, address: '12', channel: 'whatsapp', documentId: 'n', label: '' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      useCase.add({ actor, address: 'a@b', channel: 'email', documentId: 'n', label: '' }),
    ).rejects.toMatchObject({ code: 'DRIVER_CLIENT_EMAIL_INVALID' })
    expect(saved).toEqual([])
  })

  test('nota fora da viagem do motorista é 404 e contato alheio também', async () => {
    const { repository } = repositoryOf({
      create: () => Promise.resolve(null),
      list: () => Promise.resolve(null),
      remove: () => Promise.resolve(false),
    })
    const useCase = createDriverClientContactsUseCase({ repository })
    await expect(useCase.list({ actor, documentId: 'n' })).rejects.toMatchObject({ status: 404 })
    await expect(
      useCase.add({ actor, address: 'a@b.co', channel: 'email', documentId: 'n', label: '' }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(useCase.remove({ actor, contactId: 'c', documentId: 'n' })).rejects.toMatchObject({
      code: 'DRIVER_CLIENT_CONTACT_NOT_FOUND',
    })
  })
})
