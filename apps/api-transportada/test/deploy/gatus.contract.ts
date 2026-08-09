/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const GATUS_DIRECTORY = new URL('deploy/gatus/', REPOSITORY_ROOT)
const DOCKERFILE_PATH = new URL('Dockerfile', GATUS_DIRECTORY)
const CONFIGURATION_PATH = new URL('config.yaml', GATUS_DIRECTORY)
const RAILWAY_PATH = new URL('railway.json', GATUS_DIRECTORY)

/** Production entra na configuração junto com o backup de lá; até a T018, só staging existe. */
const ENVIRONMENT = 'staging'
/** `0 6 * * *` no `deploy/backup/railway.json`: a janela real é 24h, e a folga é o que sobra. */
const BACKUP_SCHEDULE_HOURS = 24
/** `0 7 5 * *` no `restore-test.yml`: entre 5 de janeiro e 5 de fevereiro cabem 31 dias. */
const RESTORE_SCHEDULE_HOURS = 31 * 24

type ExternalEndpoint = Readonly<{
  alerts?: readonly Readonly<{
    'failure-threshold'?: number
    'success-threshold'?: number
    type?: string
  }>[]
  group?: string
  heartbeat?: Readonly<{ interval?: string }>
  name?: string
  token?: string
}>

type Endpoint = Readonly<{
  alerts?: readonly Readonly<{ 'failure-threshold'?: number; type?: string }>[]
  group?: string
  name?: string
  url?: string
}>

type GatusConfiguration = Readonly<{
  alerting?: Readonly<{ ntfy?: Readonly<Record<string, unknown>> }>
  'external-endpoints'?: readonly ExternalEndpoint[]
  endpoints?: readonly Endpoint[]
  security?: Readonly<{ oidc?: Readonly<Record<string, unknown>> }>
  storage?: Readonly<{ path?: string; type?: string }>
}>

async function readConfiguration(): Promise<GatusConfiguration> {
  return Bun.YAML.parse(await Bun.file(CONFIGURATION_PATH).text()) as GatusConfiguration
}

/**
 * O grupo é o ambiente, então nome sozinho não identifica monitor: o `backup` de production vai
 * conviver com o de staging na mesma configuração assim que a T018 subir.
 */
function externalEndpoint(configuration: GatusConfiguration, name: string): ExternalEndpoint {
  const found = configuration['external-endpoints']?.find(
    (entry) => entry.name === name && entry.group === ENVIRONMENT,
  )
  if (found === undefined) {
    throw new Error(`External endpoint ${ENVIRONMENT}_${name} is not declared`)
  }
  return found
}

/** O Gatus aceita `26h`, `1560m`, `30s`. O contrato compara janelas, então normaliza para horas. */
function hoursOf(interval: string | undefined): number {
  const matched = /^(\d+)(h|m|s)$/.exec(interval ?? '')
  if (matched === null) {
    throw new Error(`Interval ${String(interval)} is not a plain duration`)
  }
  const amount = Number(matched[1])
  if (matched[2] === 'h') return amount
  return matched[2] === 'm' ? amount / 60 : amount / 3600
}

describe('contrato do serviço gatus', () => {
  /**
   * Painel de ops com senha própria é mais uma credencial para vazar, e o realm já sabe quem é
   * operador. O segredo do client não pode estar no arquivo: ele é versionado.
   */
  test('o login sai do Keycloak e nenhum valor do OIDC é literal', async () => {
    const configuration = await readConfiguration()
    const oidc = configuration.security?.oidc

    expect(oidc).toBeDefined()
    for (const key of ['issuer-url', 'client-id', 'client-secret', 'redirect-url']) {
      expect(String(oidc?.[key] ?? '')).toMatch(/^\$\{[A-Z_]+\}/)
    }
  })

  /**
   * Histórico em memória some no primeiro restart, e com ele a prova de que o ciclo de ontem
   * pingou — que é exatamente o que o teste de restore e a auditoria vão procurar.
   */
  test('o estado é persistido em disco, não em memória', async () => {
    const configuration = await readConfiguration()

    expect(configuration.storage?.type).toBe('sqlite')
    expect(configuration.storage?.path ?? '').toStartWith('/data/')
  })

  /**
   * O bucket de ops serve staging e production, e o mesmo vale para o painel: heartbeat sem
   * ambiente no grupo é production caindo e ninguém sabendo qual dos dois avisou.
   */
  test('backup e restore têm heartbeat de push, agrupados por ambiente', async () => {
    const configuration = await readConfiguration()

    for (const name of ['backup', 'restore']) {
      const endpoint = externalEndpoint(configuration, name)
      expect(endpoint.token ?? '').toMatch(/^\$\{[A-Z_]+\}$/)
    }
  })

  /**
   * O alerta não é o ping que chega, é o ping que falta. Intervalo menor que a janela do
   * agendamento é falso positivo toda semana; o que se pede é folga, não aperto.
   */
  test('a janela de cada heartbeat tem folga sobre o agendamento real', async () => {
    const configuration = await readConfiguration()
    const backup = hoursOf(externalEndpoint(configuration, 'backup').heartbeat?.interval)
    const restore = hoursOf(externalEndpoint(configuration, 'restore').heartbeat?.interval)

    expect(backup).toBeGreaterThan(BACKUP_SCHEDULE_HOURS)
    expect(backup).toBeLessThan(BACKUP_SCHEDULE_HOURS * 2)
    expect(restore).toBeGreaterThan(RESTORE_SCHEDULE_HOURS)
    expect(restore).toBeLessThan(RESTORE_SCHEDULE_HOURS * 2)
  })

  /** Monitor sem alerta é gráfico bonito: fica vermelho sozinho e não acorda ninguém. */
  test('todo monitor tem pelo menos um alerta declarado', async () => {
    const configuration = await readConfiguration()
    const monitors = [
      ...(configuration['external-endpoints'] ?? []),
      ...(configuration.endpoints ?? []),
    ]

    expect(monitors.length).toBeGreaterThanOrEqual(4)
    for (const monitor of monitors) {
      expect(monitor.alerts ?? []).not.toBeEmpty()
    }
  })

  /**
   * O padrão do Gatus é alertar depois de três falhas seguidas, e falha de heartbeat só nasce ao
   * fim de uma janela: no backup diário isso seria avisar no terceiro dia sem backup. Endpoint de
   * push alerta na primeira janela vencida — a repetição que faz sentido em HTTP intermitente é
   * exatamente o que atrasa o alerta aqui.
   */
  test('heartbeat perdido alerta na primeira janela, não na terceira', async () => {
    const configuration = await readConfiguration()

    for (const endpoint of configuration['external-endpoints'] ?? []) {
      for (const alert of endpoint.alerts ?? []) {
        expect(alert['failure-threshold']).toBe(1)
      }
    }
  })

  /**
   * O outro lado da mesma conta. O padrão do Gatus resolve o incidente depois de dois sucessos
   * seguidos, e sucesso de heartbeat é o push do próximo ciclo: no backup diário o "voltou" chegaria
   * dois dias depois, no restore mensal chegaria em dois meses. Um ciclo verde já é a prova de que
   * voltou — o segundo só serve para desconfiar de coisa que oscila, e push não oscila.
   */
  test('heartbeat que voltou resolve no primeiro ciclo verde, não no segundo', async () => {
    const configuration = await readConfiguration()

    for (const endpoint of configuration['external-endpoints'] ?? []) {
      for (const alert of endpoint.alerts ?? []) {
        expect(alert['success-threshold']).toBe(1)
      }
    }
  })

  test('a API e o frontend são vigiados pelo lado de fora', async () => {
    const configuration = await readConfiguration()
    const urls = (configuration.endpoints ?? []).map((entry) => entry.url ?? '')

    expect(urls.some((url) => url.endsWith('/health/ready'))).toBeTrue()
    expect(urls.length).toBeGreaterThanOrEqual(2)
    // O host muda por instalação, então vem do ambiente; o que não muda é não ser texto claro.
    for (const url of urls) {
      expect(url).toMatch(/^(?:\$\{[A-Z_]+\}|https:\/\/)/)
    }
  })

  /** Configuração embutida na imagem é configuração revisada no pull request que a muda. */
  test('a configuração viaja na imagem e a Railway constrói pelo Dockerfile', async () => {
    const dockerfile = await Bun.file(DOCKERFILE_PATH).text()
    const railway = (await Bun.file(RAILWAY_PATH).json()) as {
      build?: { builder?: string; dockerfilePath?: string }
    }

    expect(dockerfile).toContain('COPY deploy/gatus/config.yaml')
    expect(railway.build?.builder).toBe('DOCKERFILE')
    expect(railway.build?.dockerfilePath).toBe('deploy/gatus/Dockerfile')
  })

  /**
   * O ntfy.sh público engoliu os alertas em silêncio: o Gatus disparava, o POST estourava em
   * timeout, e — como o envio falhou — o alerta nem ficava marcado como disparado, então o aviso de
   * resolvido também nunca vinha. Servidor de terceiro é uma dependência que não avisa quando para
   * de aceitar você. O nosso é `deploy/ntfy/`, e a URL vem do ambiente porque muda por instalação.
   */
  test('o alerta sai para o servidor da instalação, autenticado', async () => {
    const configuration = await readConfiguration()
    const ntfy = configuration.alerting?.ntfy

    expect(String(ntfy?.url ?? '')).toMatch(/^\$\{[A-Z_]+\}$/)
    expect(String(ntfy?.token ?? '')).toMatch(/^\$\{[A-Z_]+\}$/)
  })

  test('nenhum segredo literal: token, senha e URL de alerta vêm do ambiente', async () => {
    const content = await Bun.file(CONFIGURATION_PATH).text()

    for (const [, value] of content.matchAll(/(?:token|client-secret|topic|password):\s*(\S+)/g)) {
      expect(value).toMatch(/^["']?\$\{[A-Z_]+\}["']?$/)
    }
  })
})
