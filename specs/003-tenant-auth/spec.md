# Feature 003 — Identidade, tenant e autorização

## Problema e resultado

O TransportAdA ainda não possui identidade autenticada, contexto de empresa ou
autorização. O resultado desta feature é uma fundação Keycloak em que a API
valida tokens por um package Ada compatível com Bun, deriva `companyId` somente
da identidade autenticada, confirma o vínculo local ativo e aplica permissões
deny-by-default.

O inventário encontrou um conflito de identidade entre packages:

- o npm publica `@adatechnology/auth-keycloak@0.1.18` com implementação e peers
  NestJS;
- o checkout Ada contém um provider Bun `0.0.1` sob o mesmo nome;
- o provider Bun local ainda não exige `exp`, `iss`, `aud` e `sub`, não valida
  a audience configurada, aceita fallback de algoritmo e pode escolher a
  primeira JWK quando `kid` está ausente.

O ADR 0002 resolve o conflito criando `@adatechnology/keycloak-jwt` como package
novo, ESM e compatível com Bun. O package NestJS publicado é preservado sem
alterações.

## Fora do escopo

- senha, sessão ou JWT próprios do TransportAdA;
- cadastro, recuperação de senha ou administração de usuários no Keycloak;
- configuração fiscal, certificado ou dados cadastrais completos da empresa;
- entidades de NF-e, frete, CT-e ou faturamento;
- roles customizáveis pelo cliente;
- deploy ou configuração no Railway.

## Histórias priorizadas

### P1 — Provider Ada seguro para Bun

**Given** o contrato público escolhido para o provider Keycloak, **When** um
token é verificado, **Then** assinatura, algoritmo, issuer, audience, expiração,
not-before, subject e chave identificada por `kid` são validados sem depender
de NestJS.

### P1 — Identidade e tenant autenticados

**Given** um token válido com claim `company_id`, **When** uma rota protegida é
executada, **Then** a API cria um contexto com `userId` e `companyId`, confirma
o vínculo ativo no PostgreSQL e ignora qualquer tenant enviado pelo cliente.

### P1 — Autorização deny-by-default

**Given** uma rota não marcada explicitamente como pública, **When** o usuário
não possui a permissão exigida, **Then** a API retorna `401` ou `403` seguro e
não executa o caso de uso.

### P1 — Isolamento negativo

**Given** dois usuários vinculados a empresas distintas, **When** a identidade
da empresa A tenta selecionar um vínculo ou recurso da empresa B, **Then**
nenhum dado da empresa B é retornado.

### P2 — Login SPA por padrão OIDC

**Given** uma sessão inexistente ou expirada, **When** o usuário acessa uma
rota protegida no frontend, **Then** a SPA inicia Authorization Code com PKCE
S256 no Keycloak e mantém tokens apenas em memória.

### P2 — Ambiente local reproduzível

**Given** o Makefile do projeto, **When** o mantenedor sobe o ambiente de
identidade local, **Then** um realm de teste, clients públicos/API, audience,
claims e roles previsíveis ficam disponíveis sem Railway.

## Requisitos funcionais

- usar Keycloak como provedor de identidade;
- usar Authorization Code + PKCE S256 no frontend; implicit flow e password
  grant não fazem parte da aplicação;
- validar JWT na API com o package Ada e uma biblioteca JOSE consolidada;
- exigir `kid` e rejeitar algoritmo fora da allowlist;
- exigir `iss`, `aud`, `exp` e `sub`; a adaptação do TransportAdA também exige
  `company_id`;
- audience identifica o client da API, não apenas o client público da SPA;
- usar `(issuer, sub)` como identidade externa; `sub` isolado não é chave
  global;
- confirmar no banco que `(userId, companyId)` possui vínculo ativo;
- armazenar roles de empresa por membership, permitindo múltiplas roles, e
  mapear roles fixas para permissões em código tipado;
- roles iniciais: `platform-admin`, `company-admin`, `finance`, `fiscal`,
  `operator` e `viewer`;
- tratar `platform-admin` em contexto de plataforma separado, nunca como bypass
  implícito de uma rota tenant;
- obter `platform-admin` somente da realm role exata em JWT já validado; roles
  de empresa presentes no token não têm autoridade e são resolvidas da
  membership ativa no PostgreSQL;
- rotas da API são privadas por padrão; somente health é público nesta fase;
- expor `GET /auth/me` com identidade, empresa ativa, roles e permissões
  permitidas;
- diferenciar `401 UNAUTHENTICATED` de `403 FORBIDDEN`, sem revelar validação
  criptográfica, role ausente ou existência de recurso de outro tenant.

## Requisitos não funcionais

- TypeScript estrito e sem `any`;
- package Ada sem dependência ou peer de NestJS;
- cache JWKS com TTL, cooldown, timeout, deduplicação de fetch concorrente e
  refetch controlado para rotação de `kid`;
- issuer e URL JWKS vêm somente de configuração confiável; fora do ambiente
  local exigem HTTPS, timeout e limite de resposta;
- nenhum token, authorization header, cookie, claim completa ou resposta JWKS
  em logs;
- nenhum token em `localStorage`, `sessionStorage`, IndexedDB ou cache do
  service worker;
- cookies, se adicionados futuramente por um BFF, exigem HttpOnly, Secure,
  SameSite e proteção CSRF definidos por nova spec;
- migrations versionadas e fora do startup;
- toda query local de vínculo inclui `companyId`;
- nenhuma aplicação importa fonte de outra.

## Casos extremos e falhas

- token sem `kid`, com `alg=none`, audience incorreta ou claim obrigatória
  ausente é rejeitado;
- `kid` desconhecido força no máximo um refetch permitido pelo cooldown; chave
  ainda ausente retorna `401`;
- indisponibilidade do JWKS não invalida imediatamente uma chave ainda fresca,
  mas degrada readiness quando não há cache utilizável;
- clock skew é pequeno, explícito e testado;
- empresa inexistente, desativada ou sem vínculo ativo retorna `403`;
- `platform-admin` não recebe acesso implícito a dados tenant-scoped: a rota
  precisa declarar escopo de plataforma ou empresa;
- cada token seleciona uma única empresa por `company_id`; troca de empresa
  exige novo token emitido pelo Keycloak e não altera contexto em voo;
- refresh de token falha fechando a sessão e voltando ao login;
- múltiplas abas não persistem token para sincronizar sessão.

## Critérios de aceite

- contract suite do package Ada cobre assinatura, issuer, audience, algoritmo,
  `kid`, claims obrigatórias, expiração e rotação;
- 10 verificações concorrentes provocam no máximo um fetch JWKS equivalente;
- tarball do package instala e executa em projeto Bun limpo, sem NestJS;
- API retorna `401` para token ausente/inválido e `403` para vínculo ou
  permissão insuficiente;
- `companyId` enviado em body, query ou header não substitui o claim validado;
- testes com duas empresas provam isolamento negativo no repositório e HTTP;
- migration cria somente o shell de empresa e vínculos necessários à
  identidade, aplica em banco vazio e possui rollback documentado;
- frontend usa PKCE S256, renova token antes da chamada e não persiste tokens;
- Playwright cobre redirect, retorno autenticado, expiração e storage vazio;
- `make up`, `make dev`, `make check` e `make smoke` continuam locais;
- nenhuma ação Railway ou publicação npm ocorre sem gate e aprovação humana.

## Dúvidas

Nenhuma dúvida bloqueante. A identidade do package, a separação das
responsabilidades tenant e o rollback estão decididos no ADR 0002.
