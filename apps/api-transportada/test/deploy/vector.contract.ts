/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const VECTOR_DIRECTORY = new URL('deploy/vector/', REPOSITORY_ROOT)
const DOCKERFILE_PATH = new URL('Dockerfile', VECTOR_DIRECTORY)
const CONFIGURATION_PATH = new URL('vector.yaml', VECTOR_DIRECTORY)
const RAILWAY_PATH = new URL('railway.json', VECTOR_DIRECTORY)

/** Private networking da Railway só resolve AAAA: escutar em IPv4 é não receber nada. */
const INTAKE_ADDRESS = '[::]:9000'
const SOURCE_NAME = 'apps'

type VectorConfiguration = Readonly<{
  sinks: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  sources: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}>

async function readConfiguration(): Promise<VectorConfiguration> {
  return Bun.YAML.parse(await Bun.file(CONFIGURATION_PATH).text()) as VectorConfiguration
}

function sink(configuration: VectorConfiguration, name: string): Readonly<Record<string, unknown>> {
  const found = configuration.sinks[name]
  if (found === undefined) {
    throw new Error(`Sink ${name} is not declared`)
  }
  return found
}

describe('contrato do serviço vector', () => {
  test('o intake HTTP escuta a private networking em IPv6 e lê NDJSON', async () => {
    const configuration = await readConfiguration()
    const source = configuration.sources[SOURCE_NAME]

    expect(source).toMatchObject({
      address: INTAKE_ADDRESS,
      decoding: { codec: 'json' },
      framing: { method: 'newline_delimited' },
      type: 'http_server',
    })
  })

  test('o arquivo no bucket é o destino durável: NDJSON gzip particionado por dia', async () => {
    const configuration = await readConfiguration()
    const archive = sink(configuration, 'archive')

    expect(archive).toMatchObject({
      bucket: '${LOG_ARCHIVE_S3_BUCKET}',
      compression: 'gzip',
      encoding: { codec: 'json' },
      framing: { method: 'newline_delimited' },
      inputs: [SOURCE_NAME],
      key_prefix: 'logs/%Y/%m/%d/',
      type: 'aws_s3',
    })
  })

  test('a busca sai pelo OpenObserve, com URL e credencial do ambiente', async () => {
    const configuration = await readConfiguration()
    const search = sink(configuration, 'search')

    expect(search).toMatchObject({
      inputs: [SOURCE_NAME],
      type: 'http',
      uri: '${OPENOBSERVE_URL}',
    })
    expect(JSON.stringify(search)).toContain('${OPENOBSERVE_TOKEN}')
  })

  /**
   * O painel de busca é conveniência; o arquivo é a obrigação. OpenObserve fora do ar não pode
   * encher o buffer e travar o caminho do bucket junto.
   */
  test('o OpenObserve fora do ar descarta, em vez de segurar o arquivo', async () => {
    const search = sink(await readConfiguration(), 'search')

    expect(search).toMatchObject({
      buffer: { when_full: 'drop_newest' },
      healthcheck: { enabled: false },
    })
  })

  test('todo destino consome a mesma fonte — nenhum sink órfão', async () => {
    const configuration = await readConfiguration()
    const sinkNames = Object.keys(configuration.sinks)

    expect(sinkNames.length).toBeGreaterThanOrEqual(2)
    for (const name of sinkNames) {
      expect(`${name}:${JSON.stringify(configuration.sinks[name]?.inputs)}`).toBe(
        `${name}:["${SOURCE_NAME}"]`,
      )
    }
  })

  /** Segredo em arquivo versionado é segredo queimado — tudo que autentica vem por `${...}`. */
  test('nenhuma credencial literal na configuração', async () => {
    const content = await Bun.file(CONFIGURATION_PATH).text()
    const assignments = content.matchAll(
      /^\s*(access_key_id|secret_access_key|token|password|uri|bucket|endpoint|region):\s*(.+)$/gm,
    )

    for (const [, key = '', rawValue = ''] of assignments) {
      const value = rawValue.trim().replaceAll('"', '').replaceAll("'", '')
      expect(`${key}=${value.startsWith('${') && value.endsWith('}')}`).toBe(`${key}=true`)
    }
  })

  /**
   * A 0.57.0 desligou a interpolação de `${VAR}` por padrão, e desligada ela não avisa: o literal
   * `${LOG_ARCHIVE_S3_BUCKET}` segue como nome de bucket e o erro que chega é um `dispatch failure`
   * que não fala de variável nenhuma. Toda a configuração acima depende do `${...}` — se o comando
   * não ligar a interpolação, nada dela vale.
   */
  test('o comando liga a interpolação de variáveis que a configuração inteira pressupõe', async () => {
    const dockerfile = await Bun.file(DOCKERFILE_PATH).text()
    const configuration = await Bun.file(CONFIGURATION_PATH).text()

    expect(configuration).toContain('${')
    expect(dockerfile).toContain('--dangerously-allow-env-var-interpolation')
  })

  test('a imagem é pinada por digest, não por tag móvel', async () => {
    const dockerfile = await Bun.file(DOCKERFILE_PATH).text()
    const fromLine = dockerfile.split('\n').find((line) => line.startsWith('FROM '))

    expect(fromLine).toContain('timberio/vector:')
    expect(fromLine).toContain('@sha256:')
    expect(fromLine).not.toContain(':latest')
  })

  test('o serviço sobe pelo Dockerfile do próprio diretório, sem healthcheck público', async () => {
    const railway = (await Bun.file(RAILWAY_PATH).json()) as Readonly<{
      build: Readonly<Record<string, unknown>>
      deploy: Readonly<Record<string, unknown>>
    }>

    expect(railway.build).toMatchObject({
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/vector/Dockerfile',
    })
    expect(railway.deploy).toMatchObject({ restartPolicyType: 'ON_FAILURE' })
    expect(railway.deploy.healthcheckPath).toBeUndefined()
  })
})
