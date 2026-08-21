/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createFreightRegionHttpFixture,
  FLEET_ONLY_PERMISSIONS,
  FREIGHT_REGIONS_PATH,
  IMPORT_BODY,
  IMPORT_SUMMARY,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture'

const IMPORT_PATH = `${FREIGHT_REGIONS_PATH}/import`

describe('freight region import route', () => {
  test('answers the summary of what the file changed', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: IMPORT_BODY, method: 'POST', path: IMPORT_PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(IMPORT_SUMMARY)
  })

  /**
   * O CSV é lido na fronteira: o caso de uso recebe rota, não texto. Deixar o arquivo entrar cru
   * levaria o formato da planilha até o repositório.
   */
  test('hands the use case the parsed regions, never the raw file', async () => {
    const fixture = await createFreightRegionHttpFixture()

    await fixture.handle(jsonRequest({ body: IMPORT_BODY, method: 'POST', path: IMPORT_PATH }))

    expect(fixture.importRegionCalls[0]).toMatchObject({
      regions: [
        {
          cities: [
            { city: 'BARRETOS', state: 'SP' },
            { city: 'BARRINHA', state: 'SP' },
          ],
          code: '1.000',
          name: 'BARRETOS',
        },
      ],
    })
    expect(fixture.importRegionCalls[0]).not.toHaveProperty('rates')
  })

  /** Reescrever a tabela de rotas é configuração; ler continua sendo da frota. */
  test('refuses whoever only manages the fleet', async () => {
    const fixture = await createFreightRegionHttpFixture({ permissions: FLEET_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ body: IMPORT_BODY, method: 'POST', path: IMPORT_PATH }),
    )

    expect(response.status).toBe(403)
    expect(fixture.importRegionCalls).toEqual([])
  })

  test('refuses a body with an undeclared field', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...IMPORT_BODY, separator: ';' },
        method: 'POST',
        path: IMPORT_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.importRegionCalls).toEqual([])
  })

  /** O erro do arquivo é do arquivo: 400 com o motivo, nunca 500 nem importação pela metade. */
  test('answers the reason when the file does not read', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...IMPORT_BODY, rates: 'code,utility\n1.000,540.00' },
        method: 'POST',
        path: IMPORT_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('FREIGHT_REGION_IMPORT_INVALID')
    expect(fixture.importRegionCalls).toEqual([])
  })

  test('refuses a file with no region at all', async () => {
    const fixture = await createFreightRegionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...IMPORT_BODY, regions: 'code,name,zone,city,state' },
        method: 'POST',
        path: IMPORT_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('FREIGHT_REGION_IMPORT_EMPTY')
  })
})
