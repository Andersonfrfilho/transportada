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

export default defineRailway(() => {
  const transportada = github('Andersonfrfilho/transportada', {
    branch: 'staging',
    checkSuites: false,
  })

  const PostgresQ0RQ = postgres('Postgres-q0RQ', { region: 'sfo' })
  const Postgres = postgres('Postgres', { region: 'sfo' })
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'sfo',
    sizeMB: 5000,
  })
  const postgresVolume2L8j = volume('postgres-volume-2L8j', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'sfo',
    sizeMB: 5000,
  })
  const rabbitmqVolume = volume('rabbitmq-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'sfo',
    sizeMB: 5000,
  })
  const transportadaStaging = bucket('transportada-staging', { region: 'sjc' })
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
  const transportadaFrontend = service('transportada-frontend', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/frontend-transportada/Dockerfile' },
    deploy: {
      healthcheckPath: '/health/live',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
    },
    replicas: { sfo: 1 },
    domains: ['app.staging.fernandes-transportadora.com.br'],
    networking: { privateNetworkEndpoint: 'frontend' },
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
  const landing = service('landing', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/frontend-landing/Dockerfile' },
    deploy: {
      healthcheckPath: '/health/live',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
    },
    replicas: { sfo: 1 },
    domains: ['staging.fernandes-transportadora.com.br'],
    env: {
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      VITE_API_URL: preserve(),
      VITE_APP_ENV: preserve(),
      VITE_APP_URL: preserve(),
    },
  })
  const rabbitmq = service('rabbitmq', {
    source: image('rabbitmq:4-management-alpine'),
    replicas: { sfo: 1 },
    volumeMounts: { '/var/lib/rabbitmq': rabbitmqVolume },
    env: { RABBITMQ_DEFAULT_PASS: preserve(), RABBITMQ_DEFAULT_USER: preserve() },
  })
  const osrm = service('osrm', {
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/osrm/Dockerfile',
      watchPatterns: ['deploy/osrm/**'],
    },
    deploy: { restartPolicyType: 'ON_FAILURE' },
    source: transportada,
    replicas: { sfo: 1 },
    env: {
      OSRM_MAX_TABLE_SIZE: preserve(),
      OSRM_PBF_URL: preserve(),
      PORT: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
    },
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
    domains: ['api.staging.fernandes-transportadora.com.br'],
    env: {
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
  const backup = service('backup', {
    source: transportada,
    build: { builder: 'DOCKERFILE', dockerfilePath: 'deploy/backup/Dockerfile' },
    replicas: { sfo: 1 },
    deploy: { cronSchedule: '0 6 * * *', restartPolicyType: 'NEVER' },
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
    },
  })
  const mailpit = service('mailpit', {
    source: image('axllent/mailpit:latest'),
    replicas: { sfo: 1 },
    env: { MP_UI_AUTH: preserve() },
  })
  const keycloak = service('keycloak', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'deploy/keycloak/Dockerfile' },
    deploy: { restartPolicyType: 'ON_FAILURE' },
    replicas: { sfo: 1 },
    domains: ['auth.staging.fernandes-transportadora.com.br'],
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
  const stagingRefresh = service('staging-refresh', {
    source: transportada,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/staging-refresh/Dockerfile',
      watchPatterns: ['deploy/staging-refresh/**'],
    },
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

  /**
   * O portal do contratante (ADR-0050 §1): serviço próprio, e não uma rota do painel. `client` é o
   * nome do serviço, curto porque é compartilhado entre staging e production; quem carrega o nome
   * do cliente é o domínio, que é campo independente.
   */
  const client = service('client', {
    build: { builder: 'DOCKERFILE', dockerfilePath: 'apps/frontend-client/Dockerfile' },
    deploy: {
      healthcheckPath: '/health/live',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
    },
    replicas: { sfo: 1 },
    // O domínio próprio **não** se declara aqui: o `plan` recusa registrá-lo ("Custom-domain
    // registration is not supported"). Ele se cria no painel e volta pelo `railway config pull`.
  })

  return project('transportada', {
    resources: [
      worker,
      transportadaFrontend,
      client,
      PostgresQ0RQ,
      vector,
      landing,
      rabbitmq,
      osrm,
      api,
      backup,
      mailpit,
      Postgres,
      keycloak,
      cron,
      stagingRefresh,
      postgresVolume,
      postgresVolume2L8j,
      rabbitmqVolume,
      transportadaStaging,
    ],
  })
})
