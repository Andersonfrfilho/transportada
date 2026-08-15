# 033 — Evidências

Uma seção por task, com o comando rodado e o resultado. Task sem evidência aqui não está fechada.

## T001 — tabela `password_reset_requests` e migration

Contrato antes: `test/password-reset-schema/schema.contract.ts` (12 testes) escrito e confirmado
vermelho pelo motivo certo (`Cannot find module '../../src/database/password-reset.schema.js'`)
antes de existir schema.

```
bun test ./test/password-reset-schema.contract.test.ts
 12 pass · 0 fail

make migration-test
 38 pass · 0 fail · 508 expect() calls
```

Migration `drizzle/20260813024255_password_reset_requests/`, com `rollback.sql` manual em transação
que derruba as duas tabelas e apaga a linha do journal (hash
`f69136c5eed9b2921b7c88eed772bc330f27bbd6060549d127e6f91a0b557bc1`), falhando se não remover
exatamente uma.

Três decisões que a spec não fixava:

- **Sem coluna de situação.** `consumed_at` e `expires_at` são os únicos estados; um `status` ao lado
  seria uma terceira verdade, e as três discordariam no primeiro caminho que esquecesse de atualizá-la.
- **Sem `actor_user_id` na outbox.** Quem pede recuperação não está autenticado — inventar um ator
  registraria coisa que não aconteceu.
- **`sealed_code` é `not null`**, ao contrário do convite: ali a coluna nasceu depois das linhas, aqui
  não há legado.

## T002/T003 — política de domínio

Contrato antes: `test/password-reset-domain/password-reset.contract.ts` (9 testes), vermelho por
módulo inexistente antes da policy.

```
cd apps/api-transportada && bun test ./test/password-reset-domain.contract.test.ts
 9 pass · 0 fail
```

A decisão aceita é `{ companyId, consumedAt, outcome, requestId, userId }` — sem nenhuma instrução
de habilitar conta, e o contrato assegura isso por asserção. Recuperar senha é de quem já entrava;
reabrir conta desabilitada com um código de e-mail seria escalada de privilégio.

## T004/T005/T006 — rotas anônimas

```
cd apps/api-transportada && bun test ./test/password-reset-domain.contract.test.ts \
  ./test/password-reset-application.contract.test.ts ./test/password-reset-http.contract.test.ts \
  ./test/password-reset-schema.contract.test.ts
 46 pass · 0 fail · 87 expect() calls

bunx tsc --noEmit        # limpo
bunx eslint src test --max-warnings=0   # limpo
```

`POST /password-resets` e `POST /password-resets/confirm` são `defineAnonymousRoute` (204), ligadas
no composition root. O tipo da dependência de identidade em `confirm-password-reset.use-case.ts`
expõe **só** `setPassword` — é o tipo que impede um `setEnabled` de aparecer numa edição futura.

⚠️ **Lacuna registrada: não há rate limiter nesta API.** A task pedia "registrar no rate limit", mas
`rg 'rateLimit|rate-limit|RATE_LIMIT' src/` não devolve nada — não existe mecanismo onde registrar.
As duas rotas anônimas seguem sem limite por IP até que um exista. Item para o `docs/SECURITY.md`.

## T007/T008 — entrega pelo worker

Contrato antes: `test/password-reset-delivery/consumer.contract.ts` (7 testes), vermelho por módulo
inexistente.

```
cd apps/worker-transportada && bun run test
 430 pass · 0 fail · 1020 expect() calls

bunx tsc --noEmit        # limpo
bunx eslint src test --max-warnings=0   # limpo
```

Trilha `${QUEUE_PREFIX}.password-reset-delivery.v1.{main,retry,dead}`, envelope `strictObject`
**sem `actorId`** (o contrato falha se ele aparecer) e payload só com referência. O AAD
`transportada:password-reset:v1:${companyId}:${requestId}` é fixado por asserção nos dois lados —
amarrado ao pedido, e não ao usuário como no convite, porque a mesma pessoa abre vários pedidos.

`findForDelivery` só devolve pedido **vivo** (`consumed_at is null` e não expirado): mensagem
atrasada na fila não ressuscita código que já não vale. Falha de entrega não invalida o código — o
contrato prova que nenhuma escrita acontece quando o envio estoura.

Os contratos de runtime (`nfe-runtime`, `shutdown-signals`) passaram a injetar
`startPasswordResetDeliveryConsumer`, e a ordem de drenagem agora inclui o novo consumidor e o novo
publisher.

## T009 — tela de recuperação

Contrato antes: `test/identity/password-reset.contract.ts`, vermelho por módulo inexistente.

```
cd apps/frontend-transportada && bun run test
 996 pass · 0 fail · 4973 expect() calls   (identity: 31 pass · 120 expect())

bunx tsc --noEmit        # limpo
bunx eslint src test --max-warnings=0   # limpo
```

`/recuperar-senha` é resolvida em `src/main.tsx` **antes** de `await initializeKeycloakAuth()` — a
tela precisa abrir sem sessão nenhuma, e o contrato compara os dois índices no corpo do bootstrap.

O silêncio da API não é reintroduzido pelo cliente: `request` engole falha de rede e de status por
construção (comentário no arquivo diz por quê), e a tela avança para o campo do código de qualquer
jeito. Na confirmação, 400 e 500 colapsam no mesmo `PASSWORD_RESET_REJECTED`.

## T011 — tema de login do Keycloak

Contrato antes: bloco `Keycloak login theme contract` em `test/keycloak-realm.contract.test.ts`,
5 testes vermelhos.

```
make realm-contract
 15 pass · 0 fail · 90 expect() calls
```

`deploy/keycloak/theme/login/` estende `keycloak.v2` em vez de forkar template: só uma folha de
estilo com os tokens do frontend (cópia por valor — o tema não importa código nosso) e um script
que acrescenta o link "Esqueci minha senha".

`resetPasswordAllowed` segue **false** nos dois realms: quem conduz a recuperação é a nossa API. O
link aponta para `/recuperar-senha` na origem tirada do `redirect_uri` da própria requisição de
login — que o Keycloak já validou contra a allowlist do client. Nenhuma URL de frontend fica escrita
no tema, que serve todas as instalações; o contrato falha se `http://localhost:53000` aparecer lá.

O tema chega aos dois ambientes pelo mesmo diretório: bind mount em `compose.yaml` no local, `COPY`
no `deploy/keycloak/Dockerfile` na imagem publicada.

## T010 — fechamento

```
make check              # format:check + lint + typecheck + test + build, verde
make migration-test     # 38 pass · 0 fail · 508 expect() calls
make worker-integration # 39 pass · 0 fail · 165 expect() calls
make realm-contract     # 16 pass · 0 fail · 93 expect() calls
```

Varredura de log em `apps/*/src/identity/**/*password-reset*`: nenhuma chamada de logger carrega
`username`, endereço de contato ou código — só `companyId`, `eventId` e `requestId`, todos opacos. O
`channel` aparece (é `email`/`whatsapp`, não o endereço).

Duas rodadas do gate reprovaram antes por formatação: a primeira em oito arquivos desta feature, a
segunda em dois de `specs/035-marca-modelo-e-eixos-do-veiculo` (alheios, corrigidos com
`prettier --write`).

⚠️ **Lacuna registrada, não resolvida:** as duas rotas anônimas seguem sem rate limit — não existe
limitador nesta API onde registrá-las. Registrado em `docs/SECURITY.md` (achado de 2026-08-13).
