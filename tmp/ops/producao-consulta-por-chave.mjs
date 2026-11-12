// Roda DENTRO do container do worker (cwd = /app/apps/worker-transportada). Uma consulta consChNFe, somente leitura.
// Imprime só linhas __RESULT__ com cStat, xMotivo e schema. Nunca o XML, o certificado ou a senha.
const DIST = '/app/apps/worker-transportada/dist'
const chaveNfe = process.env.CHAVE_NFE ?? ''
if (!/^[0-9]{44}$/.test(chaveNfe)) {
  console.log('__RESULT__ erro=chave_invalida')
  process.exit(2)
}

const { createDrizzleProvider } = await import('@adatechnology/drizzle-provider')
const { createSecretEnvelopeProvider } = await import('@adatechnology/secret-envelope')
const { NfeDistribuicaoProvider } = await import('@adatechnology/fiscal-provider')
const { parseWorkerCryptographicConfiguration } = await import(`${DIST}/config/cryptographic-configuration.schema.js`)
const { createDigitalCertificateSecretService } = await import(`${DIST}/cte-issuance/application/digital-certificate-secret.service.js`)
const { DrizzleNfeDistributionProfileRepository } = await import(`${DIST}/nfe-distribution/infrastructure/drizzle-nfe-distribution-profile.repository.js`)
const { toNfeDistribuicaoProviderConfig } = await import(`${DIST}/nfe-distribution/infrastructure/adatechnology-nfe-distribution-provider.factory.js`)
const { companyFiscalProfiles } = await import(`${DIST}/database/nfe.schema.js`)

const cryptography = parseWorkerCryptographicConfiguration(process.env)
const database = createDrizzleProvider({
  connection: { connection: { TimeZone: 'UTC' }, url: process.env.DATABASE_URL },
})

let exitCode = 0
try {
  let companyId = process.env.COMPANY_ID
  if (companyId === undefined || companyId === '') {
    const profiles = await database.db.select({ companyId: companyFiscalProfiles.companyId }).from(companyFiscalProfiles)
    if (profiles.length !== 1) {
      console.log(`__RESULT__ erro=empresa_ambigua perfis=${profiles.length} (defina COMPANY_ID)`)
      process.exit(3)
    }
    companyId = profiles[0].companyId
  }

  const repository = new DrizzleNfeDistributionProfileRepository(database.db, {
    secretService: createDigitalCertificateSecretService({
      envelopeProvider: createSecretEnvelopeProvider(cryptography.envelopeKeyRing),
    }),
  })
  const runtimeConfig = await repository.loadConfig({ companyId })
  console.log(`__RESULT__ ambiente=${runtimeConfig.environment}`)

  const provider = new NfeDistribuicaoProvider()
  let responseText = ''
  const originalFetchSefaz = provider.fetchSefaz.bind(provider)
  provider.fetchSefaz = async (...args) => {
    responseText = await originalFetchSefaz(...args)
    return responseText
  }

  let thrown
  let item
  try {
    item = await provider.consultarPorChave({ config: toNfeDistribuicaoProviderConfig(runtimeConfig), chaveNfe })
  } catch (error) {
    thrown = error
  }

  const cStat = /<cStat>([^<]*)<\/cStat>/.exec(responseText)?.[1]
  const xMotivo = /<xMotivo>([^<]*)<\/xMotivo>/.exec(responseText)?.[1]
  const schemas = [...responseText.matchAll(/<docZip[^>]*\sschema="([^"]+)"/g)].map((match) => match[1])
  const schema = schemas.length > 0 ? schemas.join(',') : item?.schema
  console.log(`__RESULT__ cStat=${cStat ?? 'sem_resposta'}`)
  console.log(`__RESULT__ xMotivo=${xMotivo ?? ''}`)
  console.log(`__RESULT__ schema=${schema ?? 'nenhum'}`)
  if (thrown !== undefined) {
    const message = String(thrown?.message ?? '')
    // Só mensagem da SEFAZ (traz cStat/xMotivo); outras podem ter detalhe do certificado
    console.log(`__RESULT__ lancou=${message.startsWith('SEFAZ') ? message : (thrown?.name ?? 'Error')}`)
    exitCode = 1
  }
} finally {
  await database.close?.()
}
process.exit(exitCode)
