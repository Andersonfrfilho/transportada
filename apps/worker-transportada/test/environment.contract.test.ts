/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { Glob } from 'bun'
import { describe, expect, test } from 'bun:test'

import {
  parseWorkerEnvironment,
  WorkerConfigurationError,
} from '../src/config/environment.schema.js'

const validEnvironment = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: 'false',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
  WORKER_PORT: '53002',
}

describe('worker environment contract', () => {
  test('pins the audited fiscal and storage packages exactly', async () => {
    const packageManifest = (await Bun.file(
      new URL('../package.json', import.meta.url),
    ).json()) as {
      readonly dependencies?: Readonly<Record<string, string>>
    }

    expect(packageManifest.dependencies?.['@adatechnology/fiscal-provider']).toBe('0.4.0')
    expect(packageManifest.dependencies?.['@adatechnology/object-storage-provider']).toBe(
      '0.2.0-rc.0',
    )
  })

  test('parses the autonomous Bun worker configuration', () => {
    expect(parseWorkerEnvironment(validEnvironment)).toEqual({
      apiBaseUrl: undefined,
      appBaseUrl: undefined,
      appEnv: 'local',
      cargoLayoutTimeBudgetMs: 120_000,
      databaseUrl: validEnvironment.DATABASE_URL,
      driverRemindersEnabled: false,
      fiscalEnvironment: 'production',
      foundationSyntheticConsumerEnabled: false,
      foundationSyntheticEffectDelayMs: 0,
      fuelPricePull: undefined,
      hostname: '0.0.0.0',
      mdfeAutoIssueEnabled: false,
      nfeXmlMailboxDomains: [],
      /** Spec 062 T005: sem segredo e sem template — o padrão é a versão da Graph API e mais nada. */
      whatsapp: {
        apiVersion: 'v23.0',
        baseUrl: undefined,
        codeTemplateLanguage: 'pt_BR',
        invitationTemplate: undefined,
        passwordResetTemplate: undefined,
      },
      logLevel: 'info',
      logSinkUrl: undefined,
      nfseProvider: {
        baseUrl: undefined,
        callbackBaseUrl: undefined,
        timeoutMilliseconds: 15_000,
      },
      port: 53_002,
      prefetch: 1,
      queuePrefix: 'transportada_local',
      routingMatrixUrl: undefined,
      postalCodeBrasilApiUrl: undefined,
      rabbitMqUrl: validEnvironment.RABBITMQ_URL,
      sentryDsn: undefined,
      sentryEnvironment: 'local',
    })
  })

  test('NFE_XML_MAILBOX_DOMAINS: lista de domínios em minúsculas; domínio inválido falha o boot', () => {
    const parsed = parseWorkerEnvironment({
      ...validEnvironment,
      NFE_XML_MAILBOX_DOMAINS: 'Fernandes-Transportadora.com.br, outro.com.br',
    })
    expect(parsed.nfeXmlMailboxDomains).toEqual(['fernandes-transportadora.com.br', 'outro.com.br'])
    expect(() =>
      parseWorkerEnvironment({ ...validEnvironment, NFE_XML_MAILBOX_DOMAINS: 'nota@x.com' }),
    ).toThrow()
  })

  test('sem SENTRY_DSN o rastreio de erro nasce desligado', () => {
    expect(
      parseWorkerEnvironment({ ...validEnvironment, SENTRY_DSN: '  ' }).sentryDsn,
    ).toBeUndefined()
  })

  test('BOT_AUDIO_TRANSCRIPTION_PROMPT: vazio some, até 300 caracteres vale, acima falha o boot', () => {
    expect(
      parseWorkerEnvironment({ ...validEnvironment, BOT_AUDIO_TRANSCRIPTION_PROMPT: ' ' })
        .botAudioTranscriptionPrompt,
    ).toBeUndefined()
    expect(
      parseWorkerEnvironment({
        ...validEnvironment,
        BOT_AUDIO_TRANSCRIPTION_PROMPT: 'Central Fernandes.',
      }).botAudioTranscriptionPrompt,
    ).toBe('Central Fernandes.')
    expect(() =>
      parseWorkerEnvironment({
        ...validEnvironment,
        BOT_AUDIO_TRANSCRIPTION_PROMPT: 'a'.repeat(301),
      }),
    ).toThrow(WorkerConfigurationError)
  })

  test('SENTRY_DSN preenchido e torto falha o boot em vez de sumir', () => {
    expect(() => parseWorkerEnvironment({ ...validEnvironment, SENTRY_DSN: 'nao-e-url' })).toThrow(
      WorkerConfigurationError,
    )
  })

  test('sem LOG_SINK_URL o transporte HTTP do log nasce desligado', () => {
    expect(
      parseWorkerEnvironment({ ...validEnvironment, LOG_SINK_URL: '  ' }).logSinkUrl,
    ).toBeUndefined()
  })

  test('LOG_SINK_URL torto falha o boot em vez de engolir log em silêncio', () => {
    expect(() =>
      parseWorkerEnvironment({ ...validEnvironment, LOG_SINK_URL: 'nao-e-url' }),
    ).toThrow(WorkerConfigurationError)
  })

  test('LOG_SINK_URL válido chega inteiro na configuração', () => {
    const sinkUrl = 'https://vector.exemplo/logs'

    expect(parseWorkerEnvironment({ ...validEnvironment, LOG_SINK_URL: sinkUrl }).logSinkUrl).toBe(
      sinkUrl,
    )
  })

  test('SENTRY_ENVIRONMENT declarado e vazio cai no APP_ENV, sem derrubar o boot', () => {
    const config = parseWorkerEnvironment({ ...validEnvironment, SENTRY_ENVIRONMENT: '   ' })

    expect(config.sentryEnvironment).toBe(config.appEnv)
  })

  /**
   * O e-mail sai só do worker. Resend vai por HTTPS e vence o SMTP quando os dois existem: porta SMTP
   * de saída é justamente o que trava em hospedagem, e a chave presente é a escolha explícita.
   */
  test('com RESEND_API_KEY, o e-mail vai pelo Resend mesmo com SMTP_URL declarado', () => {
    const parsed = parseWorkerEnvironment({
      ...validEnvironment,
      EMAIL_FROM: 'no-reply@exemplo.com.br',
      RESEND_API_KEY: 're_chave_de_contrato',
      SMTP_URL: 'smtp://localhost:51025',
    })

    expect(parsed.emailDelivery).toEqual({
      from: 'no-reply@exemplo.com.br',
      transport: { apiKey: 're_chave_de_contrato', kind: 'resend' },
    })
  })

  test('sem chave do Resend, o SMTP local continua servindo', () => {
    const parsed = parseWorkerEnvironment({
      ...validEnvironment,
      EMAIL_FROM: 'no-reply@localhost',
      SMTP_URL: 'smtp://localhost:51025',
    })

    expect(parsed.emailDelivery?.transport).toEqual({
      kind: 'smtp',
      smtpUrl: 'smtp://localhost:51025',
    })
  })

  test('remetente sem transporte, ou transporte sem remetente, recusa subir', () => {
    expect(() =>
      parseWorkerEnvironment({ ...validEnvironment, EMAIL_FROM: 'no-reply@exemplo.com.br' }),
    ).toThrow(WorkerConfigurationError)
    expect(() =>
      parseWorkerEnvironment({ ...validEnvironment, RESEND_API_KEY: 're_chave_de_contrato' }),
    ).toThrow(WorkerConfigurationError)
  })

  // O responsável técnico é da instalação, não da empresa: sem as quatro variáveis o CT-e sai como
  // sempre saiu, e com três de quatro o worker recusa subir em vez de emitir um grupo incompleto.
  test('reads the technical responsible of the issuing software from the installation', () => {
    const parsed = parseWorkerEnvironment({
      ...validEnvironment,
      CTE_TECHNICAL_RESPONSIBLE_CNPJ: '11222333000181',
      CTE_TECHNICAL_RESPONSIBLE_CONTACT: 'Equipe de Suporte',
      CTE_TECHNICAL_RESPONSIBLE_EMAIL: 'contato@exemplo.com.br',
      CTE_TECHNICAL_RESPONSIBLE_PHONE: '1933334444',
    })

    expect(parsed.cteTechnicalResponsible).toEqual({
      cnpj: '11222333000181',
      email: 'contato@exemplo.com.br',
      fone: '1933334444',
      xContato: 'Equipe de Suporte',
    })
  })

  test('rejects a partially declared technical responsible', () => {
    expect(() =>
      parseWorkerEnvironment({
        ...validEnvironment,
        CTE_TECHNICAL_RESPONSIBLE_CNPJ: '11222333000181',
        CTE_TECHNICAL_RESPONSIBLE_CONTACT: 'Equipe de Suporte',
        CTE_TECHNICAL_RESPONSIBLE_EMAIL: 'contato@exemplo.com.br',
      }),
    ).toThrow(WorkerConfigurationError)
  })

  /** Spec 145 D9/D13: o primeiro degrau da escada de orçamento da planta; os outros dobram. */
  test('lê o orçamento da planta de carga, com padrão de 120 s', () => {
    expect(
      parseWorkerEnvironment({ ...validEnvironment, CARGO_LAYOUT_TIME_BUDGET_MS: '90000' })
        .cargoLayoutTimeBudgetMs,
    ).toBe(90_000)
  })

  test.each(['abc', '0', '999', '600001', '1.5'])(
    'recusa orçamento da planta inválido: %p',
    (value) => {
      expect(() =>
        parseWorkerEnvironment({ ...validEnvironment, CARGO_LAYOUT_TIME_BUDGET_MS: value }),
      ).toThrow(WorkerConfigurationError)
    },
  )

  // A Nota RP publica um servidor só, e é o de produção (ADR-0035). O endereço é da instalação, mas
  // não é por ambiente fiscal: quem separa staging de produção é a credencial selada por empresa.
  test('reads the single Nota RP base URL of the installation', () => {
    const parsed = parseWorkerEnvironment({
      ...validEnvironment,
      NFSE_PROVIDER_BASE_URL: 'https://www.notarp.com.br/api/v2',
      NFSE_PROVIDER_TIMEOUT_MS: '20000',
    })

    expect(parsed.nfseProvider).toEqual({
      baseUrl: 'https://www.notarp.com.br/api/v2',
      callbackBaseUrl: undefined,
      timeoutMilliseconds: 20_000,
    })
  })

  /**
   * A mesma variável da API, com a mesma validação: o worker precisa dela para montar a
   * `CallbackUrl` obrigatória do `/emitir`, e a API para registrar a rota que recebe o postback.
   * Configurar uma sem a outra é emitir sem retorno ou publicar rota que ninguém chama.
   */
  test('lê a base pública do callback de NFS-e da instalação', () => {
    const parsed = parseWorkerEnvironment({
      ...validEnvironment,
      NFSE_CALLBACK_BASE_URL: 'https://api.exemplo.com.br',
    })

    expect(parsed.nfseProvider.callbackBaseUrl).toBe('https://api.exemplo.com.br')
  })

  // A v2 exige callback https e suspende a integração de quem publica endereço que não responde:
  // http em domínio público é o caminho mais curto para a suspensão.
  test('recusa base de callback que não seja https, salvo localhost', () => {
    expect(() =>
      parseWorkerEnvironment({
        ...validEnvironment,
        NFSE_CALLBACK_BASE_URL: 'http://api.exemplo.com.br',
      }),
    ).toThrow(WorkerConfigurationError)

    expect(
      parseWorkerEnvironment({
        ...validEnvironment,
        NFSE_CALLBACK_BASE_URL: 'http://localhost:53001',
      }).nfseProvider.callbackBaseUrl,
    ).toBe('http://localhost:53001')
  })

  test('base de callback vazia significa desligada, e não string vazia', () => {
    expect(
      parseWorkerEnvironment({ ...validEnvironment, NFSE_CALLBACK_BASE_URL: '   ' }).nfseProvider
        .callbackBaseUrl,
    ).toBeUndefined()
  })

  // O par por ambiente fiscal prometia um isolamento que o provedor não oferece (ADR-0035). Se o
  // nome voltar, volta a promessa — e ninguém audita o que já parece resolvido.
  test('o par de endereços por ambiente fiscal não reaparece no código', async () => {
    const offenders: string[] = []
    for await (const file of new Glob('**/*.ts').scan(`${import.meta.dir}/../src`)) {
      const source = await Bun.file(`${import.meta.dir}/../src/${file}`).text()
      if (source.includes('NFSE_PROVIDER_BASE_URL_')) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })

  test('rejects a Nota RP base URL that is not a URL instead of emitting to nowhere', () => {
    expect(() =>
      parseWorkerEnvironment({ ...validEnvironment, NFSE_PROVIDER_BASE_URL: 'nao-e-url' }),
    ).toThrow(WorkerConfigurationError)
  })

  test('forbids the foundation synthetic consumer in production', () => {
    expect(() =>
      parseWorkerEnvironment({
        ...validEnvironment,
        APP_ENV: 'production',
        FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: 'true',
      }),
    ).toThrow(WorkerConfigurationError)
  })

  /**
   * O trilho do preço é opcional por **presença**, como era no cron: instalação que não coleta preço
   * sobe sem nenhuma das duas agências, e meia série declarada derruba o boot — meia coleta é tela
   * com preço sem dizer que está incompleta.
   */
  test('sem agência declarada a coleta de preço nasce ausente', () => {
    expect(parseWorkerEnvironment(validEnvironment).fuelPricePull).toBeUndefined()
  })

  test('as duas agências declaradas viram o bloco da coleta', () => {
    expect(
      parseWorkerEnvironment({
        ...validEnvironment,
        ANEEL_BASE_URL: 'https://dadosabertos.aneel.gov.br',
        ANP_BASE_URL: 'https://www.gov.br/anp',
      }).fuelPricePull,
    ).toEqual({
      aneelBaseUrl: 'https://dadosabertos.aneel.gov.br',
      aneelTimeoutMilliseconds: 15_000,
      anpBaseUrl: 'https://www.gov.br/anp',
      anpTimeoutMilliseconds: 15_000,
    })
  })

  test('uma agência só derruba o boot', () => {
    expect(() =>
      parseWorkerEnvironment({ ...validEnvironment, ANP_BASE_URL: 'https://www.gov.br/anp' }),
    ).toThrow(WorkerConfigurationError)
  })

  /** Declarada em branco é ausência, e é assim que a variável esquecida no painel chega aqui. */
  test('endereço em branco conta como agência não declarada', () => {
    expect(() =>
      parseWorkerEnvironment({
        ...validEnvironment,
        ANEEL_BASE_URL: '  ',
        ANP_BASE_URL: 'https://www.gov.br/anp',
      }),
    ).toThrow(WorkerConfigurationError)
  })

  /**
   * `API_BASE_URL` serve também à baixa de comandos do WhatsApp e à marca do e-mail: sozinha ela
   * não liga o MDF-e automático, e não pode derrubar o boot. Derrubou o worker de staging em
   * 2026-09-25, quando a variável foi definida sem as três credenciais do Keycloak.
   */
  test('API_BASE_URL sozinha sobe, sem ligar o MDF-e automático', () => {
    const environment = parseWorkerEnvironment({
      ...validEnvironment,
      API_BASE_URL: 'https://api.staging.example.com',
    })

    expect(environment.apiBaseUrl).toBe('https://api.staging.example.com')
    expect(environment.mdfeAutoIssue).toBeUndefined()
  })

  test('uma credencial do MDF-e automático sem as outras derruba o boot', () => {
    expect(() =>
      parseWorkerEnvironment({
        ...validEnvironment,
        API_BASE_URL: 'https://api.staging.example.com',
        WORKER_CLIENT_ID: 'transportada-worker',
      }),
    ).toThrow(WorkerConfigurationError)
  })

  /**
   * O MDF-e automático é decisão fiscal do dono (emenda 2026-11-05 da ADR-0047): o crachá do worker
   * serve também ao canhoto e à baixa do WhatsApp, então tê-lo não pode ligar a emissão. Nasce
   * desligado, e ligado sem o crachá derruba o boot em vez de não emitir calado.
   */
  describe('o interruptor do MDF-e automático', () => {
    const credentials = {
      ...validEnvironment,
      API_BASE_URL: 'https://api.staging.example.com',
      KEYCLOAK_TOKEN_URL: 'https://keycloak.example.com/token',
      WORKER_CLIENT_ID: 'transportada-worker',
      WORKER_CLIENT_SECRET: 'secret-value',
    }

    test('com o crachá e sem o interruptor, nasce desligado', () => {
      const environment = parseWorkerEnvironment(credentials)

      expect(environment.mdfeAutoIssue).toBeDefined()
      expect(environment.mdfeAutoIssueEnabled).toBe(false)
    })

    test('MDFE_AUTO_ISSUE_ENABLED=true com o crachá liga', () => {
      expect(
        parseWorkerEnvironment({ ...credentials, MDFE_AUTO_ISSUE_ENABLED: 'true' })
          .mdfeAutoIssueEnabled,
      ).toBe(true)
    })

    test('ligado sem o crachá derruba o boot', () => {
      expect(() =>
        parseWorkerEnvironment({ ...validEnvironment, MDFE_AUTO_ISSUE_ENABLED: 'true' }),
      ).toThrow(WorkerConfigurationError)
    })

    test('valor fora de true/false derruba o boot', () => {
      expect(() =>
        parseWorkerEnvironment({ ...credentials, MDFE_AUTO_ISSUE_ENABLED: 'yes' }),
      ).toThrow(WorkerConfigurationError)
    })
  })

  describe('o interruptor dos lembretes do motorista', () => {
    test('ausente ou vazio nasce desligado', () => {
      expect(parseWorkerEnvironment(validEnvironment).driverRemindersEnabled).toBe(false)
      expect(
        parseWorkerEnvironment({ ...validEnvironment, DRIVER_REMINDERS_ENABLED: '' })
          .driverRemindersEnabled,
      ).toBe(false)
    })

    test('DRIVER_REMINDERS_ENABLED=true liga', () => {
      expect(
        parseWorkerEnvironment({ ...validEnvironment, DRIVER_REMINDERS_ENABLED: 'true' })
          .driverRemindersEnabled,
      ).toBe(true)
    })

    test('valor fora de true/false derruba o boot', () => {
      expect(() =>
        parseWorkerEnvironment({ ...validEnvironment, DRIVER_REMINDERS_ENABLED: 'yes' }),
      ).toThrow(WorkerConfigurationError)
    })
  })

  describe('a credencial própria da foto da CNH', () => {
    const complete = {
      ...validEnvironment,
      API_BASE_URL: 'https://api.staging.example.com',
      CNH_PICTURE_CLIENT_ID: 'transportada-worker-cnh-picture',
      CNH_PICTURE_CLIENT_SECRET: 'secret-value',
      KEYCLOAK_TOKEN_URL: 'https://keycloak.example.com/token',
    }

    test('completa liga a foto, sem tocar no crachá do MDF-e', () => {
      const environment = parseWorkerEnvironment(complete)

      expect(environment.cnhPicture).toEqual({
        apiBaseUrl: 'https://api.staging.example.com',
        clientId: 'transportada-worker-cnh-picture',
        clientSecret: 'secret-value',
        tokenUrl: 'https://keycloak.example.com/token',
      })
      expect(environment.mdfeAutoIssue).toBeUndefined()
    })

    test('ausente desliga a foto sem derrubar o boot', () => {
      expect(parseWorkerEnvironment(validEnvironment).cnhPicture).toBeUndefined()
    })

    test.each([
      ['só o id', { CNH_PICTURE_CLIENT_SECRET: undefined }],
      ['só o segredo', { CNH_PICTURE_CLIENT_ID: undefined }],
      ['sem o endereço do token', { KEYCLOAK_TOKEN_URL: undefined }],
      ['sem o endereço da API', { API_BASE_URL: undefined }],
    ])('%s derruba o boot', (_name, override) => {
      expect(() => parseWorkerEnvironment({ ...complete, ...override })).toThrow(
        WorkerConfigurationError,
      )
    })
  })

  test('does not expose connection credentials in configuration errors', () => {
    const secret = 'do-not-leak'

    try {
      parseWorkerEnvironment({
        ...validEnvironment,
        DATABASE_URL: `invalid://${secret}@private`,
      })
      throw new Error('Expected environment parsing to fail')
    } catch (error: unknown) {
      expect(String(error)).not.toContain(secret)
    }
  })
})
