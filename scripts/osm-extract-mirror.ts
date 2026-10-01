/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Espelha o extrato datado do OSM no bucket do ambiente e devolve a URL que o build do `osrm` e do
 * `map-tiles` consome — passo do runbook `docs/runbooks/osrm-extract.md`, nunca chamada em tempo de
 * execução.
 *
 * ⚠️ **O Geofabrik apaga os datados em poucos dias, não em noventa.** Medido em 28/09/2026:
 * `sudeste-260927`, `260926` e `260925` respondiam 200; `260921`, `260914` e `260907` já davam 404 —
 * uma janela de três a sete dias. O comentário do `.railway/railway.ts` afirmava noventa dias, e foi
 * essa conta errada que deixou os dois builds em 404 no dia 25/09: a data fixada em 14/09 já não
 * existia. Enquanto o `.pbf` vier de lá, toda reconstrução não planejada é um 404 à espera.
 *
 * O espelho corta a dependência na direção certa. O objeto passa a viver no bucket do ambiente e não
 * some mais; o que vence é a **assinatura** da URL, em noventa dias. O ganho não é o prazo, é o custo
 * de renovar: hoje um 404 obriga a bumpar a data, e a data arrasta o extrato de pedágio junto
 * (`toll-booths/osm/<dataset>/<data>/` tem de descrever o mesmo `.pbf`); com o espelho, renovar é
 * re-assinar o mesmo objeto — `--presign-only` — sem tocar na data nem no pedágio.
 *
 *   bun scripts/osm-extract-mirror.ts --dataset sudeste --observed-on 2026-09-14 \
 *     --source https://download.geofabrik.de/south-america/brazil/sudeste-260914.osm.pbf
 *   bun scripts/osm-extract-mirror.ts --dataset sudeste --observed-on 2026-09-14 --presign-only
 */
import { S3Client } from 'bun'

/** Teto do Railway para URL pré-assinada. O SigV4 padrão para em 7 dias; este bucket aceita 90. */
const PRESIGN_LIFETIME_SECONDS = 90 * 24 * 60 * 60
const EXTRACT_KEY_PREFIX = 'osm-extracts'
const EXTRACT_MANIFEST_FILE = 'manifest.json'
const OBSERVED_ON_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UPLOAD_PART_SIZE_BYTES = 64 * 1024 * 1024

const REQUIRED_VARIABLES = [
  'OBJECT_STORAGE_ACCESS_KEY',
  'OBJECT_STORAGE_BUCKET',
  'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_REGION',
  'OBJECT_STORAGE_SECRET_KEY',
] as const

type ObjectStorageConfiguration = {
  readonly accessKeyId: string
  readonly bucket: string
  readonly endpoint: string
  readonly region: string
  readonly secretAccessKey: string
  readonly virtualHostedStyle: boolean
}

export function readObjectStorageConfiguration(): ObjectStorageConfiguration {
  const values = new Map(REQUIRED_VARIABLES.map((name) => [name, process.env[name] ?? '']))
  const missing = [...values].filter(([, value]) => value === '').map(([name]) => name)
  if (missing.length > 0) throw new Error(`defina ${missing.join(', ')} antes de rodar`)

  const read = (name: (typeof REQUIRED_VARIABLES)[number]): string => values.get(name) ?? ''

  // O endpoint do Railway é virtual-host, e trocar isto devolve 403 sem dizer por quê
  // (`docs/spec/railway.md`). O default segue o do schema da API, que assume MinIO local.
  const forcePathStyle = (process.env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? 'true') === 'true'
  const bucket = read('OBJECT_STORAGE_BUCKET')

  return {
    accessKeyId: read('OBJECT_STORAGE_ACCESS_KEY'),
    bucket,
    endpoint: buildEndpoint({ bucket, endpoint: read('OBJECT_STORAGE_ENDPOINT'), forcePathStyle }),
    region: read('OBJECT_STORAGE_REGION'),
    secretAccessKey: read('OBJECT_STORAGE_SECRET_KEY'),
    virtualHostedStyle: !forcePathStyle,
  }
}

/**
 * ⚠️ O `virtualHostedStyle` do Bun **não prepende o bucket** — ele assume que o endpoint já é o host
 * do bucket, e sem isto assina `https://<host>/<chave>`, sem bucket nenhum, que responde 404. O
 * `@aws-sdk/client-s3` que a API usa faz o oposto: monta o subdomínio sozinho a partir do host
 * pelado. Como as duas leem a **mesma** `OBJECT_STORAGE_ENDPOINT`, quem se ajusta é este script.
 */
function buildEndpoint(options: {
  readonly bucket: string
  readonly endpoint: string
  readonly forcePathStyle: boolean
}): string {
  if (options.forcePathStyle) return options.endpoint

  const url = new URL(options.endpoint)
  if (url.hostname.startsWith(`${options.bucket}.`)) return url.origin

  url.hostname = `${options.bucket}.${url.hostname}`
  return url.origin
}

export function buildExtractKey(dataset: string, observedOn: string): string {
  return `${EXTRACT_KEY_PREFIX}/${dataset}/${observedOn}/${dataset}.osm.pbf`
}

type MirroredExtract = {
  readonly bytes: number
  readonly sha256: string
}

async function streamSourceToBucket(options: {
  readonly client: S3Client
  readonly key: string
  readonly sourceUrl: string
}): Promise<MirroredExtract> {
  const response = await fetch(options.sourceUrl)
  if (!response.ok) throw new Error(`${options.sourceUrl} respondeu ${response.status}`)
  if (response.body === null) throw new Error(`${options.sourceUrl} não devolveu corpo`)

  const hasher = new Bun.CryptoHasher('sha256')
  const writer = options.client.file(options.key).writer({ partSize: UPLOAD_PART_SIZE_BYTES })
  let bytes = 0

  for await (const chunk of response.body) {
    hasher.update(chunk)
    bytes += chunk.byteLength
    // São centenas de megabytes: sem devolver a parte cheia ao bucket, o arquivo inteiro se acumula
    // em memória antes do primeiro byte subir.
    if (writer.write(chunk) >= UPLOAD_PART_SIZE_BYTES) await writer.flush()
  }

  await writer.end()

  return { bytes, sha256: hasher.digest('hex') }
}

async function writeManifest(options: {
  readonly client: S3Client
  readonly extract: MirroredExtract
  readonly mirror: MirrorRequest
}): Promise<void> {
  const key = `${EXTRACT_KEY_PREFIX}/${options.mirror.dataset}/${options.mirror.observedOn}/${EXTRACT_MANIFEST_FILE}`

  await options.client.file(key).write(
    JSON.stringify(
      {
        bytes: options.extract.bytes,
        dataset: options.mirror.dataset,
        mirroredAt: new Date().toISOString(),
        observedOn: options.mirror.observedOn,
        sha256: options.extract.sha256,
        sourceUrl: options.mirror.sourceUrl,
      },
      null,
      2,
    ),
    { type: 'application/json' },
  )
}

type MirrorRequest = {
  readonly dataset: string
  readonly observedOn: string
  readonly presignOnly: boolean
  readonly sourceUrl: null | string
}

export function parseArguments(argv: readonly string[]): MirrorRequest {
  const value = (name: string): null | string => {
    const index = argv.indexOf(`--${name}`)
    return index === -1 ? null : (argv[index + 1] ?? null)
  }

  const dataset = value('dataset')
  if (dataset === null) throw new Error('--dataset <nome> é obrigatório')

  const observedOn = value('observed-on')
  if (observedOn === null || !OBSERVED_ON_PATTERN.test(observedOn)) {
    throw new Error('--observed-on <AAAA-MM-DD> é obrigatório, no Last-Modified do extrato')
  }

  const presignOnly = argv.includes('--presign-only')
  const sourceUrl = value('source')
  if (!presignOnly && sourceUrl === null) {
    throw new Error('--source <url> é obrigatório fora de --presign-only')
  }

  return { dataset, observedOn, presignOnly, sourceUrl }
}

function describeExpiry(): string {
  return new Date(Date.now() + PRESIGN_LIFETIME_SECONDS * 1000).toISOString().slice(0, 10)
}

if (import.meta.main) {
  const mirror = parseArguments(process.argv.slice(2))
  const client = new S3Client(readObjectStorageConfiguration())
  const key = buildExtractKey(mirror.dataset, mirror.observedOn)
  const alreadyMirrored = await client.file(key).exists()

  if (mirror.presignOnly && !alreadyMirrored) {
    throw new Error(`${key} não está no bucket — rode uma vez sem --presign-only`)
  }

  // Create-only, como o extrato de pedágio: reescrever a chave trocaria o mapa por baixo de uma data
  // que o `toll_booth_extracts` já declara descrita. Data nova é chave nova.
  if (!mirror.presignOnly && alreadyMirrored) {
    throw new Error(`${key} já existe — use --presign-only, ou espelhe sob outra data`)
  }

  if (!mirror.presignOnly && mirror.sourceUrl !== null) {
    const extract = await streamSourceToBucket({ client, key, sourceUrl: mirror.sourceUrl })
    await writeManifest({ client, extract, mirror })
    process.stdout.write(`espelhado  ${extract.bytes} bytes · sha256 ${extract.sha256}\n`)
  }

  process.stdout.write(`objeto     ${key}\n`)
  process.stdout.write(`assinatura vence em ${describeExpiry()}\n\n`)
  // A URL é uma capacidade de leitura, limitada no tempo, sobre um extrato que já é público no
  // Geofabrik — por isso ela sai no terminal, ao contrário da credencial do bucket.
  process.stdout.write(`${client.presign(key, { expiresIn: PRESIGN_LIFETIME_SECONDS })}\n`)
}
