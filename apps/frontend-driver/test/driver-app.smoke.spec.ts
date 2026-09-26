/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Smoke da app do motorista (spec 189 T4.1). Roda **com** `VITE_SMOKE_AUTH_BYPASS=true`: o service
 * worker fica desligado (`main.tsx`), então o `page.route` mocka a API sem disputa com um SW real.
 * Os cenários que precisam do service worker de verdade — CA05(a) e CA09 — moram em
 * `driver-service-worker.smoke.spec.ts`, que roda à parte, sem o bypass.
 *
 * O bloco copiado de `apps/frontend-transportada/test/responsive.smoke.spec.ts:1190-1330` prova o
 * encanamento que os contratos não provam: a tela de entrada do campo, o toque virando requisição
 * com a chave de idempotência, e a fila anunciando o que ainda não subiu — adaptado para a rota
 * própria desta app (`DRIVER_ROUTE_PATH.trip = '/'`, não `/minha-viagem`) e sem `main > header`
 * fora de contexto, porque aqui o cabeçalho do módulo é o cabeçalho do app inteiro (T3.3).
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import {
  DRIVER_ACCESS_KEY,
  DRIVER_STOP_ID,
  mockDriverTripApi,
  type DriverTripApiMock,
} from './driver-trip-smoke.helper'

const VIEWPORTS = {
  desktop: { height: 900, width: 1280 },
  mobile: { height: 812, width: 375 },
  tablet: { height: 1024, width: 768 },
} as const

const DRIVER_DATABASE_NAME = 'transportada.driver-trip'
const DRIVER_DATABASE_VERSION = 3

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth))
    .toBe(true)
}

/** Toque: todo interativo visível da tela com menos de 44 px de altura ou largura (CA15). */
async function listSmallTouchTargets(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, a, input, [role=button]')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .filter((element) => element.getAttribute('aria-hidden') !== 'true')
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      .filter(({ rect }) => rect.height < 44 || rect.width < 44)
      .map(
        ({ element, rect }) =>
          `${element.tagName} "${(element.textContent ?? '').trim() || element.getAttribute('aria-label')}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
      ),
  )
}

/**
 * ADR-0075 §8: escreve um relato na fila do `IndexedDB` sob um `subHash` que nunca é o do
 * `local-user` — é o "aparelho compartilhado" da CA06, sem precisar de uma segunda conta real de
 * motorista. Roda **depois** do primeiro boot (evita a corrida com a abertura da app), então uma
 * recarga é o que faz a tela ler o item semeado.
 */
async function seedForeignPendingReport(page: Page): Promise<void> {
  await page.evaluate(
    ({ databaseName, databaseVersion, report }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('field-reports', 'readwrite')
          transaction.objectStore('field-reports').put([report], 'queue')
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => {
            database.close()
            reject(transaction.error ?? new Error('SEED_TRANSACTION_FAILED'))
          }
        }
        request.onerror = () => reject(request.error ?? new Error('SEED_OPEN_FAILED'))
      }),
    {
      databaseName: DRIVER_DATABASE_NAME,
      databaseVersion: DRIVER_DATABASE_VERSION,
      report: {
        attempts: 0,
        createdAt: new Date().toISOString(),
        report: {
          idempotencyKey: crypto.randomUUID(),
          kind: 'arrive',
          location: null,
          stopId: 'foreign-stop-id',
        },
        subHash: 'foreign-account-subhash-fixture',
      },
    },
  )
}

/**
 * ADR-0075 §8: envelhece o snapshot do dono atual além das 24 h — sem precisar esperar de verdade.
 * `readLastTripSnapshot` o descarta sozinho no próximo boot sem rede.
 */
async function ageLastTripSnapshot(page: Page, hoursAgo: number): Promise<void> {
  await page.evaluate(
    ({ databaseName, databaseVersion, hoursAgo: hours }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('trip-snapshot', 'readwrite')
          const store = transaction.objectStore('trip-snapshot')
          const lastRequest = store.get('last')
          lastRequest.onsuccess = () => {
            const subHash = lastRequest.result as string | undefined
            if (subHash === undefined) return
            const recordRequest = store.get(subHash)
            recordRequest.onsuccess = () => {
              const record = recordRequest.result as { savedAt: string } | undefined
              if (record === undefined) return
              store.put(
                { ...record, savedAt: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() },
                subHash,
              )
            }
          }
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => {
            database.close()
            reject(transaction.error ?? new Error('AGE_TRANSACTION_FAILED'))
          }
        }
        request.onerror = () => reject(request.error ?? new Error('AGE_OPEN_FAILED'))
      }),
    { databaseName: DRIVER_DATABASE_NAME, databaseVersion: DRIVER_DATABASE_VERSION, hoursAgo },
  )
}

async function grantLocation(page: Page): Promise<void> {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
}

async function openTrip(page: Page): Promise<DriverTripApiMock> {
  await page.setViewportSize(VIEWPORTS.mobile)
  await grantLocation(page)
  const api = await mockDriverTripApi({ page })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  return api
}

test('o motorista abre o produto e cai na viagem dele, não na tela de NF-e', async ({ page }) => {
  const api = await openTrip(page)

  expect(new URL(page.url()).pathname).toBe('/')
  await expect(page.locator('main > header').getByText('Veículo GCQ8E47')).toBeVisible()
  await expect(page.getByText('Praca da Se, 100').filter({ visible: true }).first()).toBeVisible()

  // Um toque, uma requisição, uma chave — é o que a idempotência do servidor casa no reenvio
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await expect.poll(() => api.reports().length).toBe(1)
  expect(api.reports()[0]?.path).toBe(`/me/trips/current/stops/${DRIVER_STOP_ID}/arrive`)
  expect(api.reports()[0]?.idempotencyKey).not.toBe('')

  await assertNoHorizontalOverflow(page)
})

test('o motorista vê os tipos de ocorrência de rua da empresa', async ({ page }) => {
  await openTrip(page)

  // Pedido do usuário (25/09): "Registrar ocorrência" da nota só existe depois de "Cheguei".
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await page.getByRole('button', { name: 'Registrar ocorrência' }).first().click()

  await expect(page.getByRole('button', { name: 'Cliente ausente' })).toBeVisible()
  await assertNoHorizontalOverflow(page)
})

test('sem a lista de tipos, o motorista vê o aviso e tenta de novo', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await grantLocation(page)
  /**
   * A falha é um interruptor, não uma contagem: falha até o teste mandar parar. No build de
   * produção a tela lê os tipos uma vez só; as duas leituras medidas na T4.1 vinham de um `vite` de
   * dev reaproveitado na porta, com o StrictMode montando a tela duas vezes (`playwright.config.ts`,
   * `shouldReuseExistingServer`). O interruptor não depende de quantas leituras houver.
   */
  const api = await mockDriverTripApi({ occurrenceTypesFailing: true, page })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()

  // Pedido do usuário (25/09): "Registrar ocorrência" da nota só existe depois de "Cheguei".
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await page.getByRole('button', { name: 'Registrar ocorrência' }).first().click()

  await expect(
    page.getByText('Não foi possível carregar os tipos de ocorrência agora.'),
  ).toBeVisible()
  // A falha na lista de tipos não trava o resto da parada.
  for (const name of ['Entreguei', 'Não entreguei', 'Deu problema']) {
    const action = page.getByRole('button', { exact: true, name })
    await expect(action.first()).toBeVisible()
    await expect(action.first()).toBeEnabled()
  }

  api.setOccurrenceTypesFailing(false)
  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('button', { name: 'Cliente ausente' })).toBeVisible()

  await assertNoHorizontalOverflow(page)
})

test('sem tipo de rua cadastrado, o motorista vê o aviso de lista vazia', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await grantLocation(page)
  await mockDriverTripApi({ page })
  await page.route(/\/me\/trips\/current\/occurrence-types$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204 })
      return
    }
    await route.fulfill({
      body: JSON.stringify({ data: [] }),
      contentType: 'application/json',
      status: 200,
    })
  })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()

  // Pedido do usuário (25/09): "Registrar ocorrência" da nota só existe depois de "Cheguei".
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await page.getByRole('button', { name: 'Registrar ocorrência' }).first().click()

  await expect(
    page.getByText('Nenhum tipo de ocorrência de rua cadastrado. Fale com o escritório.'),
  ).toBeVisible()

  await assertNoHorizontalOverflow(page)
})

test('sem sinal, a confirmação fica na fila e a tela não mente sobre isso', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await grantLocation(page)
  const api = await mockDriverTripApi({ isOffline: true, page })
  await loginAsLocalUser(page)

  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await page.getByRole('button', { name: 'Cheguei' }).click()

  await expect(page.getByText('1 confirmação aguardando envio')).toBeVisible()
  expect(api.reports()).toEqual([])

  await assertNoHorizontalOverflow(page)
})

/**
 * Decisão do usuário (2026-09-25): o cabeçalho do romaneio passou a ser só ícones — o título por
 * extenso mora num `h2` visualmente oculto (para leitor de tela) e reaparece no papel impresso. Os
 * quatro ícones (contagem de notas, aviso de não-fiscal, imprimir, mostrar/ocultar) têm dica no
 * toque/hover e `aria-label` próprio.
 */
test('o motorista leva o romaneio, só com ícones no cabeçalho', async ({ page }) => {
  await openTrip(page)

  const loadSheet = page.getByRole('region', { name: 'Romaneio de carga' })
  await expect(loadSheet.getByRole('button', { name: 'Não é documento fiscal' })).toBeVisible()
  await expect(loadSheet.getByRole('button', { name: 'Imprimir' })).toBeVisible()

  // Recolhido por padrão: a lista de notas não empurra a viagem para baixo até o motorista pedir
  const toggle = loadSheet.getByRole('button', { name: 'Mostrar notas' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(loadSheet.getByText(DRIVER_ACCESS_KEY)).toBeHidden()
  await toggle.click()
  await expect(loadSheet.getByRole('button', { name: 'Ocultar notas' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )

  // A chave por extenso é o que se consulta no portal e o que a portaria digita quando o leitor falha
  await expect(loadSheet.getByText(DRIVER_ACCESS_KEY)).toBeVisible()
  await expect(loadSheet.getByText('NF-e 900123/1')).toBeVisible()
  await expect(loadSheet.getByText('3 volumes', { exact: false })).toBeVisible()

  // E o código de barras, que é o que ela bipa
  await expect(
    page.getByRole('img', { name: /Código de barras da chave da NF-e 900123/ }),
  ).toBeVisible()

  await assertNoHorizontalOverflow(page)
})

/**
 * Decisão do usuário (2026-09-25): cada nota do cartão da parada mostra o número, volumes/peso e o
 * valor sem toque nenhum — só a chave de acesso fica recolhida atrás de "Ver chave", porque ela não
 * cabe numa linha sem empurrar o resto do cartão.
 *
 * O romaneio (`DriverLoadSheet`) fica recolhido o teste inteiro, então "NF-e 900123/1" e a chave só
 * existem uma vez na tela — a do cartão da parada, que é o que este teste mede.
 */
test('cada nota da parada mostra NF-e, volumes/peso e valor — a chave fica atrás de "Ver chave"', async ({
  page,
}) => {
  await openTrip(page)

  // `exact`: o romaneio (recolhido) tem "NF-e 900123/1 — Mercearia do Centro" na mesma página.
  await expect(page.getByText('NF-e 900123/1', { exact: true })).toBeVisible()
  await expect(page.getByText('3 volumes · 12,5 kg')).toBeVisible()
  await expect(page.getByText(/R\$\s*1\.500,00/u)).toBeVisible()

  // `[class*=]`: o romaneio (recolhido) guarda a mesma chave num `<p>` próprio, mesmo texto exato.
  // O sufixo "_" separa do botão "Ver chave" — a classe dele começa com o mesmo prefixo.
  const revealedKey = page.locator('[class*="documentDetailsKey_"]')
  await expect(revealedKey).toHaveCount(0)
  await page.getByRole('button', { name: 'Ver chave' }).click()
  await expect(page.getByRole('button', { name: 'Ocultar chave' })).toBeVisible()
  await expect(revealedKey).toHaveText(DRIVER_ACCESS_KEY)

  await assertNoHorizontalOverflow(page)
})

/**
 * CA05(b): sinal fraco. `navigator.onLine` segue `true` — o navegador acha que está tudo bem —, só
 * a sonda do Keycloak (`**\/realms/**`) é que nunca responde. A viagem salva aparece do mesmo jeito
 * que no `context.setOffline(true)` da CA05(a), e o toque fica na fila até a sonda voltar a
 * responder.
 */
test('CA05(b): sinal fraco mostra a viagem salva e drena quando o Keycloak volta a responder', async ({
  page,
}) => {
  const api = await openTrip(page)

  await page.route('**/realms/**', async (route) => {
    await route.abort()
  })
  await page.reload()

  await expect(page.getByText(/Sem conexão — dados de \d/)).toBeVisible()
  // Pedido do usuário (25/09): "Entreguei" só existe depois de "Cheguei" — a chegada libera a nota.
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await page.getByRole('button', { name: 'Entreguei' }).first().click()
  await expect(page.getByText('2 confirmações aguardando envio')).toBeVisible()
  expect(api.reports()).toEqual([])

  // A rede de volta: a sonda do Keycloak passa a responder, e a reautenticação percebe pelo
  // temporizador OU pelo `online` — aqui o teste dispara o `online` direto, o mesmo evento real.
  await page.unroute('**/realms/**')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  /**
   * Spec 189 T9.2 ("Confirmar em lote"): o toque foi gravado sem sessão — quem tinha o celular na mão
   * registrou em nome do último usuário. Depois de entrar, nada sobe sozinho: o dono confirma.
   */
  await expect(page.getByText(/2 registros feitos sem rede às \d.* — enviar\?/u)).toBeVisible({
    timeout: 20_000,
  })
  expect(api.reports()).toEqual([])
  await page.getByRole('button', { exact: true, name: 'Enviar' }).click()

  await expect.poll(() => api.reports().length, { timeout: 20_000 }).toBe(2)
  await expect(page.getByText('feito sem rede', { exact: false })).toHaveCount(0)
})

/**
 * Spec 189 T9.2 ("Confirmar em lote"): o dono que não reconhece o que foi feito sem rede descarta —
 * com a confirmação de sempre —, e nada chega ao servidor.
 */
test('confirmar em lote: o registro feito sem rede pode ser descartado depois de entrar', async ({
  page,
}) => {
  const api = await openTrip(page)

  await page.route('**/realms/**', async (route) => {
    await route.abort()
  })
  await page.reload()
  await expect(page.getByText(/Sem conexão — dados de \d/u)).toBeVisible()
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await expect(page.getByText('1 confirmação aguardando envio')).toBeVisible()

  await page.unroute('**/realms/**')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  await expect(page.getByText(/1 registro feito sem rede às \d.* — enviar\?/u)).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('button', { exact: true, name: 'Descartar' }).click()
  await expect(
    page.getByText('apaga esses registros do celular para sempre', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Descartar de vez' }).click()

  await expect(page.getByText('feito sem rede', { exact: false })).toHaveCount(0)
  await expect(page.getByText('confirmação aguardando envio', { exact: false })).toHaveCount(0)
  expect(await listSmallTouchTargets(page)).toEqual([])
  await page.waitForTimeout(500)
  expect(api.reports()).toEqual([])
})

/**
 * CA06: o que outra conta deixou na fila deste aparelho nunca sai com o token da sessão atual —
 * fica visível como "pendência de outra conta", e "Descartar" pede confirmação antes de apagar.
 */
test('CA06: pendência de outra conta fica visível e nunca é enviada', async ({ page }) => {
  const api = await openTrip(page)
  await seedForeignPendingReport(page)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()

  await expect(
    page.getByText('1 pendência de outra conta neste celular. Ela não é enviada com a sua conta.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Descartar', exact: true }).click()
  await expect(
    page.getByText('Descartar apaga essas pendências do celular para sempre', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Descartar de vez' }).click()

  await expect(
    page.getByText('pendência de outra conta neste celular', { exact: false }),
  ).toHaveCount(0)
  expect(api.reports()).toEqual([])
})

/** CA06: snapshot com mais de 24 h é descartado — o boot sem rede não confia em dado velho demais. */
test('CA06: snapshot com mais de 24 h some no boot sem rede', async ({ page }) => {
  await openTrip(page)
  await ageLastTripSnapshot(page, 25)

  await page.route('**/realms/**', async (route) => {
    await route.abort()
  })
  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'Sem conexão' })).toBeVisible()
  await expect(
    page.getByText('Sem viagem salva; conecte-se para carregar a sua viagem.'),
  ).toBeVisible()
})

/**
 * CA07: a drenagem também corre em `visibilitychange` — não só quando a rede sinaliza `online` — e
 * o temporizador de 30 s some assim que a fila zera.
 */
test('CA07: a drenagem roda em visibilitychange e o temporizador para quando a fila esvazia', async ({
  page,
}) => {
  const api = await openTrip(page)
  api.setOffline(true)
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await expect(page.getByText('1 confirmação aguardando envio')).toBeVisible()

  api.setOffline(false)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  await expect.poll(() => api.reports().length).toBe(1)
  await expect(page.getByText('confirmação aguardando envio', { exact: false })).toHaveCount(0)
})

test('CA07: o temporizador drena sozinho e para quando não há mais pendência', async ({ page }) => {
  /**
   * O toque enfileirado liga o temporizador na hora, pelo `onQueueSync`. Antes disso, ele só
   * nascia na montagem ou num gatilho (`online`/`pageshow`/`visibilitychange`), e um toque com
   * sinal fraco ficava parado. O teste ainda dispara um `visibilitychange` antes de instalar o
   * relógio falso: é o que garante um `setInterval` criado **depois** do relógio.
   *
   * O relógio falso precisa existir antes desse `setInterval` real: instalado depois, o
   * `page.clock` não o adota, e `fastForward` não dispara nada.
   */
  await page.clock.install()
  const api = await openTrip(page)
  api.setOffline(true)
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await expect(page.getByText('1 confirmação aguardando envio')).toBeVisible()

  // Liga o temporizador: ainda sem sinal, tenta e falha, mas passa a ticar sozinho daqui em diante.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(500)
  expect(api.reports()).toEqual([])

  api.setOffline(false)
  // Tique do temporizador: agora envia, e a fila zera.
  await page.clock.fastForward('00:31')
  await expect.poll(() => api.reports().length, { timeout: 10_000 }).toBe(1)

  const reportsAfterDrain = api.reports().length
  // Tique seguinte: sem nada pendente, o temporizador já parou — nenhuma requisição nova.
  await page.clock.fastForward('00:31')
  expect(api.reports().length).toBe(reportsAfterDrain)
})

/**
 * Spec 189 T9.2 (A2): a releitura de 30 s que falha (subsolo, sinal fraco) mantém a viagem em
 * memória na tela, e a faixa diz de quando ela é — nunca troca a viagem pela tela de erro.
 */
test('A2: a releitura que falha mantém a viagem na tela, com a hora do dado', async ({ page }) => {
  await page.clock.install()
  const api = await openTrip(page)
  await expect(page.getByText('Praca da Se, 100').filter({ visible: true }).first()).toBeVisible()

  api.setTripReadFailing(true)
  // O tique de 30 s, e depois as três novas tentativas do TanStack (1 s, 2 s, 4 s).
  for (let step = 0; step < 6; step += 1) {
    await page.clock.fastForward('00:31')
    await page.waitForTimeout(200)
  }

  await expect(page.getByText(/Sem atualização — dados de \d/u)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await expect(page.getByText('Praca da Se, 100').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cheguei' })).toBeVisible()
  await expect(
    page.getByText('Não foi possível carregar sua viagem', { exact: false }),
  ).toHaveCount(0)
  await assertNoHorizontalOverflow(page)
})

/** CA08: o sino aparece no cabeçalho, leva a Notificações e tem alvo de toque de 44 px. */
test('CA08: o sino leva a Notificações e tem 44 px', async ({ page }) => {
  await openTrip(page)

  const bell = page.getByRole('button', { name: 'Notificações' })
  await expect(bell).toBeVisible()
  const box = await bell.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)

  await bell.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notificações' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/notificacoes')
})

/**
 * Spec 193 CA13: a fila presa aparece no cabeçalho em viagem, `/fotos`, `/perfil` e `/fila`, com o
 * selo da contagem, e o toque abre `/fila`. O relato não sobe porque a API está sem sinal.
 */
test('CA13 (193): a fila presa mostra o selo no cabeçalho e o toque abre a fila', async ({
  page,
}) => {
  const api = await openTrip(page)
  api.setOffline(true)
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await expect(page.getByText('1 confirmação aguardando envio')).toBeVisible()

  const queueButton = page.getByRole('button', { name: 'Fila de envio, 1 pendente' })
  await expect(queueButton).toBeVisible()
  await expect(queueButton).toHaveText('1')
  const box = await queueButton.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)

  for (const path of ['/fotos', '/perfil']) {
    await page.evaluate((next) => {
      window.history.pushState({}, '', next)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, path)
    await expect(page.getByRole('button', { name: 'Fila de envio, 1 pendente' })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Fila de envio, 1 pendente' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Eventos pendentes' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/fila')
  await expect(page.getByRole('button', { name: 'Fila de envio, 1 pendente' })).toBeVisible()
  expect(api.reports()).toEqual([])
  await assertNoHorizontalOverflow(page)
})

/** CA15: nenhum interativo visível abaixo de 44×44 px em 375 px. */
test('CA15: nenhum interativo abaixo de 44x44 px em 375 px', async ({ page }) => {
  await openTrip(page)

  expect(await listSmallTouchTargets(page)).toEqual([])
})

const SECOND_TRIP = {
  id: '00000000-0000-4000-8000-000000000200',
  manifest: null,
  status: 'in_transit',
  stops: [
    {
      arrivedAt: null,
      completedAt: null,
      deliveryProof: null,
      deliveryWindowEnd: '2026-09-25T15:00:00.000Z',
      deliveryWindowStart: '2026-09-25T11:00:00.000Z',
      documents: [],
      id: '00000000-0000-4000-8000-000000000201',
      label: 'Rua das Flores, 20',
      latitude: null,
      longitude: null,
      schedule: null,
      sequence: 1,
    },
  ],
  vehiclePlate: 'ABC1D23',
} as const

/** A janela da parada é mostrada na hora do aparelho; o teste fixa o fuso da entrega. */
test.describe('CA12: duas viagens e a janela de entrega', () => {
  test.use({ timezoneId: 'America/Sao_Paulo' })

  /**
   * CA12 (spec 189 T7.2): duas viagens ativas, as duas alcançáveis. A padrão é a mais antiga em rota
   * — aqui a segunda da lista, porque a primeira ainda está só despachada —, a escolha sobrevive à
   * recarga (fica na sessão) e o Perfil mostra a placa da escolhida, não a de `trips[0]`.
   */
  test('CA12: com duas viagens, o seletor troca a viagem da tela e a placa do Perfil', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile)
    await grantLocation(page)
    await mockDriverTripApi({ page, scenario: { additionalTrips: [SECOND_TRIP] } })
    await loginAsLocalUser(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()

    const trips = page.getByRole('group', { name: 'Suas viagens' })
    // Decisão do usuário (2026-09-25): o seletor diz o caminho da viagem, não a posição na lista —
    // com uma parada só, o caminho é o rótulo dela; a placa vira linha de apoio, embaixo.
    await expect(
      trips.getByRole('button', { name: 'Rua das Flores, 20 · 1 parada' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('main > header').getByText('Veículo ABC1D23')).toBeVisible()
    // Pedido do usuário (25/09): a parada virou cabeçalho expansível — o rótulo mora no botão do
    // acordeão, não mais num `<h2>` isolado (o `<h2>` agora embrulha o botão inteiro, ver
    // DriverStopCard.component.tsx).
    await expect(
      page.getByText('Rua das Flores, 20', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible()
    // CA12 (spec 189 T7.3): a parada com janela diz a janela no cartão — dentro do botão do
    // cabeçalho, aberto por padrão porque é a única parada (sempre a atual).
    await expect(page.getByText('Janela 08:00–12:00')).toBeVisible()

    await trips.getByRole('button', { name: 'Praca da Se, 100 · 1 parada' }).click()
    await expect(page.locator('main > header').getByText('Veículo GCQ8E47')).toBeVisible()
    await expect(page.getByText('Praca da Se, 100').filter({ visible: true }).first()).toBeVisible()
    await expect(
      page.getByText('Rua das Flores, 20', { exact: true }).filter({ visible: true }),
    ).toHaveCount(0)

    await page.reload()
    await expect(page.locator('main > header').getByText('Veículo GCQ8E47')).toBeVisible()

    await page.getByRole('button', { name: 'Perfil' }).click()
    await expect(page.getByText('Veículo GCQ8E47')).toBeVisible()
    await expect(page.getByText('Veículo ABC1D23')).toHaveCount(0)

    expect(await listSmallTouchTargets(page)).toEqual([])
    await assertNoHorizontalOverflow(page)
  })
})

/**
 * CA14 (spec 189 T7.5, ADR-0075 §8): o interruptor nasce desligado, com finalidade, quem vê e
 * retenção. Ligado, com a viagem na rua e a app na tela, a posição sobe no máximo uma vez por minuto
 * (relógio falso), e a tela da viagem avisa. Desligado, nada mais sobe.
 *
 * O relógio falso vem antes do boot, como no CA07: instalado depois, ele não adota os temporizadores
 * que a app já agendou.
 */
test('CA14: com consentimento, a posição sobe 1 vez por minuto, com aviso, e para ao desligar', async ({
  page,
}) => {
  await page.clock.install()
  const api = await openTrip(page)
  const indicator = page.getByText('Compartilhando sua posição com o contratante.')
  await expect(indicator).toHaveCount(0)

  await page.getByRole('button', { name: 'Perfil' }).click()
  const toggle = page.getByRole('switch', { name: /Compartilhar minha posição/u })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(toggle).toContainText('Desligado')
  await expect(page.getByText(/^Para quê: o contratante acompanha/u)).toBeVisible()
  await expect(page.getByText(/^Quem vê: só o contratante daquela entrega/u)).toBeVisible()
  await expect(page.getByText(/^Por quanto tempo: o rastro é apagado/u)).toBeVisible()
  expect(api.locationPosts()).toEqual([])

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(api.consentWrites()).toEqual([true])

  await page.getByRole('button', { name: 'Viagem', exact: true }).click()
  await expect(indicator).toBeVisible()
  await expect.poll(() => api.locationPosts().length).toBe(1)
  expect(api.locationPosts()[0]).toEqual({ latitude: '-23.5505000', longitude: '-46.6333000' })

  // Meio minuto depois, nada: o teto é um por minuto.
  await page.clock.fastForward('00:30')
  await page.waitForTimeout(300)
  expect(api.locationPosts()).toHaveLength(1)

  await page.clock.fastForward('00:31')
  await expect.poll(() => api.locationPosts().length).toBe(2)
  await page.clock.fastForward('01:00')
  await expect.poll(() => api.locationPosts().length).toBe(3)

  await page.getByRole('button', { name: 'Perfil' }).click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  // Relógio parado no toque: na CI, o `setTimeout(0)` com que o TanStack avisa a tela da viagem
  // ainda não tinha corrido quando o `fastForward` abaixo disparou, junto, o envio agendado. Parado,
  // esse atraso vira regra — e desligar só passa se cortar o envio no próprio toque.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => api.consentWrites()).toEqual([true, false])

  const postsWhenTurnedOff = api.locationPosts().length
  await page.clock.fastForward('03:00')
  await page.waitForTimeout(300)
  expect(api.locationPosts()).toHaveLength(postsWhenTurnedOff)

  await page.getByRole('button', { name: 'Viagem', exact: true }).click()
  await expect(indicator).toHaveCount(0)
  expect(await listSmallTouchTargets(page)).toEqual([])
})

/** PNG 1×1 sintético — nenhuma foto real entra em fixture. */
const SMOKE_PHOTO = {
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
  mimeType: 'image/png',
  name: 'canhoto.png',
} as const

/**
 * Pedido do usuário (25/09): o canhoto são três botões do mesmo tamanho — "Tirar foto" abre a
 * câmera (`capture`), "Anexar" abre galeria e arquivos (sem `capture`), "Colher assinatura" tem
 * ícone próprio. Sem o rótulo solto "Anexar canhoto"; depois de anexar, a miniatura, o
 * "anexada" e o "Refazer". No cartão da parada, depois do "Entreguei" — em "Fotos pendentes" a nota
 * troca o formulário pelo aviso da fila assim que a foto entra nela (spec 159).
 */
test('canhoto: Tirar foto, Anexar e Colher assinatura, do mesmo tamanho, e a foto anexada', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await grantLocation(page)
  await mockDriverTripApi({
    page,
    scenario: {
      settlesDeliveries: true,
      stopDeliveryProof: {
        photo: 'required',
        receiverDocument: 'off',
        receiverName: 'off',
        signature: 'optional',
      },
    },
  })
  await loginAsLocalUser(page)
  // Pedido do usuário (25/09): "Entreguei" só existe depois de "Cheguei" — a chegada libera a nota.
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await page.getByRole('button', { exact: true, name: 'Entreguei' }).click()
  const item = page.locator('li', { hasText: 'Mercearia do Centro' }).last()

  const takePhoto = item.getByRole('button', { name: /^Tirar foto/u })
  const attach = item.getByRole('button', { exact: true, name: 'Anexar' })
  const sign = item.getByRole('button', { exact: true, name: 'Colher assinatura' })
  await expect(takePhoto).toHaveText(/Tirar foto \*/u)
  await expect(attach).toBeVisible()
  await expect(sign).toBeVisible()
  await expect(item.getByText('Canhoto', { exact: true })).toBeVisible()
  await expect(item.getByText('Anexar canhoto')).toHaveCount(0)
  // O input nativo fica por baixo, fora da ordem de tabulação e do leitor de tela.
  for (const input of await item.locator('input[type=file]').all()) {
    await expect(input).toHaveAttribute('aria-hidden', 'true')
    await expect(input).toHaveAttribute('tabindex', '-1')
  }

  const [takeBox, attachBox, signBox] = await Promise.all(
    [takePhoto, attach, sign].map((button) => button.boundingBox()),
  )
  for (const box of [takeBox, attachBox, signBox]) expect(box?.height).toBeGreaterThanOrEqual(44)
  // As duas portas da foto dividem a linha em partes iguais; a assinatura ocupa a linha inteira.
  expect(Math.abs((takeBox?.width ?? 0) - (attachBox?.width ?? 0))).toBeLessThanOrEqual(1)
  // Mesma linha — a folga de 1 px é o `translateY(-1px)` do hover do botão.
  expect(Math.abs((takeBox?.y ?? 0) - (attachBox?.y ?? 0))).toBeLessThanOrEqual(1)
  expect(signBox?.width ?? 0).toBeGreaterThan((takeBox?.width ?? 0) * 1.9)

  // "Anexar" abre galeria e arquivos: o seletor que ele abre não pede a câmera.
  const galleryChooser = page.waitForEvent('filechooser')
  await attach.click()
  expect(await (await galleryChooser).element().getAttribute('capture')).toBeNull()

  // "Tirar foto" abre a câmera traseira na hora.
  const cameraChooserPromise = page.waitForEvent('filechooser')
  await takePhoto.click()
  const cameraChooser = await cameraChooserPromise
  expect(await cameraChooser.element().getAttribute('capture')).toBe('environment')
  await cameraChooser.setFiles(SMOKE_PHOTO)
  await page.getByRole('button', { name: 'Usar sem recorte' }).click()

  await expect(item.getByText('Foto do canhoto anexada')).toBeVisible()
  await expect(item.getByRole('img', { name: 'Miniatura da foto do canhoto' })).toBeVisible()
  await expect(item.getByRole('button', { exact: true, name: 'Refazer' })).toBeVisible()
  await assertNoHorizontalOverflow(page)
  expect(await listSmallTouchTargets(page)).toEqual([])
})

/**
 * Spec 179 (T302/T303), pedido do usuário de 25/09: "Não entreguei" registra a ocorrência com foto
 * e a devolução. Preenche motivo, tipo e foto pela câmera; o confirmar só habilita completo.
 */
async function fillNotDelivered(page: Page): Promise<void> {
  // Pedido do usuário (25/09): "Não entreguei" só existe depois de "Cheguei" — a chegada libera a nota.
  await page.getByRole('button', { name: 'Cheguei' }).click()
  await page.getByRole('button', { exact: true, name: 'Não entreguei' }).click()
  const confirm = page.getByRole('button', { exact: true, name: 'Confirmar' })
  await expect(confirm).toBeDisabled()
  await expect(
    page.getByText('Para confirmar, falta: o motivo, o tipo de ocorrência, a foto.'),
  ).toBeVisible()

  await page.getByRole('radio', { name: 'Recusa' }).click()
  await page.getByRole('radio', { name: 'Cliente ausente' }).click()
  await expect(page.getByText('Para confirmar, falta: a foto.')).toBeVisible()
  await expect(confirm).toBeDisabled()

  const form = page.locator('fieldset', { hasText: 'Por que não entregou?' })
  const chooser = page.waitForEvent('filechooser')
  await form.getByRole('button', { name: /^Tirar foto/u }).click()
  expect(await (await chooser).element().getAttribute('capture')).toBe('environment')
  await (await chooser).setFiles(SMOKE_PHOTO)
  await expect(form.getByText('Foto da ocorrência anexada')).toBeVisible()
  await expect(form.getByRole('button', { exact: true, name: 'Anexar' })).toBeVisible()
  await expect(confirm).toBeEnabled()
  await assertNoHorizontalOverflow(page)
  expect(await listSmallTouchTargets(page)).toEqual([])
  await confirm.click()
}

test('Não entreguei: ocorrência com foto sobe direto ao storage, depois a devolução', async ({
  page,
}) => {
  const api = await openTrip(page)

  await fillNotDelivered(page)

  await expect(page.getByText('Ocorrência com foto enviada.')).toBeVisible()
  const paths = api.reports().map((report) => report.path.replace(/[0-9a-f-]{36}/gu, ':id'))
  expect(paths).toEqual([
    '/me/trips/current/stops/:id/arrive',
    '/me/trips/current/documents/:id/occurrence-uploads',
    '/me/trips/current/documents/:id/occurrence-uploads/:id/confirm',
    '/me/trips/current/documents/:id/occurrences',
    '/me/trips/current/documents/:id/return',
  ])
  expect(api.storageUploads()).toHaveLength(1)
  expect(api.storageUploads()[0]?.contentType).toBe('image/jpeg')
  expect(api.storageUploads()[0]?.bytes).toBeGreaterThan(0)
  const confirmedId = /occurrence-uploads\/([^/]+)\/confirm$/u.exec(api.reports()[2]?.path ?? '')
  expect(api.reports()[3]?.body).toMatchObject({
    attachmentObjectId: confirmedId?.[1],
    occurrenceTypeId: '00000000-0000-4000-8000-0000000000e1',
  })
  expect(api.reports()[4]?.body).toMatchObject({ reason: 'recipient_refused' })
  expect(api.reports()[3]?.idempotencyKey).not.toBe(api.reports()[4]?.idempotencyKey)
})

test('Não entreguei sem sinal: foto e ocorrência na fila, e "enviado" só depois de subir', async ({
  page,
}) => {
  const api = await openTrip(page)
  api.setOffline(true)

  await fillNotDelivered(page)

  await expect(
    page.getByText('Ocorrência com foto na fila — sobe quando o sinal voltar.'),
  ).toBeVisible()
  // Pedido do usuário (25/09): "Cheguei" entrou na mesma fila — chegada + ocorrência + devolução.
  await expect(page.getByText('3 confirmações aguardando envio')).toBeVisible()
  await expect(page.getByText('Ocorrência com foto enviada.')).toHaveCount(0)
  expect(api.storageUploads()).toEqual([])
  expect(api.reports().filter((report) => report.path.endsWith('/occurrences'))).toEqual([])

  await page.getByRole('button', { name: /confirmações aguardando envio/u }).click()
  await expect(page.getByText('Ocorrência com foto')).toBeVisible()
  await expect(page.getByText('1 anexo')).toBeVisible()
  await page.getByRole('button', { name: 'Voltar' }).click()

  api.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  await expect(page.getByText('Ocorrência com foto enviada.')).toBeVisible()
  expect(api.storageUploads()).toHaveLength(1)
  expect(api.reports().map((report) => report.path.split('/').at(-1))).toEqual([
    'arrive',
    'occurrence-uploads',
    'confirm',
    'occurrences',
    'return',
  ])
})
