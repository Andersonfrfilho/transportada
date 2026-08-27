/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { DeliveryClientAlreadyExistsError } from '../../src/delivery-clients/domain/delivery-client.error.js'
import {
  CLIENT,
  CLIENT_DETAIL,
  CLIENT_ID,
  CLIENT_TAX_ID,
  createDeliveryClientHttpFixture,
  DELIVERY_CLIENTS_PATH,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/delivery-client-http.fixture'
import { COMPANY_CONTEXT, jsonRequest, responseApiError, responseData } from '../fixtures/freight-region-http.fixture'

const CLIENT_PATH = `${DELIVERY_CLIENTS_PATH}/${CLIENT_ID}`

describe('as rotas do cliente de entrega (spec 060 T007)', () => {
  test('lista com os filtros da query, e o cursor volta na página', async () => {
    const fixture = createDeliveryClientHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${DELIVERY_CLIENTS_PATH}?limit=10&requiresScheduling=true&nameContains=Loja&status=active`,
      }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual([CLIENT])
    expect(fixture.calls.list).toEqual([
      {
        context: COMPANY_CONTEXT,
        filters: {
          limit: 10,
          nameContains: 'Loja',
          requiresScheduling: true,
          status: 'active',
        },
      },
    ])
  })

  test('a ficha traz janela e exceção junto', async () => {
    const fixture = createDeliveryClientHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: CLIENT_PATH }))

    expect(await responseData(response)).toEqual(CLIENT_DETAIL)
  })

  /**
   * A busca por documento é **igualdade exata**, e o caminho canonicaliza: ponto, traço, barra
   * codificada e a letra minúscula do CNPJ alfanumérico chegam à consulta na forma do banco. O
   * segmento é `opaque` justamente porque documento não é UUID — quem decide o que é documento é o
   * `parse`, não o roteador.
   */
  test('acha por documento, canonicalizando pontuação e caixa', async () => {
    const fixture = createDeliveryClientHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${DELIVERY_CLIENTS_PATH}/by-tax-id/12.abc.678-0001-90`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.calls.getByTaxId).toEqual([
      { context: COMPANY_CONTEXT, taxId: '12ABC678000190' },
    ])

    const masked = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${DELIVERY_CLIENTS_PATH}/by-tax-id/${encodeURIComponent('12.abc.678/0001-90')}`,
      }),
    )
    expect(masked.status).toBe(200)
    expect(fixture.calls.getByTaxId?.at(-1)).toEqual({
      context: COMPANY_CONTEXT,
      taxId: '12ABC678000190',
    })
  })

  /** Documento fora de forma é ausência, não `400`: quem digitou errado procurou o que não existe. */
  test('documento impossível responde 404, e nem chega ao caso de uso', async () => {
    const fixture = createDeliveryClientHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${DELIVERY_CLIENTS_PATH}/by-tax-id/123` }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('DELIVERY_CLIENT_NOT_FOUND')
    expect(fixture.calls.getByTaxId).toEqual([])
  })

  test('cria com o documento canonicalizado e só os campos declarados', async () => {
    const fixture = createDeliveryClientHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { displayName: 'Loja Central', requiresScheduling: true, taxId: '12345678000190' },
        method: 'POST',
        path: DELIVERY_CLIENTS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.calls.create).toEqual([
      {
        context: COMPANY_CONTEXT,
        taxId: CLIENT_TAX_ID,
        values: { displayName: 'Loja Central', requiresScheduling: true },
      },
    ])
  })

  /** Um documento, um cadastro: o `409` aponta o existente para a tela levar a pessoa até lá. */
  test('documento repetido responde 409 apontando o cadastro que já existe', async () => {
    const fixture = createDeliveryClientHttpFixture({
      error: new DeliveryClientAlreadyExistsError(CLIENT_ID),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { taxId: '12345678000190' },
        method: 'POST',
        path: DELIVERY_CLIENTS_PATH,
      }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('DELIVERY_CLIENT_ALREADY_EXISTS')
  })

  /**
   * `exactOptionalPropertyTypes`: o corpo com um campo só manda **um** campo ao caso de uso. Se as
   * chaves ausentes viajassem como `undefined`, a atualização parcial apagaria o que não foi tocado.
   */
  test('a atualização parcial manda só o que veio no corpo', async () => {
    const fixture = createDeliveryClientHttpFixture()

    await fixture.handle(
      jsonRequest({ body: { deliveryFeeAmount: '45.0000' }, method: 'PATCH', path: CLIENT_PATH }),
    )

    expect(fixture.calls.update).toEqual([
      { context: COMPANY_CONTEXT, id: CLIENT_ID, values: { deliveryFeeAmount: '45.0000' } },
    ])
  })

  /** Campo desconhecido é recusado: `strict()` impede a tela de mandar regra que ninguém lê. */
  test('recusa campo que o cadastro não tem', async () => {
    const fixture = createDeliveryClientHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { unknownField: 1 }, method: 'PATCH', path: CLIENT_PATH }),
    )

    expect(response.status).toBe(400)
  })

  test('substitui a semana inteira de uma vez', async () => {
    const fixture = createDeliveryClientHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          windows: [
            { closesAt: '11:00', opensAt: '08:00', weekday: 4 },
            { closesAt: '16:00', opensAt: '14:00', weekday: 4 },
          ],
        },
        method: 'PUT',
        path: `${CLIENT_PATH}/windows`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.calls.replaceWindows?.[0]).toEqual({
      context: COMPANY_CONTEXT,
      id: CLIENT_ID,
      windows: [
        { closesAt: '11:00', opensAt: '08:00', weekday: 4 },
        { closesAt: '16:00', opensAt: '14:00', weekday: 4 },
      ],
    })
  })

  /** A janela invertida morre no campo, não num CHECK do banco virando 500. */
  test('recusa janela que fecha antes de abrir', async () => {
    const fixture = createDeliveryClientHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { windows: [{ closesAt: '08:00', opensAt: '11:00', weekday: 4 }] },
        method: 'PUT',
        path: `${CLIENT_PATH}/windows`,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.calls.replaceWindows).toEqual([])
  })

  /** `open` sem horário e `closed` com horário são as duas contradições que o banco recusaria. */
  test('recusa exceção incoerente com o que ela declara', async () => {
    const fixture = createDeliveryClientHttpFixture()

    for (const exception of [
      { exceptionOn: '2026-12-24', kind: 'open' },
      { closesAt: '12:00', exceptionOn: '2026-12-24', kind: 'closed', opensAt: '09:00' },
    ]) {
      const response = await fixture.handle(
        jsonRequest({
          body: { exceptions: [exception] },
          method: 'PUT',
          path: `${CLIENT_PATH}/exceptions`,
        }),
      )

      expect(response.status).toBe(400)
    }
    expect(fixture.calls.replaceExceptions).toEqual([])
  })

  /** Ler é `fleet.read`; escrever regra de entrega é `fleet.manage`. */
  test('quem só lê não escreve cadastro', async () => {
    const fixture = createDeliveryClientHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    expect((await fixture.handle(jsonRequest({ method: 'GET', path: CLIENT_PATH }))).status).toBe(200)
    expect(
      (
        await fixture.handle(
          jsonRequest({ body: { notes: 'x' }, method: 'PATCH', path: CLIENT_PATH }),
        )
      ).status,
    ).toBe(403)
  })
})
