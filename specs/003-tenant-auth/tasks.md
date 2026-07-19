# Tasks — Identidade, tenant e autorização

Uma task por vez e um commit atômico por task.

| ID   | Task                                                    | Dependência | Verificação                                                  | Critério de sucesso                                                  | Modelo                           |
| ---- | ------------------------------------------------------- | ----------- | ------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------- |
| T001 | Resolver identidade do package e registrar ADR          | nenhuma     | `bunx prettier --check docs/adr specs/003-tenant-auth`       | nome, compatibilidade e rollback decididos; clarification removida   | Codex Sol high                   |
| T002 | Escrever contract suite de segurança no provider Ada    | T001        | `bun test test/token-verification.contract.test.ts` vermelho | casos de issuer, audience, exp, nbf, sub, alg e kid cobertos         | Codex Sol high                   |
| T003 | Implementar verificação JWT/JWKS com `jose`             | T002        | `bun run check && bun test` no package                       | nenhum fallback, erro tipado e tokens válidos/verificações verdes    | Codex Sol high                   |
| T004 | Validar cache, rotação, timeout e concorrência JWKS     | T003        | `bun test test/remote-jwks.integration.test.ts`              | 10 requests equivalentes causam um fetch em voo; rotação comprovada  | Codex Sol high                   |
| T005 | Empacotar e validar provider em projeto Bun limpo       | T004        | `npm pack --dry-run`, `bun install --frozen-lockfile`, check | tarball sem Nest, exports ESM/types e lock reproduzível              | Codex Terra medium + revisão Sol |
| T006 | Publicar versão Ada aprovada e fixar na API             | T005        | workflow verde, `npm view`, frozen install da API            | versão exata publicada após aprovação humana e instalada sem `file:` | Codex Sol high                   |
| T007 | Adicionar Keycloak/realm local pelo Makefile            | T001        | `make up && make ps`, health e contract do realm             | clients SPA/API, PKCE, audience, claim e roles reproduzíveis         | Codex Terra medium + revisão Sol |
| T008 | Criar schema de identities, company, membership e roles | T001        | `bun test test/identity-schema.contract.test.ts`             | unique issuer/sub, FKs, múltiplas roles e índices tenant definidos   | Codex Sol high                   |
| T009 | Gerar/aplicar migration e validar rollback              | T008        | `bun run db:check`, `db:generate` e teste integration        | nenhum drift, startup sem migration e banco limpo após rollback      | Codex Sol high                   |
| T010 | Implementar gateway JWT e identidade externa na API     | T006, T009  | `bun test test/authentication.contract.test.ts`              | 401 seguro e identidade `(issuer, sub)` verificada, ainda sem tenant | Codex Sol high                   |
| T011 | Resolver membership e criar contexto company/platform   | T010        | `bun run test:integration` com duas empresas                 | contexto tenant só nasce após vínculo; plataforma fica separada      | Codex Sol high                   |
| T012 | Implementar matriz RBAC e proteção default              | T011        | `bun test test/authorization.contract.test.ts`               | deny-by-default e permissões locais tipadas sem vazamento            | Codex Sol high                   |
| T013 | Expor `/auth/me` e observabilidade segura               | T011, T012  | `bun test test/auth-me.contract.test.ts` e integração        | identidade ativa retorna; logs sem token/claims                      | Codex Terra medium + revisão Sol |
| T014 | Integrar frontend Keycloak com PKCE                     | T007, T013  | `bun run check` no frontend                                  | login-required, updateToken e token somente em memória               | Codex Terra medium + revisão Sol |
| T015 | Validar frontend autenticado com Playwright             | T014        | `bun run smoke` no frontend                                  | 375/768/1280, redirect seguro e storages sem token                   | Codex Terra medium               |
| T016 | Executar gates finais e revisão independente            | T001–T015   | frozen install, `make check`, integrations e `make smoke`    | evidência completa, sem Railway e sem achado crítico                 | OpenCode free + Codex Sol        |

## Comandos e gates previstos

| Escopo       | Comandos mínimos                                                |
| ------------ | --------------------------------------------------------------- |
| provider Ada | `bun run check`, `bun test`, pack, instalação Bun limpa         |
| API          | `bun run check`, `bun run test:integration`, `bun run db:check` |
| frontend     | `bun run check`, `bun run smoke`                                |
| stack        | `make up`, `make dev`, `make smoke`                             |
| raiz         | `bun install --frozen-lockfile`, `make check`                   |

## Delegação econômica

- OpenCode `deepseek-v4-flash-free`: inventário e primeira documentação.
- OpenCode `north-mini-code-free`: testes mecânicos após contratos Sol.
- OpenCode `nemotron-3-ultra-free`: revisão final somente leitura.
- Codex Terra medium: Compose, endpoints/UI e empacotamento reversível.
- Codex Sol high: package identity, JWT/JWKS, tenant, RBAC, migrations,
  publicação e release review.

Depois de duas falhas equivalentes, a task escala; não se repete a mesma
tentativa com contexto maior.

## Estado

- [x] T001 Resolver package e ADR.
- [x] T002 Contract suite do provider.
- [x] T003 Verificação JWT/JWKS.
- [x] T004 Cache e rotação.
- [x] T005 Empacotamento Bun limpo.
- [x] T006 Publicação e pin.
- [x] T007 Keycloak local.
- [x] T008 Schema de identities, company, membership e roles.
- [x] T009 Migration e rollback.
- [x] T010 Gateway JWT/identidade.
- [x] T011 Membership/contextos company e platform.
- [x] T012 RBAC deny-by-default.
- [ ] T013 `/auth/me` e observabilidade.
- [ ] T014 Frontend PKCE.
- [ ] T015 Playwright autenticado.
- [ ] T016 Gates finais.
