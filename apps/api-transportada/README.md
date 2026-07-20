# API TransportAdA

Aplicação HTTP independente, executada por Bun 1.3.14 com `Bun.serve`.

## Configuração

- `DATABASE_URL`: URL PostgreSQL obrigatória;
- `FRONTEND_ORIGIN`: origin canônica e exata da SPA; HTTPS, exceto HTTP
  permitido somente para o hostname `localhost`;
- `KEYCLOAK_ISSUER`: issuer OIDC confiável e exato;
- `KEYCLOAK_JWKS_URI`: endpoint JWKS confiável; HTTPS fora de `localhost`;
- `KEYCLOAK_AUDIENCE`: audience exclusiva do client da API;
- `ENCRYPTION_ACTIVE_KEY_ID`: identificador da chave AES ativa;
- `ENCRYPTION_KEYRING_JSON`: objeto JSON não vazio de IDs para chaves AES de
  32 bytes em base64 canônico;
- `IDEMPOTENCY_HMAC_KEY`: chave HMAC separada de 32 bytes em base64 canônico;
- `APP_PORT`: porta HTTP, padrão `53001`;
- `APP_ENV`: ambiente, padrão `local`;
- `LOG_LEVEL`: `debug`, `info`, `warn` ou `error`.

O startup falha fechado se a chave ativa não existir, alguma chave não tiver
exatamente 32 bytes ou a chave HMAC reutilizar material do keyring. Erros não
repetem IDs nem valores. Os valores de `.env.example` são apenas fixtures
locais públicas; gere chaves independentes com `openssl rand -base64 32` para
qualquer ambiente persistente.

O startup não executa migrations. A validação do certificado A1 é local pelo
export público `validateCertificate` de
`@adatechnology/fiscal-provider@0.1.0`; ela não consulta a SEFAZ nem comprova
readiness para emissão.

As migrations usam o journal fixo `drizzle.__drizzle_migrations`. Gere e
valide pelo Makefile da raiz:

```bash
bun run db:generate --name nome_da_migration
bun run db:check
make migration-test
```

`make migration-test` sobe somente o PostgreSQL do projeto
`transportada-local`, cria um banco descartável e valida apply, constraints,
rollback, journal e reaplicação. Rollbacks são manuais e versionados ao lado da
migration; nunca são chamados pelo startup.

## Contratos HTTP

Todas as respostas tratadas pela aplicação retornam `x-correlation-id`.
Valores recebidos são aceitos somente com 1–128 caracteres alfanuméricos ou
`._:-`; valores ausentes ou inválidos são substituídos por UUID.

O contrato limita corpos a 1 MiB e retorna erro `413` estruturado. O servidor
mantém ainda um hard limit nativo de 2 MiB para rejeitar tráfego abusivo antes
do handler.

Method e pathname são validados por schema Zod antes do roteamento. As rotas
health não leem body; o servidor rejeita corpos acima de 1 MiB com `413`.

| Método | Rota              | Resposta                                             |
| ------ | ----------------- | ---------------------------------------------------- |
| GET    | `/health/live`    | `200`, sem consultar dependências                    |
| GET    | `/health/ready`   | `200` com PostgreSQL/JWKS up ou `503` degraded       |
| GET    | `/auth/me`        | `200` com identidade tenant autenticada              |
| outro  | rota conhecida    | `405` e erro estruturado após autenticação aplicável |
| outro  | rota desconhecida | `404` e erro estruturado após autenticação           |

Erros possuem `{ error: { code, message, correlationId } }` e não expõem
stack, query string, headers, body ou detalhes da infraestrutura.

## CORS

Todas as respostas variam por `Origin`. Somente a origin configurada em
`FRONTEND_ORIGIN` recebe `Access-Control-Allow-Origin`; não há wildcard nem
`Access-Control-Allow-Credentials`.

O único preflight público é `OPTIONS /auth/me`, com origin exata, método
solicitado `GET` e headers solicitados limitados a `Authorization`. Ele retorna
`204`, corpo vazio, `Access-Control-Allow-Methods: GET`,
`Access-Control-Allow-Headers: Authorization`, max-age de 300 segundos e
`Cache-Control: no-store`. Preflights inválidos retornam `403` sem autenticar,
executar o caso de uso ou refletir a origin.
