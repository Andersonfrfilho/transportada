/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

/**
 * `VehicleReference` é **cópia por valor** entre a API e o frontend — o bundle não carrega código da
 * API, o mesmo caso de `FUEL_TYPES` e `VEHICLE_TYPES`. O que o padrão do repositório exige junto da
 * cópia é este contrato: sem ele, a API acrescenta ou renomeia um campo, o `isVehicleReference` do
 * frontend recusa a resposta inteira, e a ficha do veículo abre **sem sugestão nenhuma** — 200 na
 * rede, nada no console, nenhum erro na tela.
 *
 * Os dois lados são lidos como texto porque é isto que se quer travar: a *forma declarada*, não o
 * que um `structuredClone` de fixture acidental faria passar.
 */
const API_PORT_PATH = new URL(
  '../../../api-transportada/src/fleet/application/vehicle-reference.port.ts',
  import.meta.url,
)

const FRONTEND_SERVICE_PATH = new URL(
  '../../src/modules/fleet/shared/vehicleSuggestion.service.ts',
  import.meta.url,
)

/** Os campos declarados dentro do primeiro bloco `{ … }` depois do nome do tipo. */
function readTypeFields(input: Readonly<{ path: URL; typeName: string }>): readonly string[] {
  const source = readFileSync(input.path, 'utf8')
  const start = source.indexOf(`${input.typeName} =`)
  expect(start).toBeGreaterThan(-1)

  const open = source.indexOf('{', start)
  const close =
    source.indexOf('}>', open) === -1 ? source.indexOf('\n}', open) : source.indexOf('}>', open)
  const body = source.slice(open, close)

  return [...body.matchAll(/^\s*readonly\s+(\w+)|^\s{2}(\w+):/gm)]
    .map((match) => match[1] ?? match[2] ?? '')
    .filter((field) => field !== '')
    .sort()
}

describe('paridade do catálogo de referência de baú', () => {
  test('os dois lados declaram os mesmos campos', () => {
    const api = readTypeFields({ path: API_PORT_PATH, typeName: 'VehicleReference' })
    const frontend = readTypeFields({
      path: FRONTEND_SERVICE_PATH,
      typeName: 'VehicleReference',
    })

    expect(api).toEqual([
      'bodyType',
      'cargoHeightM',
      'cargoLengthM',
      'cargoWidthM',
      'maxPayloadKg',
      'vehicleType',
    ])
    expect(frontend).toEqual(api)
  })

  /**
   * ⚠️ O guard tem de conferir **todos** os campos: um que ele ignore pode sumir da resposta sem
   * que nada acuse, e a sugestão passaria a preencher a ficha com `undefined`.
   */
  test('o guard do frontend confere cada campo declarado', () => {
    const guardSource = readFileSync(
      new URL('../../src/modules/fleet/shared/fleetResponse.validation.ts', import.meta.url),
      'utf8',
    )
    const start = guardSource.indexOf('function isVehicleReference')
    const guard = guardSource.slice(start, guardSource.indexOf('\n}', start))

    for (const field of readTypeFields({ path: API_PORT_PATH, typeName: 'VehicleReference' })) {
      expect(guard).toContain(`value.${field}`)
    }
  })
})
