/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { createAddressCorrectionRoutes } from '../src/address-correction/presentation/address-correction.routes'
import { createContractorMailSettingsRoutes } from '../src/contractor-mail/presentation/contractor-mail-settings.routes'

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
    ])
  })
})
