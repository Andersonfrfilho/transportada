/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  ISSUE_ONLY_CONTEXT,
  PROFILE_OPTION,
  PROFILE_SETTINGS,
  READ_ONLY_CONTEXT,
  createNfseProfilesHttpFixture,
  getRequest,
  jsonRequest,
} from '../fixtures/nfse-profiles-http.fixture'

const OPTIONS_PATH = '/nfse-emission-profiles/options'

describe('NFS-e emission profile options route contract', () => {
  /** Quem emite escolhe o perfil; administrar a configuração da empresa é outra permissão. */
  test('serves the options to nfse.issue without settings.manage', async () => {
    const fixture = await createNfseProfilesHttpFixture({
      permissions: ISSUE_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(getRequest(OPTIONS_PATH))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: [PROFILE_OPTION] })
    expect(fixture.listOptionsCalls).toEqual([
      { context: { ...COMPANY_CONTEXT, permissions: expect.any(Object) } },
    ])
  })

  /**
   * O guarda é `nfse.issue`, não `settings.manage`: quem só administra a empresa não passa por aqui,
   * e a listagem completa continua sendo o caminho dele.
   */
  test('denies the options to a context without nfse.issue', async () => {
    const fixture = await createNfseProfilesHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(getRequest(OPTIONS_PATH))

    expect(response.status).toBe(403)
    expect(fixture.listOptionsCalls).toHaveLength(0)
  })

  /**
   * O item da opção é fechado por asserção de chaves: um campo novo em `serializeProfile` que
   * escorregue para cá entregaria alíquota e CNAE a quem só pode emitir.
   */
  test('projects exactly the three fields the emission dialog needs', async () => {
    const fixture = await createNfseProfilesHttpFixture({
      permissions: ISSUE_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(getRequest(OPTIONS_PATH))
    const payload = (await response.json()) as { data: readonly Record<string, unknown>[] }

    expect(Object.keys(payload.data[0] ?? {}).sort()).toEqual(['descriptionTemplate', 'id', 'name'])
    expect(JSON.stringify(payload)).not.toContain(PROFILE_SETTINGS.issRate)
    expect(JSON.stringify(payload)).not.toContain(PROFILE_SETTINGS.cnaeCode)
  })

  /** A rota estática não pode ser capturada pela dinâmica — `options` nunca é identificador. */
  test('never mistakes the options segment for a profile identifier', async () => {
    const fixture = await createNfseProfilesHttpFixture({
      permissions: ISSUE_ONLY_CONTEXT.permissions,
    })

    const collection = await fixture.handle(getRequest(OPTIONS_PATH))
    const update = await fixture.handle(
      jsonRequest({
        body: { expectedVersion: '1', settings: PROFILE_SETTINGS },
        method: 'PATCH',
        path: OPTIONS_PATH,
      }),
    )

    expect(collection.status).toBe(200)
    expect(update.status).toBe(404)
    expect(fixture.listCalls).toHaveLength(0)
    expect(fixture.updateCalls).toHaveLength(0)
  })
})
