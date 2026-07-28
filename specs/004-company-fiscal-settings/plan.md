# Plano técnico — Empresa e configurações fiscais

## Contexto e premissas

A feature 003 entregou identidade, `CompanyContext` e a permissão
`settings.manage`. A feature 004 amplia esse tenant existente; não cria empresa,
membership ou fluxo platform-scoped.

O contrato fiscal verificado é `@adatechnology/fiscal-provider@0.1.0`. Somente
o export público síncrono `validateCertificate` será usado nesta fase. Sua
validação é local: o produto não chamará o certificado de homologado, confiável
para produção ou verificado pela SEFAZ.

O segredo A1 será protegido pelo novo package Bun/ESM
`@adatechnology/secret-envelope`, criado e versionado no repositório
`adatechnology-packages`. API e worker instalarão versões publicadas exatas;
nenhuma aplicação importará fonte de outra aplicação ou package local.

RabbitMQ, S3, SEFAZ e Railway não participam desta feature porque não existe
efeito externo nem processamento assíncrono. Exchanges, filas, retry e DLQ
entram nas features de importação/emissão.

## Decisões arquiteturais

Dois ADRs precedem a implementação:

1. `ADR 0004 — Envelope criptográfico e armazenamento da credencial A1`;
2. `ADR 0005 — Reserva fiscal idempotente e não reutilizável`.

O ADR 0004 decide:

- package `@adatechnology/secret-envelope`, ESM, Bun `>=1.3` e sem dependência
  de runtime;
- AES-256-GCM pelo Web Crypto, nonce aleatório de 12 bytes e tag de 128 bits;
- AAD obrigatório fornecido pela aplicação;
- envelope base64url versionado com `version`, `algorithm`, `keyId`, `nonce` e
  `ciphertext`;
- keyring versionado, chave ativa explícita e nenhuma tentativa de fallback;
- envelope ativo em `jsonb` no PostgreSQL, nunca em S3 ou arquivo temporário;
- aposentadoria remove o envelope anterior; rollback exige novo upload.

O ADR 0005 decide:

- sequência única por empresa, ambiente, modelo e série;
- ledger append-only com `reservationKey` obrigatório;
- incremento e reserva na mesma transação;
- replay retorna o mesmo número e número novo só é retornado após commit;
- série e número inicial ficam imutáveis após a primeira reserva;
- número reservado nunca é removido, decrementado ou reutilizado.

## Arquitetura e arquivos afetados

```text
adatechnology-packages/
└── packages/backend/secret-envelope/
    ├── src/
    ├── test/
    ├── package.json
    └── README.md

transportada/
├── apps/api-transportada/
│   ├── drizzle/
│   └── src/
│       ├── companies/
│       │   ├── domain/
│       │   ├── application/
│       │   ├── infrastructure/
│       │   └── presentation/
│       ├── database/
│       │   ├── identity.schema.ts
│       │   ├── fiscal.schema.ts
│       │   └── database.schema.ts
│       └── http/
│           ├── router.service.ts
│           └── request-handler.service.ts
├── apps/frontend-transportada/src/modules/company-settings/
├── docs/adr/0004-secret-envelope-and-a1-storage.md
├── docs/adr/0005-idempotent-fiscal-number-reservation.md
└── specs/004-company-fiscal-settings/
```

O handler atual passa a delegar rotas para um router tipado e deny-by-default.
Autenticação, resolução do `CompanyContext` e autorização acontecem antes do
parser fiscal e, especialmente, antes de ler/processar o PFX.

Fluxo de escrita:

```text
Bun.serve
  → autenticação
  → CompanyContext
  → settings.manage
  → Zod strict
  → caso de uso
      ├─ repositório Drizzle tenant-scoped
      ├─ gateway validateCertificate
      ├─ gateway secret-envelope
      ├─ idempotência
      └─ auditoria
  → transação PostgreSQL
```

## Contratos HTTP

| Método | Path                    | Permissão         | Resultado |
| ------ | ----------------------- | ----------------- | --------- |
| GET    | `/company-settings`     | `settings.manage` | `200`     |
| PATCH  | `/company-settings`     | `settings.manage` | `200`     |
| GET    | `/digital-certificates` | `settings.manage` | `200`     |
| POST   | `/digital-certificates` | `settings.manage` | `201`     |

Todas as respostas usam `Cache-Control: no-store`. IDs de empresa vindos de
body, query ou header nunca selecionam o tenant. Recurso por ID pertencente a
outra empresa, quando existir no futuro, responde `404`.

### `GET /company-settings`

Antes do cadastro:

```json
{
  "data": {
    "profile": null,
    "cte": null,
    "activeCertificate": null
  }
}
```

Quando configurado, a resposta contém perfil fiscal, ambiente, versão, série,
próximo número e metadados seguros do certificado. Versões, série e números
fiscais trafegam como strings decimais para não depender da precisão de JSON.

O certificado expõe apenas `id`, `purpose`, `version`, `status`, `validFrom` e
`expiresAt`. Não expõe issuer/subject completos, CPF, `keyId`, fingerprint,
nonce, ciphertext, tag ou mensagens do provider.

### `PATCH /company-settings`

Requer:

- `Authorization: Bearer`;
- `Content-Type: application/json`;
- `Idempotency-Key`;
- body Zod `.strict()` com `expectedVersion`, perfil, ambiente e configuração
  inicial de série/próximo número;
- ausência de `companyId`.

O caso de uso faz upsert tenant-scoped com versão otimista. Replay da mesma
chave e mesmo fingerprint retorna o resultado seguro anterior. Reuso da chave
com payload diferente retorna `409 IDEMPOTENCY_KEY_REUSED`; versão obsoleta
retorna `409 FISCAL_SETTINGS_VERSION_CONFLICT`; série ou próximo número
alterados após uma reserva retornam `409 FISCAL_SEQUENCE_LOCKED`.

### `POST /digital-certificates`

Recebe `multipart/form-data` com `certificate`, `password` e `purpose=cte`,
além de `Idempotency-Key`. O limite de aplicação continua em 1 MiB, abaixo do
limite defensivo de 2 MiB do `Bun.serve`.

Ordem obrigatória:

1. autenticar, resolver tenant e autorizar;
2. validar tamanho e multipart sem arquivo temporário;
3. converter bytes para base64 somente em memória;
4. chamar `CertificateValidationGateway`;
5. exigir resultado válido, CNPJ presente e igualdade exata com a empresa;
6. criar UUID e AAD da nova credencial;
7. cifrar PFX e senha;
8. abrir transação e bloquear o perfil da empresa;
9. revalidar versão e CNPJ;
10. aposentar a credencial anterior e zerar seu envelope;
11. inserir a nova credencial ativa;
12. gravar auditoria e idempotência;
13. confirmar a transação e limpar buffers mutáveis em `finally`, best effort.

O primeiro sucesso retorna `201`; replay idempotente retorna o mesmo DTO sem
revalidar ou substituir novamente. Falha preserva o certificado anterior. A
resposta diz apenas que a credencial foi validada localmente.

Multipart com `Content-Length` ausente ou transferência chunked é consumido por
um leitor incremental com contador e abortado ao exceder 1 MiB, antes de
`formData()`. O servidor continua impondo seu limite absoluto de 2 MiB.

### `GET /digital-certificates`

Retorna histórico paginado de metadados allowlisted. Aposentadoria é consequência
da substituição; a spec não justifica endpoint `DELETE`.

CORS é ampliado somente para a origin exata existente, métodos `GET`, `PATCH`,
`POST`, `OPTIONS` e headers `Authorization`, `Content-Type`,
`Idempotency-Key`, sem credentials.

### Limites de boundary

- `Idempotency-Key`: 16–128 caracteres ASCII em `[A-Za-z0-9._:-]`;
- multipart: exatamente um `certificate`, uma `password` de 1–256 bytes UTF-8
  e `purpose=cte`; body total máximo de 1 MiB;
- listagem de certificados: `limit` padrão 25, máximo 100, e cursor base64url
  estrito de `(createdAt,id)`;
- CNPJ, CEP e código IBGE: respectivamente 14, 8 e 7 dígitos;
- UF: duas letras maiúsculas; CRT: `'1' | '2' | '3'`;
- razão social: 2–200; nome fantasia: 0–200; IE/IM: 0–20; RNTRC: 1–20;
  e-mail: 0–254; telefone: 0–20 caracteres;
- logradouro: 2–200; número: 1–20; complemento: 0–100; bairro: 1–100;
  município: 2–100 caracteres;
- série e próximo número: strings decimais positivas, sem zero à esquerda e
  com no máximo 19 dígitos; esse é limite técnico de `bigint`, não regra fiscal;
- nenhum campo obrigatório aceita string composta somente por espaços.

## Contrato do package `secret-envelope`

```ts
export type SecretEnvelopeV1 = Readonly<{
  version: 1
  algorithm: 'A256GCM'
  keyId: string
  nonce: string
  ciphertext: string
}>

export type SecretKeyRing = Readonly<{
  activeKeyId: string
  keys: Readonly<Record<string, Uint8Array>>
}>

export type SecretEnvelopeProvider = {
  encrypt(input: {
    plaintext: Uint8Array
    additionalAuthenticatedData: Uint8Array
  }): Promise<SecretEnvelopeV1>

  decrypt(input: {
    envelope: SecretEnvelopeV1
    additionalAuthenticatedData: Uint8Array
  }): Promise<Uint8Array>
}

export function createSecretEnvelopeProvider(keyRing: SecretKeyRing): SecretEnvelopeProvider
```

Chaves têm exatamente 32 bytes; a chave ativa deve existir; decrypt escolhe
somente `envelope.keyId`; nonce usa `crypto.getRandomValues`; chave importada é
não extraível; AAD idêntico é obrigatório; objetos são imutáveis; erros são
tipados e não contêm chave, plaintext, AAD ou envelope. O package não conhece
empresa, certificado, logger nem formato do segredo.

AAD canônico da aplicação:

```text
transportada:certificate:v1:<companyId>:<certificateId>:cte
```

O plaintext é um DTO binário validado com `certificateBase64` e `password`.
Como strings/base64 criam cópias controladas pelo GC, limpeza é best effort e
não uma garantia física.

Configuração local:

```dotenv
ENCRYPTION_ACTIVE_KEY_ID=local-v1
ENCRYPTION_KEYRING_JSON={"local-v1":"<base64-de-32-bytes>"}
IDEMPOTENCY_HMAC_KEY=<base64-de-32-bytes>
```

Erros de configuração são genéricos e nunca incluem valores. A chave HMAC é
separada da chave de envelope e gera fingerprints idempotentes sem persistir
payload ou hash direto de senha. O input do HMAC usa domínio, operação e campos
normalizados em ordem fixa, cada um com tamanho unsigned de 32 bits big-endian.
O `PATCH` usa o DTO já validado; multipart usa bytes do certificado, senha UTF-8
e purpose, evitando colisões por concatenação.

## Gateway fiscal

```ts
type CertificateValidationOutcome = {
  readonly valid: boolean
  readonly certificateCnpj?: string
  readonly validFrom?: Date
  readonly expiresAt?: Date
  readonly rejectionCodes: readonly CertificateRejectionCode[]
}

type CertificateValidationGateway = {
  validate(input: {
    readonly certificateBase64: string
    readonly password: string
  }): CertificateValidationOutcome
}
```

Um único adapter importa `validateCertificate` de
`@adatechnology/fiscal-provider@0.1.0`. Erros, warnings, issuer e subject do
provider são convertidos para códigos internos seguros. `rawResponse`, internals
`src/sefaz/*`, emissão e `testConnection` não são usados.

## Dados, migration e rollback

O schema existente é primeiro extraído mecanicamente para
`database/identity.schema.ts`; `database.schema.ts` permanece agregador sem
alterar o SQL da feature 003.

### `company_fiscal_profiles`

- `company_id` PK/FK de `companies`;
- razão social, nome fantasia, CNPJ canônico, IE, IM, CRT e RNTRC;
- logradouro, número, complemento, bairro, município, UF, CEP e código IBGE;
- telefone, e-mail e ambiente `homologation | production`;
- `version bigint > 0` e timestamps UTC;
- CNPJ global unique e check de 14 dígitos.

### `digital_certificates`

- `id`, `company_id`, `purpose=cte`, `version` e `status active | retired`;
- `secret_envelope jsonb NULL`, CNPJ validado, validade e fingerprint interno;
- ator de criação e timestamps;
- unique `(company_id, purpose, version)` e `(company_id, id)`;
- índice unique parcial de um ativo por `(company_id, purpose)`;
- ativo exige envelope; aposentado exige envelope `NULL`;
- não armazena subject, CPF nem mensagens do validator.

### `fiscal_sequences`

- `id`, `company_id`, `environment`, `model=cte` e `series bigint > 0`;
- `next_number bigint > 0`, `last_reserved_number bigint NULL` e `version`;
- unique `(company_id, environment, model, series)` e `(company_id, id)`;
- checks de coerência entre próximo e último reservado.

### `fiscal_sequence_reservations`

- `id`, `company_id`, `fiscal_sequence_id`, `reservation_key`, `number` e
  `created_at`;
- FK composta `(company_id, fiscal_sequence_id)`;
- unique `(company_id, reservation_key)`;
- unique `(fiscal_sequence_id, number)`.

### `idempotency_records`

- `company_id`, `operation`, `idempotency_key` e fingerprint HMAC do request;
- status e resposta allowlisted;
- unique composto; sem cópia de request e sem expiração automática nesta fase.

### `audit_logs`

- append-only com empresa, ator, ação, tipo/ID da entidade, correlation ID,
  before/after allowlisted e timestamp;
- trigger rejeita `UPDATE` e `DELETE`;
- nunca recebe request original, PFX, senha, envelope ou erro cru.

A migration é única e aditiva, aplicável sobre banco vazio e baseline 003.
Rollback manual remove, nesta ordem: auditoria/idempotência, reservas, sequências,
certificados e perfil. Depois de dados reais, correções são roll-forward; o
rollback destrutivo não é promovido automaticamente.

## Idempotência e concorrência

Mutations HTTP usam `(companyId, operation, idempotencyKey)` e fingerprint HMAC.
A mesma chave/fingerprint devolve a resposta segura persistida; a mesma chave
com fingerprint diferente falha com `409`. Auditoria e resposta idempotente são
gravadas na mesma transação da alteração.

Porta interna de sequência:

```ts
type ReserveFiscalNumberInput = {
  readonly companyId: string
  readonly environment: 'homologation' | 'production'
  readonly model: 'cte'
  readonly series: bigint
  readonly reservationKey: string
}

type FiscalNumberReservation = {
  readonly sequenceId: string
  readonly number: bigint
  readonly isReplay: boolean
}
```

Para chave nova, a transação atualiza a linha com
`UPDATE ... SET last_reserved_number = next_number, next_number = next_number +
1 ... RETURNING`, insere o ledger e confirma antes de retornar. Lock da linha
serializa concorrência; o ledger torna retry idempotente.

Se duas transações disputarem a mesma chave, somente a violação `23505` da
constraint esperada ativa o recovery: rollback completo, nova transação,
releitura da reserva e comparação de empresa/ambiente/modelo/série. Intenção
divergente retorna conflito; o incremento perdedor é revertido.

Substituição de certificado bloqueia o perfil da empresa. O índice parcial é
uma defesa adicional, não o mecanismo único contra corrida.

## Segurança e tenant

- toda query recebe `companyId` do `CompanyContext`;
- autorização antecede parsing do certificado;
- schemas são strict e limites são aplicados antes de alocar o body;
- respostas, logs, auditoria e idempotência usam serializers allowlisted;
- erros cross-tenant e de CNPJ não revelam existência ou identificador;
- ambiente `production` é configuração, não readiness ou autorização de emissão;
- PFX fornecido pelo usuário não entra no repositório nem nos testes
  automatizados; testes geram certificado efêmero;
- nenhuma migration, configuração ou teste toca Railway.

## Observabilidade

- contadores de atualização, validação local aceita/rejeitada, conflito
  idempotente, conflito de versão e reserva/replay;
- métricas sem CNPJ, company ID, certificate ID ou idempotency key como label;
- logs guardam correlation ID, rota, ação e código seguro;
- auditoria guarda somente versões, status, purpose e datas allowlisted;
- readiness valida banco e configuração criptográfica, sem decifrar certificado
  nem chamar provider/SEFAZ.

## Estratégia de testes

### Package Ada

- keyring inválido/sem chave ativa;
- round-trip binário e ciphertext sem plaintext;
- nonce distinto para plaintext igual;
- AAD, chave, nonce e ciphertext incorretos falham;
- envelope antigo abre após rotação quando a chave permanece no keyring;
- chave desconhecida falha sem fallback;
- package ESM/types, `npm pack` e instalação Bun limpa.

### API e PostgreSQL

- schemas strict e autorização antes do parser;
- adapter compila apenas contra o export público 0.1.0;
- CNPJ cruzado e erros do provider não vazam;
- CNPJ global unique, índice parcial e constraints do envelope;
- duas substituições simultâneas deixam exatamente um ativo;
- aposentado fica sem envelope;
- falha de auditoria causa rollback total;
- replay idempotente não duplica mudança nem auditoria;
- 20 reservas distintas são únicas e monotônicas;
- 20 chamadas da mesma `reservationKey` retornam um número e um ledger;
- isolamento entre empresas, ambientes e séries;
- migration/rollback em banco vazio e baseline 003;
- banco, resposta e logs não contêm plaintext sentinela.

### Frontend

- controles ausentes sem `settings.manage` e API continua retornando `403`;
- file e senha são limpos após sucesso e erro;
- nenhum segredo em local/session storage, IndexedDB, Cache API ou DOM;
- estados vazio, carregando, erro e sucesso;
- responsividade em 375, 768 e 1280 pixels;
- produção é apresentada apenas como configuração.

## Gates locais

| Escopo      | Gates                                                                   |
| ----------- | ----------------------------------------------------------------------- |
| package Ada | `bun run check`, `bun test`, pack e instalação Bun limpa                |
| API         | lint, typecheck, contracts, integration, `db:check`, migration/rollback |
| frontend    | lint, typecheck, unit, build e Playwright                               |
| stack       | `make up`, `make ps`, `make check`, `make migration-test`, `make smoke` |
| repositório | `bun install --frozen-lockfile`, revisão Opus e evidência por task      |

Nenhum gate executa deploy. O Makefile conserva `PROJECT_NAME` e
`COMPOSE_PROJECT_NAME=$(PROJECT_NAME)-$(APP_ENV)`.

Para o smoke final, `make dev` roda em PTY/sessão controlada; após readiness,
outra sessão executa `make smoke`. O gate envia `SIGTERM`, confirma o término
dos três apps e encerra a infraestrutura com `make down`.

## Riscos

- `validateCertificate` cria cópias base64 e não comprova cadeia ICP-Brasil nem
  conexão SEFAZ;
- o provider é CommonJS e deve permanecer pinado em `0.1.0`;
- seu logging de emissão não é aceitável sem hardening, mas emissão não entra
  nesta feature;
- keyring JSON e HMAC podem vazar se validação repetir valores em erros;
- aposentadoria elimina o segredo anterior e não possui rollback automático;
- sem ledger, retry de reserva consumiria outro número;
- `bigint` precisa ser serializado como string em HTTP;
- idempotência e auditoria são superfícies adicionais para vazamento;
- centralizar novas rotas no handler atual aumentaria acoplamento;
- adicionar RabbitMQ, S3, SEFAZ ou Railway nesta fase ampliaria o risco sem
  resolver requisito.
