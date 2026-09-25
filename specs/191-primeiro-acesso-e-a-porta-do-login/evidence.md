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
