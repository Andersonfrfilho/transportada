## T7.3 — chave `RATE_LIMIT_SUBJECT_HMAC_KEY` (2026-09-25)

O usuário criou a chave nos dois ambientes com `railway variables --service api --set
"RATE_LIMIT_SUBJECT_HMAC_KEY=$(openssl rand -hex 32)"`. O orquestrador conferiu, sem imprimir os
valores: staging e produção têm 64 caracteres hexadecimais (32 bytes) e valores distintos. A chave
de produção foi gerada duas vezes, e vale a segunda. Nenhum código a lia ainda.

## T0.1 — ADR-0076 conferida e aceita (2026-09-25)

`git fetch && git log --all --oneline -- 'specs/191*' 'docs/adr/0076*'` devolve só `82095c671` (o
commit que criou a spec e a ADR). `ls docs/adr` termina em `0076`; 191 e 0076 seguem livres.

Conferido contra o código, sem divergência:

| Afirmação da ADR                                      | Onde                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| IP vem do primeiro `x-forwarded-for`                  | `http/client-ip.service.ts:11-22`                                            |
| oito chamadas de `resolveClientIp`                    | `router.service.ts:217`, `trip.routes.ts:1254`, `trip-field-office-*`, fleet |
| rotas anônimas de identidade sem `rateLimit`          | `rg rateLimit src/identity/presentation` → 0                                 |
| guarda de boot só olha rotas autenticadas             | `router.service.ts:424-434`                                                  |
| FKs `RESTRICT` para a membership                      | `user-invitation.schema.ts:74-80`, `password-reset.schema.ts:62-68`          |
| status derivado olha o convite antes da membership    | `company-user.policy.ts:85-91`                                               |
| ativação chama `setEnabled(true)` sem olhar o vínculo | `activate-invitation.use-case.ts:79`                                         |
| recuperação só chama `setPassword`                    | `confirm-password-reset.use-case.ts:75`                                      |
| código com 64 bits                                    | `invitation.policy.ts:68-72` (`randomBytes(8)`)                              |
| worker entrega convite `pending` com `sealed_code`    | `worker .../drizzle-invitation.repository.ts:44-63`                          |
| realm sem força bruta                                 | `rg bruteForce deploy/keycloak/realm.json realm/*.json` → 0                  |
| tema revela só o primeiro link                        | `password-reset-link.js:50` (`querySelector`)                                |
| oráculo de valor do `login-hints`                     | `login-identifier.policy.ts:83-93`                                           |
| achado 2026-09-18 aberto                              | `docs/SECURITY.md:304-326`                                                   |

Status passa de `proposta` a `aceita`, sem mudar decisão.

## T0.2 — medição da remoção de vínculo com histórico (2026-09-25)

`test/integration/company-user-removal.integration.ts`, registrado no `test:integration` do
`package.json`. Chama `DrizzleCompanyUserRepository.removeMembership` num banco descartável e
captura a falha como `{ sqlState, constraint }` (via `findPostgresError`).

```bash
cd apps/api-transportada
bun --env-file=../../.env.test test --timeout 120000 ./test/integration/company-user-removal.integration.ts
# 0 pass, 3 fail
```

| Caso                                             | SQLSTATE | Constraint                              |
| ------------------------------------------------ | -------- | --------------------------------------- |
| (a) convidado, convite `pending`                 | `23503`  | `user_invitations_membership_fk`        |
| (b) ativado (`accepted`) + pedido de recuperação | `23503`  | `user_invitations_membership_fk`        |
| (c) sem convite + pedido de recuperação          | `23503`  | `password_reset_requests_membership_fk` |

A hipótese se confirmou nas duas FKs. O caso (c) foi acrescentado porque, no (b), a FK do convite
barra antes e esconde a do pedido; o vínculo sem convite existe de verdade (o primeiro administrador
nasce sem convite).

Nenhum mapeamento de `23503` em `src/http`: a rota `DELETE` do vínculo responde 500 genérico.
Efeito colateral medido no caminho: `remove-company-user-membership.use-case.ts:74-86` desvincula o
WhatsApp e chama `setEnabled(false)` no Keycloak **antes** do `DELETE` que falha. Quem tenta remover
um convidado hoje deixa a conta desabilitada no realm e o vínculo intacto no banco.

O teste fica vermelho até a T2.2. ⚠️ Enquanto isso, `bun run test:integration` tem estas 3 falhas
esperadas.

Gates: `bun run typecheck` (exit 0) e `bun run lint` (exit 0) na raiz.

## T1.1 — IP do salto conhecido (2026-09-25)

Portado de `51cd186c6` (`fix/client-ip-trusted-proxy`) sobre o código atual, sem cherry-pick: toda
menção a "ADR-0065" virou "ADR-0076 §6". Vieram do branch: `src/shared/client-ip.constant.ts`,
`createClientIpResolver` (`x-real-ip` padrão, `cf-connecting-ip`, `x-forwarded-for` com
`TRUSTED_PROXY_HOPS`; não-IP vira `unknown`), `CLIENT_IP_SOURCE`/`TRUSTED_PROXY_HOPS` no
`environment.schema.ts` e no `.env.example`, `clientIpPolicy` no `ApiEnvironment`, e o `Map` do
limitador com teto de 50 000 baldes (o código atual já media cada balde pela própria janela; o teto
substituiu o `SWEEP_THRESHOLD_ENTRIES`).

Diferença do branch: lá só o roteador e o agregado recebiam o resolvedor. Aqui um resolvedor só é
criado no `main.ts` e injetado como `resolveClientIp` nas dependências dos oito pontos. O campo é
**obrigatório** nas dependências das rotas; no `createRouter` é opcional com o padrão, como no branch.

Visto vermelho antes de implementar: `bun test ./test/client-ip.contract.test.ts
./test/fleet-http.contract.test.ts` → 101 pass, 2 fail, 1 erro de import (o `createClientIpResolver`
não existia; XFF rotativo recebia 202 em vez de 429).

```text
$ grep -rn 'resolveClientIp(' src   # só chamadas com o resolvedor injetado
src/http/router.service.ts:224                              (parâmetro do createRouter)
src/fleet/presentation/aggregate-account.routes.ts:65       dependencies.resolveClientIp
src/trips/presentation/trip-field-office-trip.routes.ts:138 dependencies.resolveClientIp
src/trips/presentation/trip-field-office-trip.routes.ts:189 dependencies.resolveClientIp
src/trips/presentation/trip-field-office-trip.routes.ts:246 dependencies.resolveClientIp
src/trips/presentation/trip.routes.ts:1256                  dependencies.resolveClientIp
src/trips/presentation/trip-field-office-occurrence.routes.ts:128 dependencies.resolveClientIp
src/trips/presentation/trip-field-office-document.routes.ts:108   input.resolveClientIp (vem das dependências)
```

`test/client-ip/call-sites.contract.ts` manda `x-forwarded-for: 203.0.113.1, 198.51.100.7` com
`x-real-ip: 198.51.100.7` a cada um dos oito pontos e confere que o IP resolvido é o do `x-real-ip`
(no roteador, o segundo pedido com XFF trocado leva 429).

Gates:

- `bun test ./test/client-ip.contract.test.ts` → 33 pass, 0 fail.
- `bun test ./test/fleet-http.contract.test.ts ./test/contractor-mail.contract.test.ts
./test/trip-field-office.contract.test.ts` → 344 pass, 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo) → 7341 pass, 23 skip,
  0 fail, 184 arquivos.
- Integração dos arquivos tocados: `server`, `auth-me`, `trip-field-office-router`,
  `trip-field-office`, `trip-timeline` → 52 pass, 0 fail.
- `bun run typecheck` (raiz) exit 0; `bun run --cwd apps/api-transportada lint` exit 0.

`docs/SECURITY.md`: a entrada 2026-09-18 passou a "fechado em 2026-09-25". A medição em staging se
repete na T7.4.
