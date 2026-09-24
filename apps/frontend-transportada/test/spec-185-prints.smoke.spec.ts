/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { COMPANY_SETTINGS_RESPONSE } from './company-settings/company-settings.fixture'
import { mockTripWorkspaceApi, TRIP_ID } from './trip-smoke.helper'

/**
 * Spec 185 T7.1 (`web.md` §15): os prints da revisão de design do despacho "leva todas" — o
 * diálogo, o aviso de sucesso, a frase de bloqueio, o cabeçalho da viagem despachada e a caixa
 * "A viagem segue sem a nota" no catálogo de tipos de ocorrência. Fora do smoke da CI — roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-185-prints.smoke.spec.ts` e grava os PNGs ao lado da spec, mesmo
 * arranjo de `spec-181-prints.smoke.spec.ts`/`spec-164-prints.smoke.spec.ts`.
 */
const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/185-carregou-tudo-a-viagem-sai/prints',
)
const PHONE = { height: 844, width: 375 } as const
const DESKTOP = { height: 900, width: 1440 } as const
const THEMES = ['dark', 'light'] as const
type Theme = (typeof THEMES)[number]
const VIEWPORTS = [
  ['mobile', PHONE],
  ['desktop', DESKTOP],
] as const

/**
 * `canReadTrip` (`trip.constant.ts`) só aceita `fleet.read` ou `trip.report-on-behalf` — não existe
 * permissão `trip.read`. A segunda evita o painel de prontidão fiscal (que pede `fleet.read`, spec
 * 156 D11) e ainda libera "Iniciar rota" (`canOfferTripFieldAction`) no modo `dispatched`.
 */
const DISPATCH_PERMISSIONS = ['trip.report-on-behalf', 'trip.manage'] as const
const DISPATCHED_PERMISSIONS = ['trip.report-on-behalf', 'trip.manage'] as const

function printPath(name: string, theme: Theme): string {
  return resolve(PRINTS_DIRECTORY, `${name}-${theme}.png`)
}

/**
 * ⚠️ Nunca `page.goto` para rota interna — a SPA não tem router de servidor (CLAUDE.md do app);
 * navegação é sempre `pushState` + `popstate` (mesmo helper de `spec-164-prints.smoke.spec.ts`,
 * `trip-timeline.smoke.spec.ts` e `field-delivery.smoke.spec.ts`).
 */
async function navigateTo(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function openTrip(input: Readonly<{ page: Page; permissions: readonly string[] }>) {
  await mockTripWorkspaceApi({
    mode: 'dispatch-flow',
    page: input.page,
    permissions: input.permissions,
  })
  await loginAsLocalUser(input.page)
  await navigateTo(input.page, `/trips/${TRIP_ID}`)
  await expect(
    input.page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' }),
  ).toBeVisible()
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: diálogo "Despachar" leva todas — ${label} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await openTrip({ page, permissions: DISPATCH_PERMISSIONS })

      await page.getByRole('button', { name: 'Despachar', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'Despachar a viagem' })).toBeVisible()
      await expect(dialog.getByText(/notas? com ocorrência/u)).toBeVisible()
      await dialog.screenshot({ path: printPath(`dialogo-despachar-leva-todas-${label}`, theme) })
    })
  }
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: aviso "Viagem despachada." — ${label} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await openTrip({ page, permissions: DISPATCH_PERMISSIONS })

      /** A primeira nota "separada" é a que o mock de `.../load` despacha sozinha. */
      await page.getByRole('button', { name: 'Carregar' }).first().click()
      const notice = page.getByText('Viagem despachada.')
      await expect(notice).toBeVisible()
      await notice.locator('..').screenshot({
        path: printPath(`aviso-viagem-despachada-${label}`, theme),
      })
    })
  }
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: frase de bloqueio do despacho automático — ${label} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await openTrip({ page, permissions: DISPATCH_PERMISSIONS })

      /** A segunda nota "separada" é a que o mock de `.../load` recusa (parada sem agendamento). */
      await page.getByRole('button', { name: 'Carregar' }).nth(1).click()
      const notice = page.getByText(/A viagem não saiu:.*aguardando agendamento\./u)
      await expect(notice).toBeVisible()
      await notice.locator('..').screenshot({
        path: printPath(`bloqueio-despacho-aguardando-agendamento-${label}`, theme),
      })
    })
  }
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: cabeçalho da viagem despachada — ${label} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await mockTripWorkspaceApi({
        mode: 'dispatched',
        page,
        permissions: DISPATCHED_PERMISSIONS,
      })
      await loginAsLocalUser(page)
      await navigateTo(page, `/trips/${TRIP_ID}`)
      await expect(page.getByRole('heading', { level: 1, name: 'Detalhe da viagem' })).toBeVisible()

      /** O selo do cabeçalho e a fase da linha de progresso repetem o mesmo rótulo. */
      await expect(page.getByText('Despachada').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Despachar', exact: true })).toHaveCount(0)
      await expect(page.getByText('Conferir carga')).toHaveCount(0)

      await page.screenshot({
        fullPage: true,
        path: printPath(`cabecalho-viagem-despachada-${label}`, theme),
      })
    })
  }
}

const OCCURRENCE_TYPE_SEPARATION_ID = '00000000-0000-4000-8000-000000000901'
const OCCURRENCE_TYPE_DELIVERY_ID = '00000000-0000-4000-8000-000000000902'
const COMPANY_SETTINGS_CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, PATCH, POST, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

async function fulfillCompanySettingsJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: COMPANY_SETTINGS_CORS_HEADERS,
    status,
  })
}

const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

/**
 * Spec 185 T7.1: duas causas empilhadas fizeram a tela cair no aviso genérico "Não foi possível
 * carregar as configurações" em vez das abas:
 *
 * 1. `company-settings-smoke.helper.ts` fixa `access-control-allow-origin` em
 *    `http://localhost:53000` — com `PLAYWRIGHT_FRONTEND_PORT` diferente (53185, para não colidir
 *    com outra sessão) o navegador recusa a resposta por CORS. O dublê aqui usa `'*'`, como
 *    `trip-smoke.helper.ts` já faz.
 * 2. **Sob `VITE_SMOKE_AUTH_BYPASS=true` a identidade nunca sai pela rede** — `fetchAuthMe`
 *    (`useAuthMe.query.ts`) lê `sessionStorage['transportada.smoke-auth-me']` direto e nem chama
 *    `/auth/me`; mockar só a rota (como a primeira tentativa fazia) deixa a leitura sem nada e a
 *    consulta de identidade lança `IDENTITY_SMOKE_AUTH_ME_MISSING` antes de qualquer pedido a
 *    `/company-settings` sair.
 *
 * Catálogo com um tipo de separação (mostra "A viagem segue sem a nota") e um de entrega (não
 * mostra).
 */
async function mockCompanySettingsOccurrenceTypesWorkspace(page: Page): Promise<void> {
  await page.addInitScript(
    ({ storageKey }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          data: {
            company: { id: '00000000-0000-4000-8000-000000000001' },
            identity: { userId: '00000000-0000-4000-8000-000000000002' },
            permissions: ['settings.manage'],
            roles: ['viewer'],
          },
        }),
      )
    },
    { storageKey: SMOKE_AUTH_ME_STORAGE_KEY },
  )
  await page.route('**/company-users/*/picture', async (route) => {
    await route.fulfill({ headers: COMPANY_SETTINGS_CORS_HEADERS, status: 404 })
  })
  await page.route('**/company-settings/logo', async (route) => {
    await route.fulfill({ headers: COMPANY_SETTINGS_CORS_HEADERS, status: 404 })
  })
  await page.route(/\/digital-certificates(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: COMPANY_SETTINGS_CORS_HEADERS, status: 204 })
      return
    }
    await fulfillCompanySettingsJson(route, { data: [], page: { nextCursor: null } })
  })
  await page.route(/\/company-settings\/occurrence-types$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: COMPANY_SETTINGS_CORS_HEADERS, status: 204 })
      return
    }
    await fulfillCompanySettingsJson(route, {
      data: [
        {
          active: true,
          allowsMultipleItems: true,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          id: OCCURRENCE_TYPE_SEPARATION_ID,
          leavesDocumentBehind: true,
          name: 'Item avariado',
          notifies: false,
          redeliveryPolicy: 'unset',
          stage: 'separation',
        },
        {
          active: true,
          allowsMultipleItems: true,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          id: OCCURRENCE_TYPE_DELIVERY_ID,
          leavesDocumentBehind: false,
          name: 'Cliente ausente',
          notifies: true,
          redeliveryPolicy: 'allowed',
          stage: 'delivery',
        },
      ],
    })
  })
  /**
   * A rota `/company-settings` exata — sem o `$` ela seria engolida pela de `occurrence-types`.
   * `COMPANY_SETTINGS_RESPONSE` é o fixture do contrato (`isSettingsResponse` valida o formato
   * inteiro — perfil, CT-e, MDF-e, faturamento — e um objeto reconstruído à mão reprovava com
   * `COMPANY_SETTINGS_RESPONSE_INVALID`, derrubando a página inteira para o assistente de
   * cadastro fiscal em vez das abas).
   */
  await page.route(/\/company-settings(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: COMPANY_SETTINGS_CORS_HEADERS, status: 204 })
      return
    }
    await fulfillCompanySettingsJson(route, COMPANY_SETTINGS_RESPONSE)
  })
}

for (const theme of THEMES) {
  for (const [label, viewport] of VIEWPORTS) {
    test(`print: catálogo de ocorrência — "A viagem segue sem a nota" (${label} ${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme: theme })
      await mockCompanySettingsOccurrenceTypesWorkspace(page)
      await loginAsLocalUser(page)
      await navigateTo(page, '/company-settings?tab=occurrenceTypes')

      /**
       * `.last()`: a seção externa do workspace inteiro também "tem" o título como descendente
       * (mesma armadilha de `spec-164-prints.smoke.spec.ts`) — a mais interna é a certa.
       */
      const panel = page
        .locator('section', {
          has: page.getByRole('heading', { level: 3, name: 'Tipos de ocorrência' }),
        })
        .last()
      await expect(panel.getByText('Item avariado')).toBeVisible()
      await expect(panel.getByText('Cliente ausente')).toBeVisible()
      /**
       * Duas caixas: a do tipo "Item avariado" (separação) e a do formulário "cadastrar tipo
       * novo", que também nasce em separação por padrão — nenhuma delas pertence ao tipo de
       * entrega "Cliente ausente", que é o contraste que o print prova.
       */
      await expect(
        panel.getByRole('checkbox', { name: 'A viagem segue sem a nota' }).first(),
      ).toBeVisible()
      await panel.screenshot({
        path: printPath(`catalogo-ocorrencia-segue-sem-nota-${label}`, theme),
      })
    })
  }
}
