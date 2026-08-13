/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { PasswordResetCodeRejectedError } from '../../src/identity/domain/password-reset.error'
import {
  CONFIRM_BODY,
  createPasswordResetHttpFixture,
  PASSWORD_RESET_CONFIRM_PATH,
  RESET_CODE,
  RESET_PASSWORD,
  RESET_USERNAME,
  resetRequest,
} from '../fixtures/password-reset-http.fixture'

const confirmPath = { pathname: PASSWORD_RESET_CONFIRM_PATH } as const

describe('rota de pedido de recuperação — fronteira anônima', () => {
  test('responde 204 sem corpo', async () => {
    const fixture = await createPasswordResetHttpFixture()

    const response = await fixture.handle(resetRequest())

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.requestCalls).toEqual([{ username: RESET_USERNAME }])
  })

  test('nunca autentica nem resolve empresa, mesmo com Bearer no cabeçalho', async () => {
    const fixture = await createPasswordResetHttpFixture()

    const anonymous = await fixture.handle(resetRequest())
    const withToken = await fixture.handle(resetRequest({ token: 'token-que-nao-vale-nada' }))

    expect([anonymous.status, withToken.status]).toEqual([204, 204])
    expect(fixture.events).toEqual([])
  })

  test('não existe em método diferente de POST', async () => {
    const fixture = await createPasswordResetHttpFixture()

    const response = await fixture.handle(resetRequest({ method: 'GET' }))

    expect(response.status).toBe(404)
    expect(fixture.requestCalls).toEqual([])
  })

  test('responde igual para login inexistente, desabilitado, sem membership e válido', async () => {
    // O caso de uso é silencioso por construção: nenhum dos quatro casos produz erro, então a
    // rota não teria como responder diferente nem por acidente.
    const statuses: number[] = []
    const bodies: string[] = []

    for (const username of [
      'login.que.nao.existe',
      'login.desabilitado',
      'login.sem.membership',
      RESET_USERNAME,
    ]) {
      const fixture = await createPasswordResetHttpFixture()
      const response = await fixture.handle(resetRequest({ body: { username } }))
      statuses.push(response.status)
      bodies.push(await response.text())
    }

    expect(new Set(statuses)).toEqual(new Set([204]))
    expect(new Set(bodies)).toEqual(new Set(['']))
  })

  test('recusa corpo inválido sem chamar o caso de uso', async () => {
    for (const body of [{}, { username: '' }, { username: 123 }, { login: RESET_USERNAME }]) {
      const fixture = await createPasswordResetHttpFixture()

      const response = await fixture.handle(resetRequest({ body }))

      expect(response.status).toBe(400)
      expect(fixture.requestCalls).toEqual([])
    }
  })

  test('o login não aparece em log de nenhum nível', async () => {
    const fixture = await createPasswordResetHttpFixture()

    await fixture.handle(resetRequest())

    expect(JSON.stringify(fixture.logs)).not.toContain(RESET_USERNAME)
  })
})

describe('rota de confirmação — resposta uniforme', () => {
  test('troca a senha e responde 204 sem devolver nada', async () => {
    const fixture = await createPasswordResetHttpFixture()

    const response = await fixture.handle(resetRequest(confirmPath))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.confirmCalls).toEqual([{ code: RESET_CODE, password: RESET_PASSWORD }])
  })

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
      const fixture = await createPasswordResetHttpFixture({
        confirmError: new PasswordResetCodeRejectedError(),
      })
      const response = await fixture.handle(
        resetRequest({ ...confirmPath, body: { ...CONFIRM_BODY, code } }),
      )
      statuses.push(response.status)
      bodies.push(await response.text())
    }

    expect(new Set(statuses)).toEqual(new Set([400]))
    expect(new Set(bodies).size).toBe(1)
    expect(bodies[0]).toContain('PASSWORD_RESET_CODE_REJECTED')
  })

  test('não devolve cabeçalho que denuncie o limite de tentativas', async () => {
    const fixture = await createPasswordResetHttpFixture({
      confirmError: new PasswordResetCodeRejectedError(),
    })

    const response = await fixture.handle(resetRequest(confirmPath))

    expect(response.headers.get('retry-after')).toBeNull()
    expect(response.headers.get('x-ratelimit-remaining')).toBeNull()
  })

  test('recusa corpo sem código ou sem senha sem chamar o caso de uso', async () => {
    for (const body of [
      { password: RESET_PASSWORD },
      { code: RESET_CODE },
      { code: '', password: RESET_PASSWORD },
      {},
    ]) {
      const fixture = await createPasswordResetHttpFixture()

      const response = await fixture.handle(resetRequest({ ...confirmPath, body }))

      expect(response.status).toBe(400)
      expect(fixture.confirmCalls).toEqual([])
    }
  })

  test('nem código nem senha aparecem em log algum, no sucesso ou na recusa', async () => {
    const accepted = await createPasswordResetHttpFixture()
    const refused = await createPasswordResetHttpFixture({
      confirmError: new PasswordResetCodeRejectedError(),
    })

    await accepted.handle(resetRequest(confirmPath))
    await refused.handle(resetRequest(confirmPath))

    const written = JSON.stringify([...accepted.logs, ...refused.logs])
    expect(written).not.toContain(RESET_CODE)
    expect(written).not.toContain(RESET_PASSWORD)
  })

  test('a recusa não devolve o código nem a senha que chegaram', async () => {
    const fixture = await createPasswordResetHttpFixture({
      confirmError: new PasswordResetCodeRejectedError(),
    })

    const body = await (await fixture.handle(resetRequest(confirmPath))).text()

    expect(body).not.toContain(RESET_CODE)
    expect(body).not.toContain(RESET_PASSWORD)
  })
})
