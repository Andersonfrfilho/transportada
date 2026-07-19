# Evidência — Feature 003

## Inventário inicial

Modelos:

- OpenCode `deepseek-v4-flash-free`: primeiro rascunho de spec, plano e tasks;
- Codex Sol high: revisão de segurança, tenant, dados e contratos reais.

Fontes inspecionadas:

- constituição, arquitetura, domínio e plano de entrega do TransportAdA;
- grafo existente do repositório `adatechnology-packages`;
- manifest, source, testes e README do provider Bun local;
- tarball npm de `@adatechnology/auth-keycloak@0.1.18`;
- documentação atual de Keycloak 26.5.2 e `jose`.

Descobertas confirmadas:

- o tarball npm `0.1.18` contém implementação NestJS, peers
  `@nestjs/common`/`@nestjs/core` e não pode ser consumido pela API Bun;
- o checkout Ada contém outro provider Bun, versão `0.0.1`, sob o mesmo nome;
- o source Bun local não exige claims padrão, não valida a audience configurada,
  aceita fallback de algoritmo e pode escolher uma JWK sem `kid` inequívoco;
- o frontend deve usar Authorization Code + PKCE S256; o adapter Keycloak
  mantém access e refresh tokens em memória;
- `jose` suporta Bun, `createRemoteJWKSet`, `jwtVerify`, allowlist de algoritmo,
  issuer, audience, required claims, cache e cooldown;
- `company_id` e a matriz de permissões são regras do TransportAdA, não do
  package genérico.
- revisão Sol exigiu identidade por `(issuer, sub)`, roles locais por
  membership e contextos separados de plataforma e empresa;
- revisão Sol recomenda preservar o package NestJS publicado e adotar um novo
  nome para o provider Bun.

## T001 — Identidade do package e ADR

Decisão aceita:

- o provider Bun será `@adatechnology/keycloak-jwt`;
- o package publicado `@adatechnology/auth-keycloak` permanece compatível com
  seus consumidores NestJS e não é alterado;
- identidade externa usa `(issuer, subject)`;
- tenant, membership e autorização permanecem no TransportAdA;
- publicação depende de gate próprio e aprovação humana;
- rollback usa pin de versão e nova correção, nunca `unpublish`.

Arquivos:

- `docs/adr/0002-keycloak-jwt-package-and-tenant-context.md`;
- `specs/003-tenant-auth/spec.md`;
- `specs/003-tenant-auth/plan.md`;
- `specs/003-tenant-auth/tasks.md`;
- `specs/003-tenant-auth/evidence.md`.

Nenhuma implementação, publicação, ação Railway ou leitura de certificado foi
executada nesta task.

## T002 — Contract suite de segurança

Modelo executor e revisão: Codex Sol high. O grafo e os providers
`drizzle-provider`/`rabbitmq-provider` orientaram o formato ESM, exports
tipados, `tsup`, TypeScript estrito e testes Bun.

Commit Ada:

- `ea93e71 test(auth): define Keycloak JWT security contracts`

Contratos inicialmente vermelhos:

- token válido e audience simples ou em array;
- assinatura adulterada e token malformado;
- `iss`, `aud`, `exp`, `sub` e claims configuradas obrigatórias;
- issuer/audience incorretos e `azp` sem `aud`;
- expiração, `nbf` opcional e clock tolerance;
- `sub` vazio ou não textual;
- algoritmo fora da allowlist, `none`, `kid` ausente ou desconhecido;
- allowlist insegura e JWKS HTTP fora de loopback;
- erros tipados, mensagem constante e ausência de token ou `cause`.

Evidência local:

```text
bunx prettier --check .
All matched files use Prettier code style!

bunx tsc --noEmit -p tsconfig.json
exit 0

pnpm exec eslint src test
exit 0

bun test test/token-verification.contract.test.ts
0 pass, 23 fail
```

As 23 falhas são esperadas e causadas pelo stub `Not implemented`. Nenhuma
dependência JOSE ou lógica de verificação foi adicionada antes dos contratos.

## T003 — Verificação JWT/JWKS

Modelo executor e revisão independente: Codex Sol high.

Commit Ada:

- `d79b955 feat(auth): verify Keycloak JWTs with jose`

Implementação:

- `jose@6.2.3` ESM fixado como dependência;
- factory mantém uma instância `createRemoteJWKSet`;
- allowlist assimétrica, algoritmo e `kid` validados antes do fetch;
- issuer, audience, `exp`, `sub` e claims adicionais obrigatórios;
- `nbf` e clock tolerance explícitos;
- JWKS HTTP permitido somente em loopback local;
- erros de configuração e verificação têm tipos e mensagens seguras;
- JWKS 503/JSON inválido é separado de token inválido;
- configuração runtime inválida não escapa como `TypeError`;
- claims retornadas são congeladas.

Evidência local:

```text
pnpm exec tsc --noEmit -p tsconfig.json
exit 0

pnpm exec prettier --check package.json src test tsconfig.json tsup.config.ts
All matched files use Prettier code style!

pnpm exec eslint src test
exit 0

bun test
26 pass, 0 fail, 99 expect() calls

pnpm exec tsup
ESM dist/index.js 7.49 KB
DTS dist/index.d.ts 1.80 KB
```

A revisão não encontrou bypass restante de issuer, audience, `kid` ou
algoritmo, nem vazamento no erro público. Cache, cooldown, timeout, limite de
resposta e rotação permanecem na T004.

## T004 — Ciclo remoto JWKS

Modelo executor e revisão independente: Codex Sol high.

Commit Ada:

- `2259078 feat(auth): harden remote JWKS lifecycle`

Comportamentos:

- 10 verificações concorrentes iniciais usam um único fetch;
- cache fresco é reutilizado e cache vencido é atualizado;
- 10 tokens com `kid` rotacionado provocam somente um refetch após cooldown;
- tokens com `kid` desconhecido durante cooldown não causam rajada;
- cooldown mínimo é 1 segundo e `cacheMaxAge` não pode neutralizá-lo;
- timeout cobre espera por headers e corpo interrompido;
- limite de bytes cobre `Content-Length` e stream chunked;
- configuração remota inválida produz erro tipado;
- `getJwksStatus()` expõe apenas booleanos seguros para readiness, sem URL,
  chaves ou clone do JWKS.

Evidência local:

```text
pnpm exec tsc --noEmit -p tsconfig.json
exit 0

pnpm exec prettier --check package.json src test tsconfig.json tsup.config.ts
All matched files use Prettier code style!

pnpm exec eslint src test
exit 0

bun test
36 pass, 0 fail, 128 expect() calls

pnpm exec tsup
ESM dist/index.js 10.96 KB
DTS dist/index.d.ts 2.37 KB
```

A revisão final não encontrou race, bypass do limite, erro de classificação ou
resource leak bloqueante.

## T005 — Empacotamento e instalação Bun limpa

Modelo executor: Codex Terra medium. Revisão: Codex Sol high.

Commit Ada:

- `dc068cd docs(auth): prepare Keycloak JWT package release`

Artefato:

- changeset minor prepara a primeira versão sem alterar manualmente `0.0.0`;
- tarball final contém somente `README.md`, `dist/index.js`,
  `dist/index.d.ts` e `package.json`;
- tamanho final: 4,8 kB compactado e 16,8 kB descompactado;
- metadata não contém `workspace:`, `file:`, NestJS ou source interno;
- árvore do consumidor contém o package, `jose@6.2.3` e TypeScript usado
  apenas pelo teste.

Evidência local:

```text
npm pack --dry-run --json
4 arquivos; nenhum bundled dependency

bun install --force
3 packages installed

bun run check
exit 0

bun run test:runtime
esm-types-runtime-ok

bun install --frozen-lockfile
1 package installed

bun run check
exit 0

bun run test:runtime
esm-types-runtime-ok
```

O consumidor temporário usa o tarball local por `file:` somente para testar o
artefato ainda não publicado. Esse caminho existe no lock temporário, não no
package empacotado. Nenhuma publicação npm, ação Railway ou push foi executado.

## T007 — Keycloak local

Modelo executor: Codex Terra medium. Revisão: Codex Sol high.

Commit TransportAdA:

- `ed98fc1 feat(auth): add local Keycloak realm`

Fundação local:

- Keycloak 26.5.2 fixado por versão e digest;
- serviço saudável dentro do projeto Compose `transportada-local`;
- realm importado de JSON versionado;
- SPA pública com Authorization Code, callback exato e PKCE S256;
- implicit flow, password grant e service account desabilitados;
- client API bearer-only usado como audience separada;
- mapper `company_id` no access token;
- roles fixas existem como fixtures, mas nenhuma role tenant é atribuída ao
  usuário ou tratada como autoridade;
- placeholders do realm são substituídos por ambiente conforme suporte oficial
  do Keycloak 26.5.2;
- `make realm-contract`, `make config`, `make up`, `make ps` e o smoke de
  identidade usam o mesmo Makefile/nome de projeto.

Evidência local:

```text
ENV_FILE=.env.example make realm-contract
4 pass, 0 fail, 33 expect() calls

ENV_FILE=.env.example make up
transportada-local-keycloak-1 healthy

discovery issuer/JWKS
exit 0

Authorization Code + callback exato + S256
HTTP 200

ENV_FILE=.env.example make check
API 11 pass, 1 skip
worker 22 pass
frontend 3 pass
lint, typecheck e builds verdes
```

O Keycloak e os demais serviços de infraestrutura permanecem locais e
saudáveis. Os apps não foram iniciados, portanto o `make smoke` completo ficou
fora deste gate; discovery, JWKS e health do Keycloak foram validados
diretamente. Nenhuma ação Railway ou uso do certificado ocorreu.
