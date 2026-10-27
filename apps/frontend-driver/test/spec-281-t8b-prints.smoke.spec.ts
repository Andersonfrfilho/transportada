/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 281 T8b: os prints da seção "Contato do cliente" na abertura da ocorrência, em 375 px — cliente sem contato
 * (pede ao motorista), número novo com tela de confirmação, vários números e e-mails (o do escritório só leitura, o do
 * motorista com editar e remover), edição e remoção. Fora do smoke da CI: roda com
 * `PLAYWRIGHT_TEST_MATCH=spec-281-t8b-prints.smoke.spec.ts` e grava os PNGs em `PRINTS_DIRECTORY`.
 */
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { registerInstallationBrandMock } from './installation-brand-smoke.helper'
import { registerNotificationMocks } from './notification-smoke.helper'
import { DRIVER_DOCUMENT_ID, mockDriverTripApi } from './driver-trip-smoke.helper'

const PRINTS_DIRECTORY =
  process.env.PRINTS_DIRECTORY ??
  resolve(process.cwd(), '../../specs/281-o-whatsapp-gratuito-responde-pelo-evolution/prints')
const MOBILE = { height: 812, width: 375 } as const
const BOLETO_TYPE_ID = '00000000-0000-4000-8000-0000000000f1'
const CORS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

type Contact = {
  addressMasked: string
  channel: 'email' | 'whatsapp'
  contactId: string
  editable: boolean
  label: string
}

/** O cadastro do cliente, em memória: `office` é do escritório; o resto o motorista incluiu. */
function createContactsStore(initial: readonly Contact[]) {
  const contacts: Contact[] = [...initial]
  let sequence = 0
  return {
    contacts,
    async handle(page: Page): Promise<void> {
      await page.route(/\/client-contacts/u, async (route) => {
        const request = route.request()
        if (request.method() === 'OPTIONS') {
          await route.fulfill({ headers: CORS, status: 204 })
          return
        }
        const json = (body: unknown, status = 200) =>
          route.fulfill({
            body: JSON.stringify(body),
            contentType: 'application/json',
            headers: CORS,
            status,
          })
        const contactId = new URL(request.url()).pathname.split('/').at(-1) ?? ''
        const body = request.postData() === null ? {} : JSON.parse(request.postData() ?? '{}')
        if (request.method() === 'GET') return json({ data: contacts })
        if (request.method() === 'POST') {
          sequence += 1
          const mask = (value: string, channel: string) =>
            channel === 'whatsapp'
              ? `+55 (${value.replace(/\D/gu, '').slice(2, 4)}) *****-${value.slice(-4)}`
              : `${value.slice(0, 1)}***@${value.split('@')[1]?.slice(0, 1)}***.${value.split('.').at(-1)}`
          const created: Contact = {
            addressMasked: mask(body.address, body.channel),
            channel: body.channel,
            contactId: `00000000-0000-4000-8000-00000000a0${String(sequence).padStart(2, '0')}`,
            editable: true,
            label: body.label,
          }
          contacts.push(created)
          return json({ data: created }, 201)
        }
        const index = contacts.findIndex((contact) => contact.contactId === contactId)
        if (request.method() === 'PATCH' && contacts[index] !== undefined) {
          contacts[index] = { ...contacts[index], label: body.label ?? contacts[index].label }
          return json({ data: contacts[index] })
        }
        if (request.method() === 'DELETE') {
          contacts.splice(index, 1)
          return route.fulfill({ headers: CORS, status: 204 })
        }
        return json({ error: { code: 'NOT_FOUND' } }, 404)
      })
    },
  }
}

async function openBoleto(page: Page, contacts: readonly Contact[], theme: 'dark' | 'light') {
  await page.setViewportSize(MOBILE)
  await page.emulateMedia({ colorScheme: theme })
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
  await mockDriverTripApi({ page })
  /** Registrada depois: a lista de tipos do dublê base é trocada pela que pede o contato. */
  await page.route(/\/me\/trips\/current\/occurrence-types$/u, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS, status: 204 })
      return
    }
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            asksClientContact: true,
            attachmentMode: 'off',
            clientChannel: 'both',
            flow: 'document',
            id: BOLETO_TYPE_ID,
            name: 'Boleto da contratante',
            noteMode: 'optional',
            photoMode: 'off',
            stopKind: null,
          },
        ],
      }),
      contentType: 'application/json',
      headers: CORS,
    })
  })
  const store = createContactsStore(contacts)
  await store.handle(page)
  await loginWithMockedKeycloak(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await page.getByRole('button', { exact: true, name: 'Ocorrência' }).first().click()
  const form = page.getByRole('group', { name: 'Registrar ocorrência' })
  await form.getByRole('radio', { name: /Boleto da contratante/u }).click()
  return { form, store }
}

async function shot(locator: Locator, name: string): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await locator.page().mouse.move(0, 0)
  await locator.screenshot({ animations: 'disabled', path: resolve(PRINTS_DIRECTORY, name) })
  expect(
    await locator.page().evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0)
}

const KEYCLOAK_BASE = 'http://localhost:58080/realms/transportada-local'
const KEYCLOAK_CORS = {
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-credentials': 'true',
  'access-control-allow-origin': `http://localhost:${process.env.PLAYWRIGHT_DRIVER_PORT ?? '53112'}`,
}

function fakeJwt(claims: Readonly<Record<string, unknown>>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`
}

/**
 * O Keycloak do realm local não existe no ambiente dos prints: o login é dublado por `page.route` — descoberta,
 * autorização (302 de volta com `code`) e token (JWT sem assinatura, que o keycloak-js só decodifica). O que está
 * sob prova é a tela do app, não o Keycloak.
 */
async function loginWithMockedKeycloak(page: Page): Promise<void> {
  let nonce = ''
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'transportada.smoke-auth-me',
      JSON.stringify({ data: { roles: ['driver'] } }),
    )
  })
  await registerNotificationMocks(page)
  await registerInstallationBrandMock(page)
  await page.route(`${KEYCLOAK_BASE}/.well-known/openid-configuration`, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        authorization_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/auth`,
        end_session_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/logout`,
        issuer: KEYCLOAK_BASE,
        jwks_uri: `${KEYCLOAK_BASE}/protocol/openid-connect/certs`,
        token_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/token`,
        userinfo_endpoint: `${KEYCLOAK_BASE}/protocol/openid-connect/userinfo`,
      }),
      contentType: 'application/json',
      headers: KEYCLOAK_CORS,
    })
  })
  await page.route(/\/protocol\/openid-connect\/auth\?/u, async (route) => {
    const url = new URL(route.request().url())
    nonce = url.searchParams.get('nonce') ?? ''
    const redirect = url.searchParams.get('redirect_uri') ?? ''
    const separator = url.searchParams.get('response_mode') === 'query' ? '?' : '#'
    const state = url.searchParams.get('state') ?? ''
    await route.fulfill({
      headers: {
        location: `${redirect}${separator}state=${state}&session_state=mock&iss=${encodeURIComponent(KEYCLOAK_BASE)}&code=mock-code`,
      },
      status: 302,
    })
  })
  await page.route(`${KEYCLOAK_BASE}/protocol/openid-connect/token`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: KEYCLOAK_CORS, status: 204 })
      return
    }
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      aud: 'transportada-spa',
      azp: 'transportada-spa',
      exp: now + 3600,
      iat: now,
      iss: KEYCLOAK_BASE,
      nonce,
      preferred_username: 'local-user',
      realm_access: { roles: ['driver'] },
      sub: 'preview-driver-281',
      typ: 'Bearer',
    }
    await route.fulfill({
      body: JSON.stringify({
        access_token: fakeJwt(claims),
        expires_in: 3600,
        id_token: fakeJwt({ ...claims, typ: 'ID' }),
        refresh_expires_in: 7200,
        refresh_token: fakeJwt({ ...claims, typ: 'Refresh' }),
        token_type: 'Bearer',
      }),
      contentType: 'application/json',
      headers: KEYCLOAK_CORS,
    })
  })

  await page.goto('/')
}

const OFFICE: Contact = {
  addressMasked: 'f***@m***.test',
  channel: 'email',
  contactId: '00000000-0000-4000-8000-00000000b001',
  editable: false,
  label: 'financeiro',
}

test('print: cliente sem contato pede o número na abertura e confirma antes de guardar', async ({
  page,
}) => {
  const { form } = await openBoleto(page, [], 'light')
  const section = form.getByRole('region', { name: 'Contato do cliente' })
  await expect(section.getByText(/não tem contato guardado/u)).toBeVisible()
  await shot(section, 't8b-sem-contato-375-light.png')

  await section.getByRole('button', { name: 'Informar WhatsApp do cliente' }).click()
  await section.getByLabel('WhatsApp do cliente').fill('(16) 99999-1111')
  await section.getByLabel('Quem é (opcional)').fill('balcão')
  await shot(section, 't8b-formulario-375-light.png')
  await section.getByRole('button', { name: 'Conferir' }).click()
  await expect(section.getByTestId('client-contact-confirm')).toHaveText('+55 (16) 99999-1111')
  await shot(section, 't8b-confirmacao-375-light.png')
  await section.getByRole('button', { name: 'Confirmar e guardar' }).click()
  await expect(section.getByText('+55 (16) *****-1111')).toBeVisible()
})

test('print: vários números e e-mails, o do escritório só leitura; editar e remover', async ({
  page,
}) => {
  const { form, store } = await openBoleto(page, [OFFICE], 'dark')
  const section = form.getByRole('region', { name: 'Contato do cliente' })
  await expect(section.getByText('f***@m***.test')).toBeVisible()
  await expect(section.getByRole('button', { name: /Editar o contato f/u })).toHaveCount(0)

  await section.getByRole('button', { name: 'Informar WhatsApp do cliente' }).click()
  await section.getByLabel('WhatsApp do cliente').fill('(16) 99999-1111')
  await section.getByRole('button', { name: 'Conferir' }).click()
  await section.getByRole('button', { name: 'Confirmar e guardar' }).click()
  await section.getByRole('button', { name: 'Informar e-mail do cliente' }).click()
  await section.getByLabel('E-mail do cliente').fill('novo@mercado.test')
  await section.getByRole('button', { name: 'Conferir' }).click()
  await section.getByRole('button', { name: 'Confirmar e guardar' }).click()
  await expect(section.getByText('n***@m***.test')).toBeVisible()
  await shot(section, 't8b-varios-contatos-375-dark.png')

  await section.getByRole('button', { name: /Editar o contato \+55/u }).click()
  await section.getByLabel('Quem é (opcional)').fill('recebimento')
  await shot(section, 't8b-editar-375-dark.png')
  await section.getByRole('button', { name: 'Conferir' }).click()
  await expect(section.getByText(/recebimento/u)).toBeVisible()

  await section.getByRole('button', { name: /Remover o contato \+55/u }).click()
  await shot(section, 't8b-remover-375-dark.png')
  await section.getByRole('button', { exact: true, name: 'Remover' }).click()
  await expect(section.getByText('+55 (16) *****-1111')).toHaveCount(0)
  expect(store.contacts).toHaveLength(2)
})
