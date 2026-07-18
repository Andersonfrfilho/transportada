# Railway: staging e production

Projeto provisionado em 2026-07-18:

- dashboard: `https://railway.com/project/62de4c69-216a-4335-93a0-4942c6a95c54`;
- project ID: `62de4c69-216a-4335-93a0-4942c6a95c54`;
- production ID: `4e24a47a-1514-4106-9d38-52420bd4cef6`;
- staging ID: `3cd99844-5712-40d2-aca7-75b25965419e`.

## Topologia prevista

Um projeto Railway `transportada` com ambientes isolados:

- `staging`: branch `develop`, ambiente fiscal sempre `homologacao`;
- `production`: branch `main`, ambiente fiscal configurável por empresa e
  promoção manual inicial.

Serviços por ambiente:

```text
web, api, worker, Postgres, Redis, document-storage
```

API e worker compartilham banco/fila dentro do mesmo ambiente; nunca entre
ambientes. Browser chama somente o domínio público da API. Tráfego interno usa
private networking.

## Variáveis

Compartilhadas não secretas: `APP_NAME`, `APP_ENV`, `LOG_LEVEL`,
`QUEUE_PREFIX`, `FISCAL_DEFAULT_ENVIRONMENT`.

Por serviço/ambiente: `DATABASE_URL`, `REDIS_URL`, storage S3, OIDC,
`JWT_SECRET`, `ENCRYPTION_KEY`, e-mail e observabilidade. Segredos nunca entram
no Git.

## Promoção

1. PR → CI.
2. Merge em `develop` → staging.
3. migration compatível → smoke/E2E em homologação.
4. tag/version + aprovação humana.
5. merge/promoção para `main` → production.
6. health/readiness, migration e smoke pós-deploy.

Deploy usa estratégia expand/contract para schema. Worker antigo e novo devem
conviver durante rolling deploy. Production não emite CT-e real enquanto o
feature flag e a configuração da empresa não forem explicitamente habilitados.

## Pendências de provisionamento

O projeto pode ser criado antes do código, mas os serviços e bancos só devem ser
provisionados após a fundação para evitar recursos ociosos. O repositório GitHub
precisa estar conectado para configurar branches de deploy.
