/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Preenche a coordenada da casa das fichas de motorista que já existiam antes da spec 097 D6.
 *
 * A busca automática acontece no salvamento do cadastro, e ficha antiga não é salva sozinha: sem
 * este script, os motoristas já cadastrados só ganhariam coordenada se alguém abrisse cada ficha e
 * editasse algum campo — o formulário sem campo sujo não manda requisição nenhuma.
 *
 * ⚠️ **Ele respeita a marca `home_geocoded_at`**: só procura quem nunca foi procurado. Rodar duas
 * vezes não consulta o provedor de novo, e é isso que faz repetir a execução ser barato e seguro.
 *
 * ⚠️ **Sem `--confirm` ele não consulta nada** — imprime o escopo e sai. O Photon é gratuito, mas a
 * instância pública pede uso justo, e um lote disparado por engano contra centenas de fichas é
 * exatamente o que a cortesia pede para não acontecer. Mesmo padrão de
 * `address-comparison-batch.ts`.
 *
 *   bun scripts/driver-home-geocoding-backfill.ts
 *   bun scripts/driver-home-geocoding-backfill.ts --limit 50 --confirm
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull } from 'drizzle-orm'

import { fleetDrivers } from '../src/database/fleet.schema.js'
import { describeDriverHome } from '../src/fleet/domain/driver-home-geocoding.policy.js'
import { createDriverHomeGeocoder } from '../src/fleet/application/driver-home-geocoder.port.js'
import { createPhotonDriverHomeGateway } from '../src/fleet/infrastructure/photon-driver-home.gateway.js'
import { DrizzleFleetDriverRepository } from '../src/fleet/infrastructure/drizzle-fleet-driver.repository.js'

/** ⚠️ Uma consulta por segundo: a instância pública do Photon é cortesia de terceiro, não serviço nosso. */
const DELAY_BETWEEN_REQUESTS_MS = 1_000
const DEFAULT_LIMIT = 200

type Options = Readonly<{ confirm: boolean; limit: number }>

function parseOptions(argv: readonly string[]): Options {
  const limitIndex = argv.indexOf('--limit')
  const limit = limitIndex === -1 ? DEFAULT_LIMIT : Number(argv[limitIndex + 1])

  return {
    confirm: argv.includes('--confirm'),
    limit: Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : DEFAULT_LIMIT,
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? ''
  if (databaseUrl.length === 0) throw new Error('DATABASE_URL ausente')

  const lookupUrl = process.env.DRIVER_ADDRESS_LOOKUP_URL ?? ''
  if (lookupUrl.length === 0) throw new Error('DRIVER_ADDRESS_LOOKUP_URL ausente')

  const options = parseOptions(process.argv.slice(2))
  const provider = createDrizzleProvider({ connection: databaseUrl })
  const repository = new DrizzleFleetDriverRepository(provider.db)

  /** Só quem nunca foi procurado: a marca é o que impede este lote de refazer trabalho. */
  const pendentes = await provider.db
    .select({
      city: fleetDrivers.city,
      companyId: fleetDrivers.companyId,
      id: fleetDrivers.id,
      name: fleetDrivers.name,
      number: fleetDrivers.number,
      postalCode: fleetDrivers.postalCode,
      state: fleetDrivers.state,
      street: fleetDrivers.street,
    })
    .from(fleetDrivers)
    .where(and(isNull(fleetDrivers.homeGeocodedAt), eq(fleetDrivers.status, 'active')))
    .limit(options.limit)

  /**
   * O escopo é impresso **separando quem dá para procurar de quem não dá**: ficha sem rua ou sem
   * cidade não vira consulta, e contá-la no total prometeria um resultado que não vem.
   */
  const buscaveis = pendentes.filter(
    (driver) =>
      describeDriverHome({
        ...driver,
        geocodedAt: null,
        latitude: null,
        longitude: null,
      }).status !== 'incomplete',
  )
  const incompletos = pendentes.length - buscaveis.length

  process.stdout.write(
    `fichas sem busca: ${String(pendentes.length)}\n` +
      `  com endereço buscável: ${String(buscaveis.length)}\n` +
      `  com endereço incompleto (não serão consultadas): ${String(incompletos)}\n` +
      `provedor: ${lookupUrl}\n` +
      `ritmo: 1 consulta a cada ${String(DELAY_BETWEEN_REQUESTS_MS)} ms\n`,
  )

  if (!options.confirm) {
    process.stdout.write('nada foi consultado. repita com --confirm para executar.\n')
    return
  }

  const geocoder = createDriverHomeGeocoder({
    provider: createPhotonDriverHomeGateway({ baseUrl: lookupUrl }),
    repository,
  })

  let achados = 0
  let semResultado = 0
  let falhas = 0
  for (const [posicao, driver] of buscaveis.entries()) {
    if (posicao > 0) await Bun.sleep(DELAY_BETWEEN_REQUESTS_MS)
    try {
      await geocoder.fill({ companyId: driver.companyId, driverId: driver.id })
      const depois = await repository.readHome({
        companyId: driver.companyId,
        driverId: driver.id,
      })
      if (depois?.latitude === null || depois === null) semResultado += 1
      else achados += 1
    } catch (error) {
      /**
       * ⚠️ Uma ficha que falha não derruba o lote — e **não** carimba a marca, então ela volta a ser
       * candidata na próxima execução. Rede caída não é resposta.
       */
      falhas += 1
      process.stdout.write(
        `  falhou: ${driver.name} — ${error instanceof Error ? error.message : 'desconhecido'}\n`,
      )
    }
  }

  process.stdout.write(
    `\nconsultadas: ${String(buscaveis.length)}\n` +
      `  com coordenada: ${String(achados)}\n` +
      `  sem resultado (marcadas como procuradas): ${String(semResultado)}\n` +
      `  falharam (serão tentadas de novo): ${String(falhas)}\n`,
  )
}

await main()
process.exit(0)
