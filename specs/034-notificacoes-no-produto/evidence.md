# 034 — Evidências

Uma seção por task, com o comando rodado e o resultado. Task sem evidência aqui não está fechada.

## T001 — módulo instalado e migrations no passo manual

Versões instaladas divergem do que a task pediu, por indisponibilidade no registry:

- `@adatechnology/module-http` — `0.1.0-rc.1`; a `rc.2` pedida não existe publicada.
- `@adatechnology/notification-module` — `0.1.0-rc.3`, não `rc.2`. A `rc.2` não sobe nesta API: o
  migrator do drizzle 1.x recusa o layout antigo de `meta/_journal.json` e o pacote ainda o trazia
  (`We detected that you have old drizzle-kit migration folders`). A correção foi feita no pacote
  (`adatechnology-packages`, commits `99a5327` + `c902afe`) e publicada pelo pipeline.

O rollback mora em `apps/api-transportada/drizzle-notification/rollback.sql`, e não em `drizzle/`,
porque `test/database-migration/static-migration.contract.ts` fixa a lista exata de diretórios de
migration da aplicação — um diretório a mais reprova. A tabela de controle do módulo é
`drizzle.notification_migrations`: o migrator troca o nome da tabela, não o schema.

```
$ DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL bun run --cwd apps/api-transportada db:test
 44 pass
 0 fail
 552 expect() calls
Ran 44 tests across 3 files.
```

```
$ bun run --cwd apps/api-transportada db:migrate
$ select table_name from information_schema.tables where table_schema='notification'
deliveries,devices,notifications,preferences,suppressions,templates
```

`bun run lint` e `bun run typecheck` (raiz, quatro apps) sem achados.

## T002 — composition root, destinatário e chave de supressão

O `recipientResolver` (`src/notification/infrastructure/identity-recipient.resolver.ts`) junta
`identity_user_profiles` a `user_company_memberships`: o perfil não tem empresa, quem tem é o
vínculo. Pedir o mesmo `userId` pelo contexto de outra empresa devolve "não existe", e não o
contato da pessoa. Contato de canal diferente de e-mail sai como `phone`, nunca como `email`.

`NOTIFICATION_SUPPRESSION_HMAC_KEY` entrou em `cryptographic-configuration.schema.ts`, no mesmo
regime das demais: 32 bytes em base64 canônico, obrigatória, e recusada se repetir material do
keyring ou da chave de idempotência. Ausente, o boot cai com `CryptographicConfigurationError` — a
supressão que não casa deixaria o e-mail voltar para quem já recusou.

O driver de e-mail é o `createSmtpEmailProvider` do worker, sobre os mesmos `EMAIL_FROM`/`SMTP_URL`
(ADR-0031). Sem os dois, o módulo sobe com `features.email: false` em vez de dar por enviado o que
não saiu daqui.

```
$ bun run --cwd apps/api-transportada test
 2406 pass
 12 skip
 0 fail
Ran 2418 tests across 98 files.

$ DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL bun run --cwd apps/api-transportada db:test
 49 pass
 0 fail
 557 expect() calls

$ make config   # exit 0 — o gate agora exige NOTIFICATION_SUPPRESSION_HMAC_KEY no .env
$ bun run typecheck && bun run lint   # raiz, quatro apps, sem achados
```

⚠️ **Deploy (T002):** a variável é obrigatória. Staging e production não sobem sem ela — precisa ser
gerada por ambiente (distinta das outras chaves) e cadastrada no Railway antes do próximo deploy da
API. Está no runbook (`docs/ops/backup-emergencia.md`) e no contrato
`test/deploy/secrets.contract.ts`.

## T003 — a conexão de stream sobrevive ao heartbeat

Subir `IDLE_TIMEOUT_SECONDS` de 10 para 60 não bastaria: `server.timeout(request, seconds)` vale
**por requisição** e vence o `idleTimeout` global do `Bun.serve`, e o handler já chamava
`server.timeout(request, REQUEST_TIMEOUT_SECONDS)` no começo de toda requisição. O stream morreria
nos mesmos 10 segundos, calado, com o cliente reconectando em loop. A rédea é solta no fim de
`executeRequest`, e só para resposta `text/event-stream`; requisição comum continua em 10s.

O contrato (`test/server/sse-timeout.contract.ts`) observa as chamadas de `timeout()` por um espião
do `RequestTimeoutPort`, em vez de manter um socket vivo por 26 segundos — a suíte não paga meio
minuto para provar o que a sequência de chamadas já prova. Ele fixa três coisas: que
`IDLE_TIMEOUT_SECONDS` é maior que o `DEFAULT_SSE_HEARTBEAT_SECONDS` (25) exportado pelo módulo, que
resposta JSON recebe só `REQUEST_TIMEOUT_SECONDS`, e que resposta de stream termina em
`IDLE_TIMEOUT_SECONDS`.

```
$ bun test test/sse-timeout.contract.test.ts
 3 pass
 0 fail

$ bun run --cwd apps/api-transportada test
 2412 pass
 12 skip
 0 fail
Ran 2424 tests across 99 files.

$ bun run typecheck && bun run lint   # raiz, quatro apps, sem achados
```

## T004 — rotas do módulo sob `/v1`

`createModuleFetchRouter` entra no `createRouter` como `moduleRouter`, e a delegação acontece
**antes** do `authentication.authenticate` da aplicação. Não é detalhe: o módulo tem rota de escopo
`public` (o webhook de recibo, que se protege por assinatura sobre o `rawBody`), e autenticar aqui
daria 401 no que é público por contrato. Os dois conjuntos de caminho são disjuntos pelo prefixo
`/v1`, que nenhuma rota da aplicação usa — o módulo é superfície de terceiro e versiona no ritmo
dele.

O `authResolver` (`notification-auth.resolver.ts`) é o mesmo caminho de sempre: token pelo
`authentication`, empresa pelo `tenantContext`. Token recusado vira identidade não resolvida (401 no
módulo, sem distinguir ausente de expirado). Falta de vínculo **não** vira 401: o `ApiError` 403 é
traduzido para a forma que o filtro do `module-http` reconhece (`statusCode`/`code`/`message`), senão
"não tem acesso a esta empresa" chegaria ao cliente como "não se identificou".

As rotas do módulo também alimentam o `allowedMethods`, que é a fonte do preflight — rota nova ganha
CORS por existir, sem lista paralela. O formato do segmento dinâmico ali é `raw`, e não
`canonicalUuid`, porque `:driver` do webhook não é UUID.

Sem `webhookSecret` o próprio módulo não publica a rota de recibo: o caminho responde **404, não
401**. Ele fica assim até o T005, que traz assinatura, janela de timestamp e nonce — publicar antes
seria aceitar qualquer corpo como recibo.

⚠️ As rotas de template têm escopo `admin` no módulo e `requiredScopes` vazio, o que o `module-http`
lê como "qualquer escopo do host": hoje qualquer usuário com vínculo ativo lista e cria template. O
`createNotificationRoutes` não expõe como restringir isso. Registrado para o T008, que é quando o
catálogo passa a ter dono.

```
$ bun test ./test/notification-http.contract.test.ts
 8 pass
 0 fail

$ bun run --cwd apps/api-transportada test
 2420 pass
 12 skip
 0 fail
Ran 2432 tests across 100 files.

$ bun run typecheck && bun run lint   # raiz, quatro apps, sem achados
```
