/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { createAddressCorrectionRoutes } from '../src/address-correction/presentation/address-correction.routes'
import { createContractorMailSettingsRoutes } from '../src/contractor-mail/presentation/contractor-mail-settings.routes'
import { createOccurrenceCaseRoutes } from '../src/trips/presentation/occurrence-case.routes'
import { createTripFieldOfficeOccurrenceRoutes } from '../src/trips/presentation/trip-field-office-occurrence.routes'
import { createTripFieldOfficeRoutes } from '../src/trips/presentation/trip-field-office.routes'
import { createTripRoutes } from '../src/trips/presentation/trip.routes'

const MAIL_RATE_LIMIT = { maxRequests: 7, windowSeconds: 900 } as const
const SOURCE_DIRECTORY = new URL('../src/', import.meta.url).pathname

/** A rota é montada com dependência falsa só para ler o teto dela — nenhum caso de uso roda aqui. */
function unusedDependencies(): unknown {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler)
}

async function listSourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.routes.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
}

/**
 * RF18: toda rota que dispara e-mail conta no Postgres, com o mesmo balde. A lista é por extenso de
 * propósito — rota nova que manda e-mail sem entrar aqui é a porta que o M1 do `SECURITY.md` fechou.
 */
describe('rotas com teto no Postgres (spec 150 T406)', () => {
  test('o envio de correção e o e-mail de teste dividem o escopo contractor-mail', () => {
    const unused = unusedDependencies() as never
    const routes = [
      ...createAddressCorrectionRoutes({
        findRecipients: unused,
        listRequests: unused,
        mailRateLimit: MAIL_RATE_LIMIT,
        saveDraft: unused,
        sendMail: unused,
      }),
      ...createContractorMailSettingsRoutes({
        mailRateLimit: MAIL_RATE_LIMIT,
        read: unused,
        runChecks: unused,
        save: unused,
        sendTestEmail: unused,
      }),
    ]

    const limited = routes
      .filter((route) => route.rateLimit !== undefined)
      .map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      }))

    expect(limited).toEqual([
      {
        rateLimit: {
          maxRequests: 7,
          scope: 'contractor-mail',
          store: 'postgres',
          windowSeconds: 900,
        },
        signature: 'POST /address-correction-requests/mail',
      },
      {
        rateLimit: {
          maxRequests: 7,
          scope: 'contractor-mail',
          store: 'postgres',
          windowSeconds: 900,
        },
        signature: 'POST /contractor-mail-settings/test-email',
      },
    ])
  })

  /**
   * Spec 156 T15 (seg M2): as escritas do escritório em nome do motorista. O lote de ocorrências é o
   * mais duro (N notas e N avisos por chamada); a baixa de nota aguenta o maço de canhotos com
   * concorrência 3; as ações de viagem e parada ficam no meio.
   */
  test('as escritas do escritório contam no Postgres, cada grupo no seu balde', () => {
    const unused = unusedDependencies() as never
    const routes = [
      ...createTripFieldOfficeRoutes(unused),
      ...createTripFieldOfficeOccurrenceRoutes(unused),
    ]

    const limited = Object.fromEntries(
      routes
        .filter((route) => route.method === 'POST')
        .map((route) => [`${route.method} ${route.pathname}`, route.rateLimit]),
    )

    const trip = {
      maxRequests: 120,
      scope: 'trip-field-office-trip',
      store: 'postgres',
      windowSeconds: 300,
    } as const
    const documents = {
      maxRequests: 300,
      scope: 'trip-field-office-documents',
      store: 'postgres',
      windowSeconds: 300,
    } as const
    expect(limited).toEqual({
      'POST /trips/:id/confirm-load': trip,
      'POST /trips/:id/documents/:documentId/field-delivery': documents,
      'POST /trips/:id/documents/:documentId/field-proof': documents,
      'POST /trips/:id/documents/:documentId/field-return': documents,
      'POST /trips/:id/documents/field-occurrences': {
        maxRequests: 30,
        scope: 'trip-field-office-occurrences',
        store: 'postgres',
        windowSeconds: 300,
      },
      'POST /trips/:id/start-route': trip,
      'POST /trips/:id/stops/:stopId/arrive': trip,
      'POST /trips/:id/stops/:stopId/occurrences': trip,
    })
  })

  /**
   * Spec 161 T6/T7 (RF5/RF6): o registro da ocorrência de galpão e o anexo adicional viram
   * multipart, com a mesma escrita mais cara e mais rara que o lote do escritório — uma foto por
   * ocorrência, e a segunda em diante é ainda mais comum que o registro em si.
   */
  test('o registro e o anexo da ocorrência de galpão têm balde próprio', () => {
    const unused = unusedDependencies() as never
    const routes = createTripRoutes(unused)

    const limited = routes
      .filter((route) => route.rateLimit !== undefined)
      .map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      }))

    expect(limited).toEqual([
      {
        rateLimit: {
          maxRequests: 60,
          scope: 'trip-separation-occurrence',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /trips/:id/documents/:documentId/occurrences',
      },
      {
        rateLimit: {
          maxRequests: 300,
          scope: 'trip-occurrence-attachment',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /trips/:id/documents/:documentId/occurrences/:occurrenceId/attachments',
      },
    ])
  })

  /** Spec 164 T7 (achado 1 da revisão: decisão em nome do contratante): as seis ações internas da
   * tratativa dividem um balde só. */
  test('as seis ações internas da tratativa dividem o balde trip-occurrence-case', () => {
    const unused = unusedDependencies() as never
    const routes = createOccurrenceCaseRoutes(unused)

    const limited = routes
      .filter((route) => route.rateLimit !== undefined)
      .map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      }))

    const rateLimit = {
      maxRequests: 120,
      scope: 'trip-occurrence-case',
      store: 'postgres',
      windowSeconds: 300,
    } as const
    expect(limited).toEqual([
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/review' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/warehouse-return' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/contractor-submission' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/closure' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/cancel' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/decision' },
    ])
  })

  test('nenhum outro arquivo da API declara teto no Postgres', async () => {
    const files = await listSourceFiles(SOURCE_DIRECTORY)
    const declaring: string[] = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (source.includes("store: 'postgres'")) declaring.push(file.slice(SOURCE_DIRECTORY.length))
    }

    expect(declaring.sort()).toEqual([
      'address-correction/presentation/address-correction.routes.ts',
      'contractor-mail/presentation/contractor-mail-settings.routes.ts',
      'trips/presentation/occurrence-case.routes.ts',
      'trips/presentation/occurrence-settlement.routes.ts',
      'trips/presentation/redelivery-application.routes.ts',
      'trips/presentation/redelivery-proposal.routes.ts',
      'trips/presentation/trip-field-office-document.routes.ts',
      'trips/presentation/trip-field-office-occurrence.routes.ts',
      'trips/presentation/trip-field-office-trip.routes.ts',
      'trips/presentation/trip.routes.ts',
    ])
  })
})
