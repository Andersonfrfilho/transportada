/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CteEmissionProfileSettingsInput } from '../../src/cte-profiles/application/cte-emission-profile.port.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  COMPANY_ID,
  COMPONENTS,
  CONTEXT,
  CORRELATION_ID,
  createCteProfilesFixture,
  type CteProfilesFixture,
  FREIGHT_RULE,
  IDEMPOTENCY_KEY,
  MATCHERS,
  OTHER_COMPANY_ID,
  PROFILE_ID,
  PROFILE_SETTINGS,
} from '../fixtures/cte-profiles-application.fixture.js'
import { expectApiErrorCode } from './support.js'

const ACTIVE_NFSE_PROFILE_ID = '00000000-0000-4000-8000-0000000a0001'
const INACTIVE_NFSE_PROFILE_ID = '00000000-0000-4000-8000-0000000a0002'
const FOREIGN_NFSE_PROFILE_ID = '00000000-0000-4000-8000-0000000a0003'

function createFixture(): CteProfilesFixture {
  return createCteProfilesFixture({
    nfseProfiles: [
      { companyId: COMPANY_ID, id: ACTIVE_NFSE_PROFILE_ID, status: 'active' },
      { companyId: COMPANY_ID, id: INACTIVE_NFSE_PROFILE_ID, status: 'inactive' },
      { companyId: OTHER_COMPANY_ID, id: FOREIGN_NFSE_PROFILE_ID, status: 'active' },
    ],
  })
}

function createInput(settings: CteEmissionProfileSettingsInput) {
  return {
    components: COMPONENTS,
    context: CONTEXT,
    correlationId: CORRELATION_ID,
    freightRule: FREIGHT_RULE,
    idempotencyKey: IDEMPOTENCY_KEY,
    matchers: MATCHERS,
    settings,
  }
}

function updateInput(fixture: CteProfilesFixture, settings: CteEmissionProfileSettingsInput) {
  return {
    components: COMPONENTS,
    context: CONTEXT,
    correlationId: CORRELATION_ID,
    expectedVersion: fixture.profileOf(PROFILE_ID).version,
    freightRule: FREIGHT_RULE,
    matchers: MATCHERS,
    profileId: PROFILE_ID,
    settings,
  }
}

const OUTPUT_FIELDS = new Set(['nfseEmissionProfileId', 'outputDocument'])

/** O que a rota antiga manda: nenhum dos dois campos da spec 144. */
function withoutOutputFields(): CteEmissionProfileSettingsInput {
  return Object.fromEntries(
    Object.entries(PROFILE_SETTINGS).filter(([key]) => !OUTPUT_FIELDS.has(key)),
  ) as CteEmissionProfileSettingsInput
}

const NFSE_SETTINGS = {
  ...PROFILE_SETTINGS,
  nfseEmissionProfileId: ACTIVE_NFSE_PROFILE_ID,
  outputDocument: 'nfse',
} as const satisfies CteEmissionProfileSettingsInput

describe('o perfil de CT-e diz qual documento fiscal sai (spec 144 D3)', () => {
  test('um perfil criado sem os campos novos nasce emitindo CT-e, sem perfil NFS-e', async () => {
    const fixture = createFixture()

    const created = await fixture.useCase.create(createInput(withoutOutputFields()))

    expect(created.outputDocument).toBe('cte')
    expect(created.nfseEmissionProfileId).toBeNull()
  })

  test('aponta para um perfil NFS-e ativo da empresa e grava os dois campos no audit log', async () => {
    const fixture = createFixture()

    const created = await fixture.useCase.create(createInput(NFSE_SETTINGS))

    expect(created.outputDocument).toBe('nfse')
    expect(created.nfseEmissionProfileId).toBe(ACTIVE_NFSE_PROFILE_ID)
    expect(fixture.audits.at(-1)?.afterSnapshot).toMatchObject({
      nfseEmissionProfileId: ACTIVE_NFSE_PROFILE_ID,
      outputDocument: 'nfse',
    })
  })

  test('recusa as combinações que os CHECKs proíbem, com todos os motivos de uma vez', async () => {
    const fixture = createFixture()
    let failure: unknown

    try {
      await fixture.useCase.create(
        createInput({
          ...PROFILE_SETTINGS,
          municipalServicePolicy: 'block',
          nfseEmissionProfileId: null,
          outputDocument: 'nfse',
        }),
      )
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(400)
    expect((failure as ApiError).code).toBe('CTE_PROFILE_OUTPUT_DOCUMENT_INCOHERENT')
    expect((failure as ApiError).details?.map((detail) => detail.field)).toEqual([
      'nfseEmissionProfileId',
      'municipalServicePolicy',
    ])
    expect(fixture.audits).toEqual([])
  })

  test('recusa ponteiro para perfil NFS-e em perfil que emite CT-e', async () => {
    const fixture = createFixture()

    await expectApiErrorCode(
      () =>
        fixture.useCase.create(
          createInput({ ...PROFILE_SETTINGS, nfseEmissionProfileId: ACTIVE_NFSE_PROFILE_ID }),
        ),
      'CTE_PROFILE_OUTPUT_DOCUMENT_INCOHERENT',
    )
  })

  test('recusa perfil NFS-e inativo, e o de outra empresa responde igual', async () => {
    const fixture = createFixture()

    await expectApiErrorCode(
      () =>
        fixture.useCase.create(
          createInput({ ...NFSE_SETTINGS, nfseEmissionProfileId: INACTIVE_NFSE_PROFILE_ID }),
        ),
      'CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE',
    )
    await expectApiErrorCode(
      () =>
        fixture.useCase.create(
          createInput({ ...NFSE_SETTINGS, nfseEmissionProfileId: FOREIGN_NFSE_PROFILE_ID }),
        ),
      'CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE',
    )
  })

  test('a edição recusa apontar para perfil NFS-e inativo', async () => {
    const fixture = createFixture()
    await fixture.useCase.create(createInput(PROFILE_SETTINGS))

    await expectApiErrorCode(
      () =>
        fixture.useCase.update(
          updateInput(fixture, {
            ...NFSE_SETTINGS,
            nfseEmissionProfileId: INACTIVE_NFSE_PROFILE_ID,
          }),
        ),
      'CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE',
    )
    expect(fixture.profileOf(PROFILE_ID).outputDocument).toBe('cte')
  })

  /** A API sobe antes da tela: salvar pelo formulário antigo não pode desfazer a escolha de NFS-e. */
  test('a edição sem os campos novos preserva o documento e o perfil NFS-e já gravados', async () => {
    const fixture = createFixture()
    await fixture.useCase.create(createInput(NFSE_SETTINGS))

    const updated = await fixture.useCase.update(
      updateInput(fixture, { ...withoutOutputFields(), observations: 'Editado pela tela antiga' }),
    )

    expect(updated.outputDocument).toBe('nfse')
    expect(updated.nfseEmissionProfileId).toBe(ACTIVE_NFSE_PROFILE_ID)
    expect(updated.observations).toBe('Editado pela tela antiga')
  })

  test('voltar para CT-e mandando só o documento solta o perfil NFS-e', async () => {
    const fixture = createFixture()
    await fixture.useCase.create(createInput(NFSE_SETTINGS))

    const updated = await fixture.useCase.update(
      updateInput(fixture, { ...withoutOutputFields(), outputDocument: 'cte' }),
    )

    expect(updated.outputDocument).toBe('cte')
    expect(updated.nfseEmissionProfileId).toBeNull()
  })
})
