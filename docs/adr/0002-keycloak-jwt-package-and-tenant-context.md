# ADR 0002 — Package Keycloak JWT e contexto tenant

- Status: aceito
- Data: 2026-07-18
- Decisores: mantenedor do projeto e revisão Codex Sol

## Contexto

O npm publica `@adatechnology/auth-keycloak@0.1.18` como integração NestJS. O
checkout de `adatechnology-packages` também contém um provider Bun `0.0.1` sob
o mesmo nome, mas com contrato e implementação incompatíveis com o artefato
publicado.

Alterar o package publicado no mesmo nome criaria uma quebra silenciosa para
consumidores NestJS. Consumir o provider local por `file:` também impediria
instalação independente e separação futura das aplicações.

Além disso, autenticar o JWT não é suficiente para autorizar dados de uma
empresa. A identidade externa e o vínculo tenant precisam permanecer
responsabilidades distintas.

## Decisão

1. Criar `@adatechnology/keycloak-jwt` em
   `adatechnology-packages/packages/backend/keycloak-jwt`.
2. Preservar `@adatechnology/auth-keycloak` e seus consumidores NestJS sem
   mudança nesta feature.
3. Fazer o novo package runtime-agnostic, ESM, compatível com Bun e sem
   dependência ou peer dependency de NestJS.
4. Expor um contrato pequeno de verificação de access token e encapsular
   `jose`; consumidores não importam internals de JWKS.
5. Exigir assinatura, allowlist de algoritmo, `kid`, `iss`, `aud`, `exp`,
   `nbf` quando presente e `sub`.
6. Tratar `(issuer, subject)` como identidade externa estável.
7. Manter `company_id`, membership, roles e permissões no TransportAdA. O
   package genérico não conhece tenant nem regras da aplicação.
8. Selecionar uma empresa por token. Trocar de empresa exige novo token; uma
   request nunca troca seu contexto autenticado em voo.
9. Publicar e fixar uma versão exata somente após contracts, concorrência JWKS,
   empacotamento e instalação Bun limpa, com aprovação humana.
10. Tratar somente a realm role exata `platform-admin`, presente em um JWT
    validado do issuer/audience confiáveis, como atribuição de plataforma.
    Roles de empresa vindas do token nunca autorizam uma operação: são
    resolvidas exclusivamente da membership ativa no PostgreSQL.

## Compatibilidade e migração

- `@adatechnology/auth-keycloak` continua sendo o package legado para NestJS.
- Novas aplicações Bun usam exclusivamente `@adatechnology/keycloak-jwt`.
- Não haverá alias, reexport ou dependência entre os dois packages nesta
  feature.
- O TransportAdA só adicionará a dependência depois de uma versão publicada e
  validada; não usará workspace externo nem caminho `file:`.
- Uma eventual convergência futura exige spec própria, major version e plano
  para consumidores NestJS.

## Consequências

- Há dois packages com propósitos explícitos durante a transição, evitando
  quebra de consumidores existentes.
- Correções de segurança JWT/JWKS ficam centralizadas e reutilizáveis.
- O package permanece pequeno, mas o TransportAdA ainda precisa resolver
  identidade, membership e autorização localmente.
- A revogação de `platform-admin` passa a valer na renovação/expiração do token;
  sua duração precisa permanecer curta e o refresh deve falhar fechado.
- A publicação npm vira um gate separado e não é consequência automática da
  implementação local.

## Segurança

- Issuer, audience, algoritmos e JWKS URL vêm de configuração confiável.
- Claims do token nunca escolhem host, realm ou tenant.
- Token, authorization header, claims completas e resposta JWKS não aparecem
  em logs ou erros públicos.
- Cache, cooldown, timeout, limite de resposta e fetch concorrente do JWKS são
  verificados por contrato.
- O contexto tenant só nasce depois da validação criptográfica e da confirmação
  de membership ativo no banco.
- `platform-admin` somente cria `PlatformContext` em rota declarada como
  platform-scoped e nunca substitui `CompanyContext` ou membership.
- Realm roles tenant como `company-admin`, `finance`, `fiscal`, `operator` e
  `viewer` não são fonte de autoridade, mesmo quando presentes no token.

## Rollback

Antes da publicação, o rollback remove somente o novo diretório e seu
changeset. Depois da publicação, nunca se executa `unpublish`: consumidores
voltam ao pin anterior e uma correção é lançada em nova versão.

O package NestJS existente não participa do rollback porque não será alterado.
As migrations de identidade e membership pertencem a tasks posteriores e têm
rollback próprio.
