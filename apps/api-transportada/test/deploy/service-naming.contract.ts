/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const RAILWAY_DOC_PATH = new URL('docs/spec/railway.md', REPOSITORY_ROOT)
const DEPLOY_WORKFLOW_PATH = new URL('.github/workflows/deploy.yml', REPOSITORY_ROOT)

/** `railway-deploy.sh deploy <serviço>` — é assim que o pipeline endereça cada serviço. */
const PIPELINE_SERVICE_PATTERN = /railway-deploy\.sh deploy ([a-z-]+)/g
/** Linha da tabela de build: `| `api` | ... |`. */
const BUILD_TABLE_SERVICE_PATTERN = /^\| `([a-z-]+)`\s+\| `apps\/|^\| `([a-z-]+)`\s+\| `deploy\//gm
/** `- api: https://<host>` na seção de domínios. */
const DOMAIN_LINE_PATTERN = /^- ([a-z-]+): `https:\/\/([a-z0-9.-]+)`$/gm

const PUBLIC_DOMAIN_PATTERN = /^transportada-afr-fernandes(?:-api|-auth)?\.up\.railway\.app$/
/** Serviço que só fala por `*.railway.internal` — domínio público nele é superfície de graça. */
const INTERNAL_SERVICES = ['worker', 'cron', 'rabbitmq'] as const

async function readDocument(): Promise<string> {
  return Bun.file(RAILWAY_DOC_PATH).text()
}

function section(content: string, heading: string): string {
  const matched = new RegExp(`^## ${heading}$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(content)
  if (matched === null) {
    throw new Error(`docs/spec/railway.md não tem a seção "${heading}"`)
  }
  return matched[1] ?? ''
}

function domainsOf(sectionContent: string): Map<string, string> {
  const domains = new Map<string, string>()
  for (const [, service, host] of sectionContent.matchAll(DOMAIN_LINE_PATTERN)) {
    if (service !== undefined && host !== undefined) {
      domains.set(service, host)
    }
  }
  return domains
}

describe('contrato de nome de serviço e de domínio', () => {
  /**
   * O serviço é do projeto, não do ambiente: renomear vale para staging e production ao mesmo
   * tempo. E `deploy.yml` endereça cada um pelo nome. Batizar o serviço de production com o nome
   * do cliente quebraria o pipeline dos dois ambientes de uma vez — o nome do cliente vive no
   * domínio, que é campo independente.
   */
  test('o pipeline só deploya serviços declarados na tabela de build', async () => {
    const document = await readDocument()
    const workflow = await Bun.file(DEPLOY_WORKFLOW_PATH).text()

    const declared = new Set(
      [...document.matchAll(BUILD_TABLE_SERVICE_PATTERN)].map(([, apps, deploy]) => apps ?? deploy),
    )
    const deployed = [...workflow.matchAll(PIPELINE_SERVICE_PATTERN)].map(([, service]) => service)

    expect(deployed).not.toBeEmpty()
    for (const service of deployed) {
      expect(declared).toContain(service)
    }
  })

  /**
   * O domínio gerado carrega o ambiente (`api-production-1a2b`), e production não diz o ambiente:
   * é o endereço que o cliente digita. Trocar depois troca a URL que ele já usa, o `FRONTEND_ORIGIN`
   * da API, o `redirect_uri` do frontend e os `redirectUris` do client no Keycloak.
   */
  test('os domínios de production carregam o nome do cliente e não o ambiente', async () => {
    const domains = domainsOf(section(await readDocument(), 'Domínios gerados de production'))

    expect([...domains.keys()].toSorted()).toEqual(['api', 'keycloak', 'transportada-frontend'])
    for (const host of domains.values()) {
      expect(host).toMatch(PUBLIC_DOMAIN_PATTERN)
    }
  })

  /**
   * Serviço interno respondendo na internet aberta entrega a topologia da infra a quem perguntar —
   * o `/health` do worker lista banco, fila e storage sem pedir credencial.
   */
  test('nenhum serviço interno aparece com domínio público', async () => {
    const document = await readDocument()
    const published = new Set([
      ...domainsOf(section(document, 'Domínios gerados de production')).keys(),
      ...domainsOf(section(document, 'Domínios gerados de staging')).keys(),
    ])

    for (const service of INTERNAL_SERVICES) {
      expect(published).not.toContain(service)
    }
  })
})
