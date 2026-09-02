/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  bucket,
  defineRailway,
  github,
  image,
  postgres,
  preserve,
  project,
  service,
  volume,
} from 'railway/iac'

/**
 * A configuração do projeto na Railway, para **os dois ambientes**. Config as Code
 * (`deploy/<servico>/railway.json`) está depreciado e serviço novo já não pode usá-lo; a ordem de
 * migração está em `docs/spec/railway.md`.
 *
 * ⚠️ **Um arquivo, dois ambientes que divergem de verdade.** Banco, volume e bucket nascem com nome
 * gerado por ambiente, e há serviço que só existe de um lado. Descrever só o ambiente onde se rodou
 * o `pull` e aplicar no outro **destrói** o que ficou de fora — daí tudo passar por `ctx`.
 *
 * ⚠️ O que os `railway.json` declaram **não vem** no `railway config pull`: ele lê o painel, e o
 * painel nunca soube do arquivo. Healthcheck, `preDeployCommand` e `cronSchedule` estão transcritos
 * à mão, conferidos contra os arquivos — que ficam no repositório até o ponteiro de config de cada
 * serviço ser limpo no painel.
 *
 * As variáveis são a **união dos dois ambientes**: `preserve()` diz "mantenha o valor que já está
 * na Railway", e nomear uma variável que só existe de um lado não a cria no outro.
 */
const VOLUME = {
  alerts: { usage: { '80': {}, '95': {}, '100': {} } },
  allowOnlineResize: true,
  region: 'sfo',
  sizeMB: 5000,
}

export default defineRailway((ctx) => {
  const isProduction = ctx.environment === 'production'
  const transportada = github('Andersonfrfilho/transportada', {
    branch: isProduction ? 'main' : 'staging',
    checkSuites: false,
  })

  const applicationDatabase = postgres(isProduction ? 'Postgres-FDoz' : 'Postgres', {
    region: 'sfo',
  })
  const identityDatabase = postgres(isProduction ? 'Postgres-Hqfu' : 'Postgres-q0RQ', {
    region: 'sfo',
  })
  const applicationVolume = volume(
    isProduction ? 'postgres-volume-Bi41' : 'postgres-volume',
    VOLUME,
  )
  const identityVolume = volume(
    isProduction ? 'postgres-volume-HrAw' : 'postgres-volume-2L8j',
    VOLUME,
  )
  const queueVolume = volume(isProduction ? 'rabbitmq-volume-V_YD' : 'rabbitmq-volume', VOLUME)
  const objectStorage = bucket(isProduction ? 'transportada-production' : 'transportada-staging', {
    region: 'sjc',
  })

  const api = service('api', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/api-transportada/Dockerfile' },
    deploy: {
      healthcheckPath: '/health/live',
      healthcheckTimeout: 120,
      preDeployCommand: ['bun src/database/pre-deploy.service.ts'],
      restartPolicyType: 'ON_FAILURE',
    },
    replicas: { sfo: 1 },
    domains: [
      isProduction
        ? 'api.fernandes-transportadora.com.br'
        : 'api.staging.fernandes-transportadora.com.br',
    ],
    env: {
      AGGREGATE_DOCUMENT_OCR_URL: preserve(),
      API_PUBLIC_URL: preserve(),
      APP_ENV: preserve(),
      APP_PORT: preserve(),
      BOOTSTRAP_TOKEN: preserve(),
      DATABASE_URL: preserve(),
      ENCRYPTION_ACTIVE_KEY_ID: preserve(),
      ENCRYPTION_KEYRING_JSON: preserve(),
      FLEET_VEHICLE_CATALOG_URL: preserve(),
      FRONTEND_ORIGIN: preserve(),
      GOOGLE_MAPS_API_KEY: preserve(),
      IDEMPOTENCY_HMAC_KEY: preserve(),
      KEYCLOAK_ADMIN_CLIENT_ID: preserve(),
      KEYCLOAK_ADMIN_CLIENT_SECRET: preserve(),
      KEYCLOAK_AUDIENCE: preserve(),
      KEYCLOAK_ISSUER: preserve(),
      KEYCLOAK_JWKS_URI: preserve(),
      LOG_LEVEL: preserve(),
      LOG_SINK_URL: preserve(),
      NFSE_CALLBACK_BASE_URL: preserve(),
      NOTIFICATION_SUPPRESSION_HMAC_KEY: preserve(),
      OBJECT_STORAGE_ACCESS_KEY: preserve(),
      OBJECT_STORAGE_BUCKET: preserve(),
      OBJECT_STORAGE_ENDPOINT: preserve(),
      OBJECT_STORAGE_FORCE_PATH_STYLE: preserve(),
      OBJECT_STORAGE_REGION: preserve(),
      OBJECT_STORAGE_SECRET_KEY: preserve(),
      PORT: preserve(),
      POSTAL_CODE_BRASIL_API_URL: preserve(),
      POSTAL_CODE_VIA_CEP_URL: preserve(),
      PROVISION_COMPANY_ID: preserve(),
      QUEUE_PREFIX: preserve(),
      RABBITMQ_URL: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      SCHEDULED_DISTRIBUTION_CRON: preserve(),
      SENTRY_DSN: preserve(),
    },
  })

  const worker = service('worker', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/worker-transportada/Dockerfile' },
    deploy: {
      healthcheckPath: '/health/live',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
    },
    replicas: { sfo: 1 },
    env: {
      ANEEL_BASE_URL: preserve(),
      ANEEL_TIMEOUT_MS: preserve(),
      ANP_BASE_URL: preserve(),
      ANP_TIMEOUT_MS: preserve(),
      APP_BASE_URL: preserve(),
      APP_ENV: preserve(),
      CTE_TECHNICAL_RESPONSIBLE_CNPJ: preserve(),
      CTE_TECHNICAL_RESPONSIBLE_CONTACT: preserve(),
      CTE_TECHNICAL_RESPONSIBLE_EMAIL: preserve(),
      CTE_TECHNICAL_RESPONSIBLE_PHONE: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_FROM: preserve(),
      ENCRYPTION_ACTIVE_KEY_ID: preserve(),
      ENCRYPTION_KEYRING_JSON: preserve(),
      FISCAL_ENVIRONMENT: preserve(),
      FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: preserve(),
      IDEMPOTENCY_HMAC_KEY: preserve(),
      LOG_LEVEL: preserve(),
      LOG_SINK_URL: preserve(),
      NFSE_CALLBACK_BASE_URL: preserve(),
      NFSE_PROVIDER_BASE_URL: preserve(),
      NOTIFICATION_SUPPRESSION_HMAC_KEY: preserve(),
      OBJECT_STORAGE_ACCESS_KEY: preserve(),
      OBJECT_STORAGE_BUCKET: preserve(),
      OBJECT_STORAGE_ENDPOINT: preserve(),
      OBJECT_STORAGE_FORCE_PATH_STYLE: preserve(),
      OBJECT_STORAGE_REGION: preserve(),
      OBJECT_STORAGE_SECRET_KEY: preserve(),
      PORT: preserve(),
      POSTAL_CODE_BRASIL_API_URL: preserve(),
      QUEUE_PREFIX: preserve(),
      RABBITMQ_URL: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      ROUTING_MATRIX_URL: preserve(),
      SENTRY_DSN: preserve(),
      SMTP_URL: preserve(),
      WORKER_PORT: preserve(),
      WORKER_PREFETCH: preserve(),
    },
  })

  const panel = service('transportada-frontend', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/frontend-transportada/Dockerfile' },
    deploy: {
      healthcheckPath: '/health/live',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
    },
    replicas: { sfo: 1 },
    domains: [
      isProduction
        ? 'app.fernandes-transportadora.com.br'
        : 'app.staging.fernandes-transportadora.com.br',
    ],
    env: {
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      VITE_API_URL: preserve(),
      VITE_APP_ENV: preserve(),
      VITE_APP_URL: preserve(),
      VITE_EMAIL_FROM: preserve(),
      VITE_IDENTIFIER_FIRST_LOGIN: preserve(),
      VITE_KEYCLOAK_CLIENT_ID: preserve(),
      VITE_KEYCLOAK_REALM: preserve(),
      VITE_KEYCLOAK_URL: preserve(),
      VITE_LANDING_APP_URL: preserve(),
    },
  })

  /**
   * A landing **é** o domínio: apex e `www` em produção, `staging.<zona>` em staging. É a exceção
   * que confirma a regra dos subdomínios por papel (`docs/spec/railway.md`).
   */
  const landing = service('landing', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/frontend-landing/Dockerfile' },
    deploy: {
      healthcheckPath: '/health/live',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
    },
    replicas: { sfo: 1 },
    domains: isProduction
      ? ['fernandes-transportadora.com.br', 'www.fernandes-transportadora.com.br']
      : ['staging.fernandes-transportadora.com.br'],
    env: {
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      VITE_API_URL: preserve(),
      VITE_APP_ENV: preserve(),
      VITE_APP_URL: preserve(),
    },
  })

  const keycloak = service('keycloak', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'deploy/keycloak/Dockerfile' },
    deploy: { restartPolicyType: 'ON_FAILURE' },
    replicas: { sfo: 1 },
    domains: [
      isProduction
        ? 'auth.fernandes-transportadora.com.br'
        : 'auth.staging.fernandes-transportadora.com.br',
    ],
    env: {
      KC_BOOTSTRAP_ADMIN_PASSWORD: preserve(),
      KC_BOOTSTRAP_ADMIN_USERNAME: preserve(),
      KC_DB: preserve(),
      KC_DB_PASSWORD: preserve(),
      KC_DB_URL: preserve(),
      KC_DB_USERNAME: preserve(),
      KC_HEALTH_ENABLED: preserve(),
      KC_HOSTNAME: preserve(),
      KC_HOSTNAME_STRICT: preserve(),
      KC_HTTP_ENABLED: preserve(),
      KC_HTTP_PORT: preserve(),
      KC_LOG_LEVEL: preserve(),
      KC_PROXY_HEADERS: preserve(),
      KEYCLOAK_ADMIN_CLIENT_SECRET: preserve(),
      KEYCLOAK_FRONTEND_ORIGIN: preserve(),
      KEYCLOAK_REALM_DISPLAY_NAME: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
    },
  })

  /**
   * ⚠️ O painel de produção diz quinze minutos, o `railway.json` diz cinco, e o arquivo vence a cada
   * deploy — então o que roda hoje é de cinco em cinco, o valor documentado da batida (`CLAUDE.md`
   * § cron-transportada). O quinze do painel é resíduo que nunca teve efeito.
   */
  const cron = service('cron', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/cron-transportada/Dockerfile' },
    deploy: { cronSchedule: '*/5 * * * *', restartPolicyType: 'NEVER' },
    replicas: { sfo: 1 },
    env: {
      APP_ENV: preserve(),
      CADENCE_MINUTES: preserve(),
      DATABASE_URL: preserve(),
      FISCAL_ENVIRONMENT: preserve(),
      LOG_LEVEL: preserve(),
      LOG_SINK_URL: preserve(),
      PAGE_SIZE: preserve(),
      QUEUE_PREFIX: preserve(),
      RABBITMQ_URL: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      SENTRY_DSN: preserve(),
    },
  })

  const rabbitmq = service('rabbitmq', {
    source: image('rabbitmq:4-management-alpine'),
    replicas: { sfo: 1 },
    volumeMounts: { '/var/lib/rabbitmq': queueVolume },
    env: { RABBITMQ_DEFAULT_PASS: preserve(), RABBITMQ_DEFAULT_USER: preserve() },
  })

  const vector = service('vector', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'deploy/vector/Dockerfile' },
    deploy: { restartPolicyType: 'ON_FAILURE' },
    replicas: { sfo: 1 },
    env: {
      LOG_ARCHIVE_S3_ACCESS_KEY: preserve(),
      LOG_ARCHIVE_S3_BUCKET: preserve(),
      LOG_ARCHIVE_S3_ENDPOINT: preserve(),
      LOG_ARCHIVE_S3_REGION: preserve(),
      LOG_ARCHIVE_S3_SECRET_KEY: preserve(),
      OPENOBSERVE_TOKEN: preserve(),
      OPENOBSERVE_URL: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
    },
  })

  /**
   * **Produção guarda cópia; staging, não.** O `backup` roda `pg_dump` diário e sobe o cifrado para
   * o bucket — em staging isso custaria armazenamento para proteger dado que o `staging-refresh`
   * repõe da própria produção. É decisão de economia, tomada por escrito.
   *
   * ⚠️ O serviço **existe** em staging hoje. Aplicar este arquivo lá o **destrói** — é a única
   * remoção intencional daqui, e ela precisa de `--confirm-destructive`.
   */
  const backup = service('backup', {
    source: transportada,
    build: { builder: 'DOCKERFILE', dockerfilePath: 'deploy/backup/Dockerfile' },
    deploy: { cronSchedule: '0 6 * * *', restartPolicyType: 'NEVER' },
    replicas: { sfo: 1 },
    env: {
      APP_DATABASE_URL: preserve(),
      BACKUP_ENCRYPTION_KEY: preserve(),
      BACKUP_ENVIRONMENT: preserve(),
      BACKUP_HEARTBEAT_TOKEN: preserve(),
      BACKUP_HEARTBEAT_URL: preserve(),
      BACKUP_S3_ACCESS_KEY_ID: preserve(),
      BACKUP_S3_BUCKET: preserve(),
      BACKUP_S3_ENDPOINT: preserve(),
      BACKUP_S3_REGION: preserve(),
      BACKUP_S3_SECRET_ACCESS_KEY: preserve(),
      KEYCLOAK_DATABASE_URL: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
    },
  })

  /** SMTP de mentira: em produção o e-mail sai de verdade, e um Mailpit ali seria caixa cega. */
  const mailpit = service('mailpit', {
    source: image('axllent/mailpit:latest'),
    replicas: { sfo: 1 },
    env: { MP_UI_AUTH: preserve() },
  })

  /** Matriz de distâncias do solver. ⚠️ Só existe em staging — ver a nota no fim do arquivo. */
  const osrm = service('osrm', {
    source: transportada,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/osrm/Dockerfile',
      watchPatterns: ['deploy/osrm/**'],
    },
    deploy: { restartPolicyType: 'ON_FAILURE' },
    replicas: { sfo: 1 },
    env: {
      OSRM_MAX_TABLE_SIZE: preserve(),
      OSRM_PBF_URL: preserve(),
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
    },
  })

  /** Repõe staging a partir do backup de produção — não tem par do outro lado, por definição. */
  const stagingRefresh = service('staging-refresh', {
    source: transportada,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/staging-refresh/Dockerfile',
      watchPatterns: ['deploy/staging-refresh/**'],
    },
    deploy: { cronSchedule: '0 5 * * 0', restartPolicyType: 'NEVER' },
    replicas: { sfo: 1 },
    env: {
      APPLICATION_DATABASE_NAME: preserve(),
      BACKUP_ENCRYPTION_KEY: preserve(),
      BACKUP_S3_ACCESS_KEY_ID: preserve(),
      BACKUP_S3_BUCKET: preserve(),
      BACKUP_S3_ENDPOINT: preserve(),
      BACKUP_S3_REGION: preserve(),
      BACKUP_S3_SECRET_ACCESS_KEY: preserve(),
      FISCAL_SOURCE_S3_BUCKET: preserve(),
      FISCAL_SOURCE_S3_ENDPOINT: preserve(),
      FISCAL_SOURCE_S3_REGION: preserve(),
      PRODUCTION_DATABASE_HOST: preserve(),
      SOURCE_BACKUP_ENVIRONMENT: preserve(),
      STAGING_API_SERVICE_ID: preserve(),
      STAGING_DATABASE_URL: preserve(),
      STAGING_ENVIRONMENT_ID: preserve(),
      STAGING_S3_ACCESS_KEY_ID: preserve(),
      STAGING_S3_BUCKET: preserve(),
      STAGING_S3_ENDPOINT: preserve(),
      STAGING_S3_REGION: preserve(),
      STAGING_S3_SECRET_ACCESS_KEY: preserve(),
    },
  })

  /** OCR self-hosted do anexo do agregado (spec 070). ⚠️ Só existe em produção — ver a nota no fim. */
  const aggregateDocumentOcr = service('aggregate-document-ocr', {
    source: image('hertzg/tesseract-server:latest'),
    replicas: { sfo: 1 },
    env: { TESSERACT_SERVER_INSTALL_LANGUAGES: preserve() },
  })

  /**
   * O portal do contratante (ADR-0050 §1): serviço próprio, e não uma rota do painel. O domínio
   * `cliente.<zona>` **não** se declara aqui — o `plan` recusa registrar domínio por código; ele se
   * cria no painel e volta pelo `railway config pull`.
   *
   * ⚠️ Ainda não existe em ambiente nenhum: é o que faz o `deploy-client` reprovar com
   * `Service not found` a cada push.
   *
   * ⚠️ `env` vazio é literal, não descuido: `preserve()` só sabe manter valor que já está na
   * Railway, e aqui não há nada a manter. As quatro `VITE_*` (`VITE_API_URL`, `VITE_CLIENT_APP_URL`,
   * `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`) são **inlinadas no
   * bundle** e precisam existir antes do primeiro build — configure-as no painel ao criar o
   * serviço, e traga-as para cá com `railway config pull`.
   */
  const client = service('client', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/frontend-client/Dockerfile' },
    deploy: {
      healthcheckPath: '/health/live',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
    },
    replicas: { sfo: 1 },
    domains: [
      isProduction
        ? 'cliente.fernandes-transportadora.com.br'
        : 'cliente.staging.fernandes-transportadora.com.br',
    ],
    env: {
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      VITE_API_URL: preserve(),
      VITE_CLIENT_APP_URL: preserve(),
      VITE_KEYCLOAK_CLIENT_ID: preserve(),
      VITE_KEYCLOAK_REALM: preserve(),
      VITE_KEYCLOAK_URL: preserve(),
    },
  })

  const shared = [
    api,
    worker,
    panel,
    landing,
    keycloak,
    cron,
    rabbitmq,
    vector,
    client,
    applicationDatabase,
    identityDatabase,
    applicationVolume,
    identityVolume,
    queueVolume,
    objectStorage,
  ]

  return project('transportada', {
    resources: isProduction
      ? [...shared, backup, aggregateDocumentOcr]
      : [...shared, mailpit, osrm, stagingRefresh],
  })
})

/**
 * ⚠️ **Três divergências entre os ambientes que este arquivo apenas registra — nenhuma foi decidida
 * aqui, e todas merecem decisão de quem responde pelo produto:**
 *
 * - **`osrm` só em staging.** O solver de produção aponta o `ROUTING_MATRIX_URL` para outro lugar,
 *   ou a sugestão de roteiro não funciona lá.
 * - **`aggregate-document-ocr` só em produção.** A leitura de imagem do anexo não tem como ser
 *   testada em staging.
 * - **`landing-TjCj-…` e `landing-uFWL-…`** existem em produção, sem domínio, e a segunda sem
 *   variável nenhuma e sem deployment. Parecem duplicatas acidentais e **não estão declaradas
 *   aqui** — um `apply` em produção as removeria. Confira antes: remoção é destrutiva.
 */
