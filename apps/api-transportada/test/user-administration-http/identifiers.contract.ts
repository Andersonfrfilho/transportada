/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_USERS_PATH,
  createUserAdministrationHttpFixture,
  IDENTIFIERS,
  jsonRequest,
  responseData,
  TARGET_USER_ID,
  WITHOUT_USERS_MANAGE_PERMISSIONS,
} from '../fixtures/user-administration-http.fixture'

const IDENTIFIERS_PATH = `${COMPANY_USERS_PATH}/${TARGET_USER_ID}/identifiers`

/**
 * O mesmo conjunto serve para a pessoa entrar e para falarem com ela. Duas listas separadas
 * obrigariam quem cadastra a digitar o mesmo telefone duas vezes e a mantê-lo igual para sempre.
 */
describe('e-mails e telefones do usuário', () => {
  test('a listagem devolve o conjunto', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: IDENTIFIERS_PATH }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(IDENTIFIERS)
  })

  test('acrescentar telefone leva a marca de WhatsApp', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { isWhatsapp: true, kind: 'phone', value: '(11) 99999-8888' },
        method: 'POST',
        path: IDENTIFIERS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    /** A máscara não entra no banco: a busca do login é por igualdade. */
    expect(fixture.identifierCalls[0]).toMatchObject({ isWhatsapp: true, value: '11999998888' })
  })

  test('o e-mail entra em caixa baixa, sem espaço', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    await fixture.handle(
      jsonRequest({
        body: { kind: 'email', value: '  Pessoa@Empresa.TEST ' },
        method: 'POST',
        path: IDENTIFIERS_PATH,
      }),
    )

    expect(fixture.identifierCalls[0]).toMatchObject({ value: 'pessoa@empresa.test' })
  })

  /** O documento vem da ficha e tem campo próprio: um segundo caminho para ele criaria divergência. */
  test('documento não é acrescentável por esta rota', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'document', value: '12345678909' },
        method: 'POST',
        path: IDENTIFIERS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.identifierCalls).toHaveLength(0)
  })

  test('telefone fora de 10 ou 11 dígitos é recusado', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'phone', value: '99999' },
        method: 'POST',
        path: IDENTIFIERS_PATH,
      }),
    )

    expect(response.status).toBe(400)
  })

  test('remover devolve o conjunto que sobrou', async () => {
    const fixture = await createUserAdministrationHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        method: 'DELETE',
        path: `${IDENTIFIERS_PATH}/00000000-0000-4000-8000-000000000931`,
      }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(IDENTIFIERS)
  })

  test('sem `users.manage` nada é alcançado', async () => {
    const fixture = await createUserAdministrationHttpFixture({
      permissions: WITHOUT_USERS_MANAGE_PERMISSIONS,
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: IDENTIFIERS_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.identifierCalls).toHaveLength(0)
  })
})
