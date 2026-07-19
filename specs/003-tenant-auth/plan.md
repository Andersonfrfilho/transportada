# Plano técnico — Identidade, tenant e autorização

## Contexto e premissas

A feature 002 entregou três aplicações Bun separáveis. A feature 003 começa no
provider Ada porque o artefato npm atual não pode ser importado pela API sem
reintroduzir NestJS. A escolha do nome/package permanece bloqueante.

Keycloak autentica o usuário. O TransportAdA autoriza operações combinando:

1. token verificado para o client da API;
2. `company_id` validado e convertido em UUID;
3. identidade externa localizada por `(issuer, sub)`;
4. vínculo local ativo entre usuário e empresa;
5. roles locais da membership convertidas em permissões tipadas.

O package Ada valida protocolo e token; regras `companyId`, roles e permissões
do TransportAdA permanecem na API.

## Arquitetura e arquivos afetados

```text
adatechnology-packages/
└── packages/backend/<package-auth-escolhido>/
    ├── src/
    ├── test/
    ├── package.json
    └── README.md

transportada/
├── apps/api-transportada/
│   ├── drizzle/
│   └── src/identity/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       └── presentation/
├── apps/frontend-transportada/src/modules/identity/
├── compose.yaml
├── docs/adr/0002-keycloak-package-and-tenant-context.md
└── specs/003-tenant-auth/
```

Cada app declara sua dependência publicada. Nenhum código de autenticação vira
package local neste repositório.

## Contratos/API/eventos

Contrato mínimo esperado do provider Ada:

```ts
type VerifyAccessTokenInput = {
  readonly token: string
  readonly issuer: string
  readonly audience: string
  readonly algorithms: readonly string[]
  readonly requiredClaims?: readonly string[]
}

type VerifiedAccessToken = {
  readonly subject: string
  readonly issuer: string
  readonly audience: string | readonly string[]
  readonly expiresAt: number
  readonly claims: Readonly<Record<string, unknown>>
}
```

O implementation usa `createRemoteJWKSet` e `jwtVerify` de `jose`, com issuer,
audience, algorithms e required claims explícitos. Erros internos são
classificados, mas a API os reduz a um erro público seguro.

Contexto interno da API:

```ts
type AuthenticatedContext = {
  readonly identity: AuthenticatedIdentity
  readonly scope: PlatformContext | CompanyContext
}

type PlatformContext = {
  readonly kind: 'platform'
  readonly userId: string
}

type CompanyContext = {
  readonly kind: 'company'
  readonly userId: string
  readonly companyId: string
  readonly roles: readonly CompanyRole[]
  readonly permissions: ReadonlySet<TransportadaPermission>
}
```

Endpoints iniciais:

| Método | Path            | Escopo  | Permissão   |
| ------ | --------------- | ------- | ----------- |
| GET    | `/health/live`  | público | nenhuma     |
| GET    | `/health/ready` | público | nenhuma     |
| GET    | `/auth/me`      | empresa | autenticado |

O fluxo de login ocorre diretamente entre SPA e Keycloak por Authorization
Code + PKCE. A API não recebe usuário/senha e não emite refresh token.

## Dados, migration e rollback

Schema mínimo:

- `identity_users`: identificador interno e status;
- `external_identities`: `user_id`, `issuer`, `subject`, timestamps e unique
  `(issuer, subject)`;
- `companies`: `id`, `status`, timestamps; dados cadastrais e fiscais entram na
  feature 004;
- `user_company_memberships`: `id`, `user_id`, `company_id`, `status`,
  timestamps e unique `(user_id, company_id)`;
- `membership_roles`: `membership_id`, `role`, timestamps e unique composto,
  permitindo múltiplas roles por vínculo;
- nenhuma tabela armazena token, refresh token, senha ou claims completas.

Roles de empresa pertencem à membership local e a matriz role → permission é
código versionado nesta fase. O token seleciona a empresa ativa por
`company_id`; trocar de empresa exige novo token do Keycloak. O fluxo para
administrar memberships e emitir o novo claim exige uma feature posterior.
`platform-admin` é uma atribuição explícita de plataforma e cria
`PlatformContext`, nunca `CompanyContext`.

A migration é aditiva, com FKs, checks de status e índices por `company_id`.
Rollback é um SQL versionado/revisado que remove primeiro vínculos e depois o
shell de empresa; nunca executa automaticamente.

## Segurança e tenant

- `companyId` nasce exclusivamente do claim `company_id`;
- headers alternativos como `x-company-id` não são fonte de autoridade;
- qualquer `companyId` de payload é ignorado ou rejeitado no boundary;
- membership ativo é verificado antes do caso de uso;
- autorização é por permissão, não por strings de role espalhadas;
- `platform-admin` usa rotas explicitamente platform-scoped;
- respostas cross-tenant preferem `404` quando a existência do recurso seria
  revelada;
- logs guardam correlation ID e códigos seguros, nunca token/claims;
- redirect URIs são exatas; produção exige HTTPS e web origins restritas.
- issuer/JWKS são configuração estática confiável; claims do token nunca
  escolhem host ou realm.

## Idempotência e concorrência

- `createRemoteJWKSet` usa cache/cooldown e deduplica fetch em voo;
- `kid` desconhecido pode causar um refetch controlado, nunca uma rajada por
  request;
- identidade externa possui unique `(issuer, subject)`;
- membership possui unique `(user_id, company_id)` e roles possuem unique
  `(membership_id, role)`;
- atualização concorrente de status usa transação e versão/updatedAt quando
  existir caso de uso;
- o contexto autenticado é imutável durante a request.

## Observabilidade

- contadores de autenticação inválida e autorização negada sem labels de alta
  cardinalidade;
- métricas de hit/miss/refetch/erro JWKS;
- readiness distingue banco e capacidade de validar tokens quando o cache não
  é utilizável;
- logs incluem correlation ID, rota e código seguro;
- auditoria de login permanece no Keycloak; mudanças futuras de membership
  geram AuditLog em task própria.

## Estratégia de testes

- contract tests do provider Ada com chaves efêmeras e servidor JWKS local;
- testes de claims, algorithms, audience e `kid` antes da implementação;
- teste de concorrência/rotação do remote JWKS;
- pack + instalação Bun limpa do package;
- Keycloak local com realm import versionado e clients separados SPA/API;
- integração API com tokens reais do realm local;
- migration e rollback em PostgreSQL descartável;
- testes negativos de repository e HTTP com duas empresas;
- unit tests da matriz de permissões e proteção default;
- Playwright para PKCE/login, sessão expirada e ausência de token em storages;
- revisão Sol de auth/tenant e reviewer gratuito nos gates finais.

## Riscos

- colisão do nome npm pode quebrar consumidores externos;
- `aud` do access token exige audience mapper correto no realm;
- configuração ampla de redirect URI/web origin compromete o fluxo SPA;
- claims e roles duplicadas entre realm/client podem autorizar indevidamente;
- indisponibilidade de Keycloak não pode transformar readiness em liveness;
- atualizar `jose`, Keycloak ou o package Ada exige repetir os contratos.
