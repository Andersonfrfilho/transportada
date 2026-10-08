// Lê e (com APPLY=1) acrescenta as origens que faltam à regra de CORS do bucket; não remove nem alarga nada. Sem APPLY, só lê. Rodar na API:
//   railway ssh -e staging -s api -- sh -c 'APPLY=1 bun -e "$(cat)"' < scripts/diagnostics/bucket-cors-apply.ts
const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ??
  [
    'https://motorista.staging.fernandes-transportadora.com.br',
    'https://app.staging.fernandes-transportadora.com.br',
    'https://cliente.staging.fernandes-transportadora.com.br',
  ].join(',')
).split(',')
const SDK_PATH =
  '/app/node_modules/.bun/@aws-sdk+client-s3@3.1091.0/node_modules/@aws-sdk/client-s3'
const { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } = await import(SDK_PATH)

const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? process.env.STORAGE_ENDPOINT
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET
const client = new S3Client({
  endpoint,
  region: process.env.OBJECT_STORAGE_REGION ?? 'auto',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY,
  },
})
const readRules = async () =>
  client
    .send(new GetBucketCorsCommand({ Bucket: bucket }))
    .then((result: { CORSRules?: unknown }) => result.CORSRules)
    .catch(
      (error: { name?: string; message?: string }) =>
        `(${error.name}: ${String(error.message).slice(0, 120)})`,
    )

console.log('bucket', bucket, '\nregra atual:', JSON.stringify(await readRules()))
if (process.env.APPLY !== '1') {
  console.log('modo leitura (APPLY=1 grava)')
  process.exit(0)
}

const currentRules = await readRules()
const [firstRule, ...otherRules] = Array.isArray(currentRules) ? currentRules : []
const baseRule = firstRule ?? {
  AllowedMethods: ['PUT', 'GET', 'HEAD'],
  AllowedHeaders: ['content-type'],
  ExposeHeaders: ['ETag'],
  MaxAgeSeconds: 3600,
}
const mergedOrigins = [...new Set([...(baseRule.AllowedOrigins ?? []), ...ALLOWED_ORIGINS])]
await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [{ ...baseRule, AllowedOrigins: mergedOrigins }, ...otherRules],
    },
  }),
)
console.log('regra nova:', JSON.stringify(await readRules()))
process.exit(0)
