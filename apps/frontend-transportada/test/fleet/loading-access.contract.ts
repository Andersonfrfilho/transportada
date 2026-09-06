/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { LOADING_ACCESS_KINDS } from '@/modules/shared/loadingAccess.constant'

const FORM = 'src/modules/fleet/components/VehicleOperationFields.component.tsx'

async function read(path: string): Promise<string> {
  return Bun.file(new URL(`../../${path}`, import.meta.url)).text()
}

describe('por onde o veículo carrega (spec 085 G003)', () => {
  /**
   * ⚠️ **Cópia por valor**: o bundle não carrega código da API, o mesmo caso de `VEHICLE_TYPES` e
   * `FUEL_TYPES`. Este contrato restata a lista **e a ordem** — mudou de um lado, mude do outro.
   * A ordem faz parte do contrato porque é ela que o select imprime, do mais restritivo ao aberto.
   */
  it('o catálogo tem os três acessos, na ordem do mais restritivo ao aberto', () => {
    expect(LOADING_ACCESS_KINDS).toEqual(['rear', 'rear_and_side', 'open'])
  })

  /** Sem rótulo dos três, o operador leria a chave crua no select. */
  it('os três têm rótulo nos dois idiomas', async () => {
    for (const arquivo of ['fleet.locale.json', 'fleet.en.locale.json']) {
      const locale = JSON.parse(await read(`src/modules/fleet/locales/${arquivo}`)) as Record<
        string,
        Record<string, string>
      >
      for (const acesso of LOADING_ACCESS_KINDS) {
        expect(locale.loadingAccessOption?.[acesso]).toBeTypeOf('string')
      }
      expect(locale.loadingAccess).toBeTypeOf('string')
    }
  })

  /**
   * ⚠️ O campo é **digitado**, nunca derivado do tipo do veículo nem da carroceria: a mesma
   * Sprinter existe com e sem porta lateral, e deduzir erraria no veículo que foge do estereótipo.
   * Este teste falha se alguém escrever a dedução na ficha.
   */
  it('a ficha não deduz o acesso do tipo nem da carroceria', async () => {
    const form = await read(FORM)

    expect(form).toInclude('state.loadingAccess')
    expect(form).not.toInclude('resolveDefaultLoadingAccess')
    expect(form).not.toMatch(/loadingAccess[^\n]*vehicleType/u)
  })
})
