/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 267 (T4.1): os responsáveis por ocorrências que vão em cópia no e-mail da contratante. O cliente fala com as rotas
 * por item da API; a leitura é tolerante (linha que o guard não reconhece sai da lista); o painel é autocontido do módulo
 * da conversa e a aba de Configurações só decide onde mostrá-lo.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createOccurrenceWatchersClient } from '@/modules/occurrence-conversation/shared/occurrenceWatchersClient.service'
import {
  OCCURRENCE_WATCHER_MAX_ACTIVE,
  OCCURRENCE_WATCHER_MAX_TOTAL,
  availableWatcherCandidates,
  canAddOccurrenceWatcher,
  describeWatcherListSource,
} from '@/modules/occurrence-conversation/shared/occurrenceWatchers.service'
import type { OccurrenceWatcherItem } from '@/modules/occurrence-conversation/shared/occurrenceWatchers.types'
import {
  COMPANY_SETTINGS_TAB_IDS,
  SETTINGS_PANEL_PLACEMENT,
  resolveCompanySettingsDataScope,
} from '@/modules/company-settings/shared/companySettingsTabs.service'

const API_URL = 'https://api.transportada.test'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000c01'

function item(overrides: Partial<OccurrenceWatcherItem> = {}): OccurrenceWatcherItem {
  return {
    eligible: true,
    maskedEmail: 'a***@e***.com',
    name: 'Ana',
    status: 'active',
    userId: 'user-ana',
    ...overrides,
  }
}

function createClient(responses: readonly Response[], requests: Request[]) {
  let index = 0
  return createOccurrenceWatchersClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      const response = responses[index] ?? new Response(null, { status: 500 })
      index += 1
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

describe('o cliente dos responsáveis por ocorrências (spec 267)', () => {
  test('lista, candidatos, adiciona, troca o estado e remove pelos caminhos da API, na empresa e na contratante', async () => {
    const requests: Request[] = []
    const client = createClient(
      [
        Response.json({ data: { watchers: [item(), { broken: true }] } }),
        Response.json({ data: [{ maskedEmail: null, name: 'Bruno', userId: 'user-bruno' }, 1] }),
        Response.json({ data: item({ userId: 'user-bruno' }) }, { status: 201 }),
        Response.json({ data: item({ status: 'inactive' }) }),
        new Response(null, { status: 204 }),
        Response.json({ data: { effectiveSource: 'company', watchers: [] } }),
        Response.json({ data: item() }),
        new Response(null, { status: 204 }),
      ],
      requests,
    )
    const company = { kind: 'company' } as const
    const contractor = { contractorId: CONTRACTOR_ID, kind: 'contractor' } as const

    expect(await client.list(company)).toEqual({ effectiveSource: null, watchers: [item()] })
    expect(await client.listCandidates()).toEqual([
      { maskedEmail: null, name: 'Bruno', userId: 'user-bruno' },
    ])
    await client.add(company, 'user-bruno')
    await client.setStatus(company, { status: 'inactive', userId: 'user-ana' })
    await client.remove(company, 'user-ana')
    expect(await client.list(contractor)).toEqual({ effectiveSource: 'company', watchers: [] })
    await client.add(contractor, 'user-ana')
    await client.remove(contractor, 'user-ana')

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${API_URL}/company-settings/occurrence-watchers`,
      `GET ${API_URL}/company-settings/occurrence-watchers/candidates`,
      `POST ${API_URL}/company-settings/occurrence-watchers`,
      `PATCH ${API_URL}/company-settings/occurrence-watchers/user-ana`,
      `DELETE ${API_URL}/company-settings/occurrence-watchers/user-ana`,
      `GET ${API_URL}/contractors/${CONTRACTOR_ID}/occurrence-watchers`,
      `POST ${API_URL}/contractors/${CONTRACTOR_ID}/occurrence-watchers`,
      `DELETE ${API_URL}/contractors/${CONTRACTOR_ID}/occurrence-watchers/user-ana`,
    ])
    expect(await requests[2]?.json()).toEqual({ userId: 'user-bruno' })
    expect(await requests[3]?.json()).toEqual({ status: 'inactive' })
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-token')
  })

  test('o erro da API chega pelo code; a resposta sem a forma esperada é inválida', async () => {
    const failing = createClient(
      [Response.json({ error: { code: 'OCCURRENCE_WATCHER_NOT_ELIGIBLE' } }, { status: 400 })],
      [],
    )
    expect(
      await failing.add({ kind: 'company' }, 'user-x').catch((error: unknown) => error),
    ).toMatchObject({ code: 'OCCURRENCE_WATCHER_NOT_ELIGIBLE' })

    const malformed = createClient([Response.json({ data: { unexpected: true } })], [])
    expect(
      await malformed.list({ kind: 'company' }).catch((error: unknown) => error),
    ).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_RESPONSE_INVALID',
    })
  })
})

describe('os responsáveis — serviço puro (spec 267)', () => {
  test('os tetos são os da API: 10 ativos e 30 linhas', () => {
    expect(OCCURRENCE_WATCHER_MAX_ACTIVE).toBe(10)
    expect(OCCURRENCE_WATCHER_MAX_TOTAL).toBe(30)
  })

  test('só oferece quem ainda não está na lista, na ordem de nome', () => {
    const candidates = [
      { maskedEmail: null, name: 'Carla', userId: 'user-carla' },
      { maskedEmail: null, name: 'Ana', userId: 'user-ana' },
      { maskedEmail: null, name: 'Bruno', userId: 'user-bruno' },
    ]

    expect(
      availableWatcherCandidates(candidates, [item({ userId: 'user-bruno' })]).map(
        (candidate) => candidate.userId,
      ),
    ).toEqual(['user-ana', 'user-carla'])
  })

  test('não adiciona com 10 ativos nem com 30 linhas; inativo não conta para os dez', () => {
    const active = Array.from({ length: 10 }, (_, index) => item({ userId: `a-${index}` }))
    const inactive = Array.from({ length: 20 }, (_, index) =>
      item({ status: 'inactive', userId: `i-${index}` }),
    )

    expect(canAddOccurrenceWatcher(active.slice(0, 9))).toBe(true)
    expect(canAddOccurrenceWatcher(active)).toBe(false)
    expect(canAddOccurrenceWatcher([...active.slice(0, 5), ...inactive.slice(0, 5)])).toBe(true)
    expect(canAddOccurrenceWatcher([...active.slice(0, 5), ...inactive, ...inactive])).toBe(false)
  })

  test('a lista da contratante diz qual lista vale', () => {
    expect(describeWatcherListSource('contractor', 1)).toBe('contractor')
    expect(describeWatcherListSource('company', 0)).toBe('company')
    expect(describeWatcherListSource('company', 2)).toBe('companyOverridden')
    expect(describeWatcherListSource(null, 0)).toBe('company')
  })
})

describe('os responsáveis por texto de fonte (spec 267)', () => {
  test('Configurações ganha a aba, com o painel autocontido do módulo dono', () => {
    const page = readFileSync('src/modules/company-settings/pages/CompanySettings.page.tsx', 'utf8')

    expect(page).toContain("tab === 'occurrenceWatchers'")
    expect(page).toContain('OccurrenceWatchersPanel')
    expect(COMPANY_SETTINGS_TAB_IDS).toContain('occurrenceWatchers')
    expect(SETTINGS_PANEL_PLACEMENT.occurrenceWatchers).toEqual({
      module: 'company-settings',
      source: 'occurrenceWatchers',
      tab: 'occurrenceWatchers',
    })
    expect(resolveCompanySettingsDataScope('occurrenceWatchers').occurrenceWatchers).toBe(true)
    expect(resolveCompanySettingsDataScope('company').occurrenceWatchers).toBe(false)
  })

  test('remover pede confirmação na página, nunca window.confirm', () => {
    const panel = readFileSync(
      'src/modules/occurrence-conversation/components/OccurrenceWatchersPanel.component.tsx',
      'utf8',
    )
    const dialog = readFileSync(
      'src/modules/occurrence-conversation/components/OccurrenceWatcherRemoveDialog.component.tsx',
      'utf8',
    )

    expect(panel + dialog).not.toContain('confirm(')
    expect(dialog).toContain('role="alertdialog"')
    expect(panel).toContain('OccurrenceWatcherRemoveDialog')
  })

  test('as chaves de texto existem em pt-BR e em inglês', () => {
    for (const file of [
      'src/modules/occurrence-conversation/locales/occurrenceConversation.locale.json',
      'src/modules/occurrence-conversation/locales/occurrenceConversation.en.locale.json',
    ]) {
      const locale = JSON.parse(readFileSync(file, 'utf8')) as {
        watchers?: Record<string, unknown>
      }
      for (const key of [
        'title',
        'description',
        'empty',
        'add',
        'remove',
        'active',
        'ineligible',
      ]) {
        expect(typeof locale.watchers?.[key]).toBe('string')
      }
    }
    for (const file of [
      'src/modules/company-settings/locales/companySettings.locale.json',
      'src/modules/company-settings/locales/companySettings.en.locale.json',
    ]) {
      const locale = JSON.parse(readFileSync(file, 'utf8')) as { tabs: Record<string, unknown> }
      expect(typeof locale.tabs.occurrenceWatchers).toBe('string')
    }
  })
})
