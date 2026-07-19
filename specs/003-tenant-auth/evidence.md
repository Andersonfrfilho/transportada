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
