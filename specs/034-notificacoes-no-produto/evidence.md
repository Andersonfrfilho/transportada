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

⚠️ **Deploy:** a variável é obrigatória. Staging e production não sobem sem ela — precisa ser
gerada por ambiente (distinta das outras chaves) e cadastrada no Railway antes do próximo deploy da
API. Está no runbook (`docs/ops/backup-emergencia.md`) e no contrato
`test/deploy/secrets.contract.ts`.
