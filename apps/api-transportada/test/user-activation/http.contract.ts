/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { InvitationCodeRejectedError } from '../../src/identity/domain/invitation.error'
import {
  ACTIVATION_BODY,
  ACTIVATION_CODE,
  ACTIVATION_PASSWORD,
  activationRequest,
  createUserActivationHttpFixture,
} from '../fixtures/user-activation-http.fixture'

const refusedFixture = () =>
  createUserActivationHttpFixture({ executeError: new InvitationCodeRejectedError() })

describe('rota de ativação — fronteira anônima', () => {
  test('troca código por senha e responde 204 sem devolver nada', async () => {
    const fixture = await createUserActivationHttpFixture()

    const response = await fixture.handle(activationRequest())

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.executeCalls).toHaveLength(1)
  })

  test('nunca autentica nem resolve empresa, mesmo com Bearer no cabeçalho', async () => {
    const fixture = await createUserActivationHttpFixture()

    const anonymous = await fixture.handle(activationRequest())
    const withToken = await fixture.handle(activationRequest({ token: 'token-que-nao-vale-nada' }))

    expect(anonymous.status).toBe(204)
    expect(withToken.status).toBe(204)
    expect(fixture.events).toEqual([])
  })

  test('não existe em método diferente de POST', async () => {
    const fixture = await createUserActivationHttpFixture()

    const response = await fixture.handle(activationRequest({ method: 'GET' }))

    expect(response.status).toBe(404)
    expect(fixture.executeCalls).toEqual([])
  })
})

describe('rota de ativação — resposta uniforme', () => {
  test('responde igual a expirado, já usado, inexistente, errado e tentativas esgotadas', async () => {
    const bodies: string[] = []
    const statuses: number[] = []

    for (const code of [
      'CODIGO-EXPIRADO-DE-CONTRATO',
      'CODIGO-JA-USADO-DE-CONTRATO',
      'CODIGO-INEXISTENTE-DE-CONTRATO',
      'CODIGO-ERRADO-DE-CONTRATO',
      'CODIGO-SEM-TENTATIVA-DE-CONTRATO',
    ]) {
      const fixture = await refusedFixture()
      const response = await fixture.handle(
        activationRequest({ body: { ...ACTIVATION_BODY, code } }),
      )
      bodies.push(await response.text())
      statuses.push(response.status)
    }

    expect(new Set(statuses)).toEqual(new Set([400]))
    expect(new Set(bodies).size).toBe(1)
    expect(bodies[0]).toContain('INVITATION_CODE_REJECTED')
  })

  test('não devolve cabeçalho que denuncie o limite de tentativas', async () => {
    const fixture = await refusedFixture()

    const response = await fixture.handle(activationRequest())

    expect(response.headers.get('retry-after')).toBeNull()
    expect(response.headers.get('x-ratelimit-remaining')).toBeNull()
  })

  test('a recusa não devolve o código nem a senha que chegaram', async () => {
    const fixture = await refusedFixture()

    const body = await (await fixture.handle(activationRequest())).text()

    expect(body).not.toContain(ACTIVATION_CODE)
    expect(body).not.toContain(ACTIVATION_PASSWORD)
  })
})

describe('rota de ativação — validação e sigilo', () => {
  test('recusa corpo sem código ou sem senha sem chamar o caso de uso', async () => {
    for (const body of [
      { password: ACTIVATION_PASSWORD },
      { code: ACTIVATION_CODE },
      { code: '', password: ACTIVATION_PASSWORD },
      {},
    ]) {
      const fixture = await createUserActivationHttpFixture()

      const response = await fixture.handle(activationRequest({ body }))

      expect(response.status).toBe(400)
      expect(fixture.executeCalls).toEqual([])
    }
  })

  test('a recusa de validação não ecoa o que o cliente mandou', async () => {
    const fixture = await createUserActivationHttpFixture()

    const response = await fixture.handle(
      activationRequest({ body: { code: ACTIVATION_CODE, password: '' } }),
    )
    const body = await response.text()

    expect(response.status).toBe(400)
    expect(body).not.toContain(ACTIVATION_CODE)
  })

  test('nem código nem senha aparecem em log algum, no sucesso ou na recusa', async () => {
    const accepted = await createUserActivationHttpFixture()
    const refused = await refusedFixture()

    await accepted.handle(activationRequest())
    await refused.handle(activationRequest())

    const written = JSON.stringify([...accepted.logs, ...refused.logs])
    expect(written).not.toContain(ACTIVATION_CODE)
    expect(written).not.toContain(ACTIVATION_PASSWORD)
  })
})
