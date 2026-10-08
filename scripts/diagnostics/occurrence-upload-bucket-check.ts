// Somente leitura: não grava objeto, não imprime segredo. Rodar dentro da API do ambiente:
//   railway ssh -e staging -s api -- bun -e "$(cat scripts/diagnostics/occurrence-upload-bucket-check.ts)"
const WINDOW_HOURS = Number(process.env.WINDOW_HOURS ?? 24)
const DRIVER_ORIGIN =
  process.env.DRIVER_ORIGIN ?? 'https://motorista.staging.fernandes-transportadora.com.br'
const MAX_OBJECTS_TO_HEAD = 40

const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? process.env.STORAGE_ENDPOINT
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY ?? process.env.STORAGE_ACCESS_KEY
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY ?? process.env.STORAGE_SECRET_KEY
const region = process.env.OBJECT_STORAGE_REGION ?? process.env.STORAGE_REGION ?? 'us-east-1'
const report = (title: string, value: unknown) =>
  console.log(`## ${title}\n${JSON.stringify(value, null, 1)}`)

report('config (sem segredo)', {
  endpointHost: endpoint === undefined ? null : new URL(endpoint).host,
  bucket,
  hasAccessKey: accessKeyId !== undefined,
  hasSecretKey: secretAccessKey !== undefined,
  region,
  forcePathStyle:
    process.env.OBJECT_STORAGE_FORCE_PATH_STYLE ??
    process.env.STORAGE_FORCE_PATH_STYLE ??
    '(padrão true)',
})
if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  console.log('config incompleta')
  process.exit(1)
}

const sql = new Bun.SQL(process.env.DATABASE_URL as string, {
  max: 1,
  connection: { default_transaction_read_only: 'on' },
})
const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000)

report(
  'uploads por status',
  await sql`
  select status, count(*)::int as total, min(created_at) as first, max(created_at) as last,
         min(declared_size_bytes)::int as min_bytes, max(declared_size_bytes)::int as max_bytes,
         count(distinct mime_type)::int as mime_types
  from trip_occurrence_uploads where created_at > ${since} group by status`,
)
report(
  'uploads por viagem',
  await sql`
  select trip_id, status, count(*)::int as total from trip_occurrence_uploads
  where created_at > ${since} group by trip_id, status order by total desc limit 10`,
)

const pending =
  await sql`select id, status, object_key, bucket as row_bucket, declared_size_bytes::int as declared, created_at
  from trip_occurrence_uploads where status <> 'confirmed' and created_at > ${since} order by created_at desc limit ${MAX_OBJECTS_TO_HEAD}`
report(
  'bucket gravado nas linhas difere do configurado?',
  pending.filter((row) => row.row_bucket !== bucket).length,
)

const s3 = new Bun.S3Client({ endpoint, bucket, accessKeyId, secretAccessKey, region })
const heads = await Promise.all(
  pending.map(async (row) => {
    try {
      const stat = await s3.file(row.object_key).stat()
      return { exists: true, sizeBytes: stat.size, declared: row.declared }
    } catch (error) {
      return {
        exists: false,
        reason: (error as { code?: string }).code ?? String(error).slice(0, 80),
      }
    }
  }),
)
report('objetos das linhas não confirmadas existem no bucket? (true = o PUT terminou)', {
  checked: heads.length,
  byStatus: Object.fromEntries(
    [...new Set(pending.map((row) => row.status))].map((status) => [
      status,
      pending.filter((row) => row.status === status).length,
    ]),
  ),
  exist: heads.filter((head) => head.exists).length,
  missing: heads.filter((head) => !head.exists).length,
  sizeMatchesDeclared: heads.filter((head) => head.exists && head.sizeBytes === head.declared)
    .length,
  missingReasons: [...new Set(heads.filter((head) => !head.exists).map((head) => head.reason))],
})

const bucketOrigin = `https://${bucket}.${new URL(endpoint).host}`
const probeKey = `diagnostics/cors-probe-${crypto.randomUUID()}.jpg`
const preflight = await fetch(`${bucketOrigin}/${probeKey}`, {
  method: 'OPTIONS',
  headers: {
    Origin: DRIVER_ORIGIN,
    'Access-Control-Request-Method': 'PUT',
    'Access-Control-Request-Headers': 'content-type',
  },
}).catch((error) => error as Error)
report(
  `preflight CORS do PUT em ${bucketOrigin} (nada é gravado)`,
  preflight instanceof Error
    ? { error: preflight.message }
    : {
        status: preflight.status,
        allowOrigin: preflight.headers.get('access-control-allow-origin'),
        allowMethods: preflight.headers.get('access-control-allow-methods'),
        allowHeaders: preflight.headers.get('access-control-allow-headers'),
      },
)
process.exit(0)
