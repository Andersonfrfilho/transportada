/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const NTFY_DIRECTORY = new URL('deploy/ntfy/', REPOSITORY_ROOT)
const DOCKERFILE_PATH = new URL('Dockerfile', NTFY_DIRECTORY)
const CONFIGURATION_PATH = new URL('server.yml', NTFY_DIRECTORY)
const RAILWAY_PATH = new URL('railway.json', NTFY_DIRECTORY)

/** O volume da Railway monta aqui; fora dele o arquivo morre no próximo deploy. */
const VOLUME_DIRECTORY = '/var/lib/ntfy/'

type NtfyConfiguration = Readonly<{
  'auth-default-access'?: string
  'auth-file'?: string
  'base-url'?: string
  'behind-proxy'?: boolean
  'cache-file'?: string
  'enable-signup'?: boolean
  'listen-http'?: string
}>

async function readConfiguration(): Promise<NtfyConfiguration> {
  return Bun.YAML.parse(await Bun.file(CONFIGURATION_PATH).text()) as NtfyConfiguration
}

describe('contrato do serviço ntfy', () => {
  /**
   * Um ntfy com domínio público e acesso padrão aberto é um mural: qualquer um que descubra o
   * tópico lê o que quebrou na instalação, e qualquer um publica alerta falso nele. `deny-all` é o
   * que transforma o tópico em endereço e o token em credencial.
   */
  test('o servidor não nasce aberto nem deixa ninguém se cadastrar', async () => {
    const configuration = await readConfiguration()

    expect(configuration['auth-default-access']).toBe('deny-all')
    expect(configuration['enable-signup']).toBeFalse()
  })

  /**
   * O `auth-file` guarda os tokens que o Gatus usa e o celular assina. Em disco efêmero, o primeiro
   * deploy depois de um alerta derrubaria a autenticação de todo mundo sem ninguém tocar em nada.
   */
  test('autenticação e histórico de mensagens ficam no volume', async () => {
    const configuration = await readConfiguration()

    expect(configuration['auth-file'] ?? '').toStartWith(VOLUME_DIRECTORY)
    expect(configuration['cache-file'] ?? '').toStartWith(VOLUME_DIRECTORY)
  })

  /**
   * Atrás do proxy da Railway, sem isto o ntfy vê um IP só — o do proxy — e o limite por IP passa
   * a valer para o mundo inteiro somado: o primeiro visitante consome a cota do alerta.
   */
  test('o limite por IP enxerga quem chamou, não o proxy', async () => {
    expect((await readConfiguration())['behind-proxy']).toBeTrue()
  })

  /**
   * Este arquivo é versionado. Quem é usuário, qual é o tópico e qual é o token entram por
   * `NTFY_AUTH_USERS`, `NTFY_AUTH_ACCESS` e `NTFY_AUTH_TOKENS` no ambiente — e a URL pública muda
   * por instalação, então nem ela é literal aqui.
   */
  test('nenhuma identidade, tópico ou segredo mora no arquivo', async () => {
    const configuration = await readConfiguration()
    const content = await Bun.file(CONFIGURATION_PATH).text()

    expect(configuration['base-url']).toBeUndefined()
    for (const option of ['auth-users', 'auth-access', 'auth-tokens']) {
      expect(configuration).not.toHaveProperty(option)
    }
    // Hash bcrypt e token do ntfy têm forma fixa: se um deles vazar para cá, o grep acha.
    expect(content).not.toMatch(/\$2[aby]\$/)
    expect(content).not.toMatch(/\btk_[a-z0-9]/)
  })

  /** Mesma escolha do gatus e do vector: a configuração viaja na imagem, revisada no pull request. */
  test('a imagem é pinada por digest e a Railway constrói pelo Dockerfile', async () => {
    const dockerfile = await Bun.file(DOCKERFILE_PATH).text()
    const railway = (await Bun.file(RAILWAY_PATH).json()) as {
      build?: { builder?: string; dockerfilePath?: string }
    }

    expect(dockerfile).toMatch(/^FROM \S+@sha256:[0-9a-f]{64}$/m)
    expect(dockerfile).toContain('COPY deploy/ntfy/server.yml')
    expect(railway.build?.builder).toBe('DOCKERFILE')
    expect(railway.build?.dockerfilePath).toBe('deploy/ntfy/Dockerfile')
  })
})
