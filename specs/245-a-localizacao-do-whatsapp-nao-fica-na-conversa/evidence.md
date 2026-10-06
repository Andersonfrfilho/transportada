# Evidência — 245

## T1.1 — fonte do pacote × tarball 0.7.0

- Repositório de pacotes: `origin/main` = `15e0a029c5aba85346ab5c6225bbe6a9081886ae`. O checkout principal
  (branch `feat/whatsapp-preview-de-link`, árvore suja de outra sessão) **não foi usado**; a Fase 1 roda
  em `git worktree add` a partir de `origin/main`.
- Resultado: fonte do módulo em `origin/main` == tarball `0.7.0` — 37/37 arquivos do sourcemap, 11/11
  migrations, 73/73 exports. Sem divergência.
- Desvio fora do módulo (não bloqueia): o #125 (`15e0a02`) mudou
  `meta-whatsapp-contracts/src/providers.ts` (`SendTextOptions`) sem changeset; os contratos em
  `origin/main` estão à frente do `0.6.0` publicado; o módulo não os usa.
- Parecer do `architect` (opus) aprovado; 14 correções aplicadas a `spec.md`, `plan.md` e `tasks.md`.

## Fase 1 — pacote (worktree `adatechnology-packages-wt/s245-redact-location`, branch `feat/meta-whatsapp-redact-inbound-location`, PR rascunho #126)

Postgres 18.4 nativo descartável (porta 58245, derrubado ao fim); `DRIZZLE_TEST_DATABASE_URL` definida em
toda execução citada abaixo. `pnpm install --frozen-lockfile` e `pnpm run build:all` antes dos testes.

### T1.2 — vermelho (`f48262b`)

`ReceiveWebhook.locationRedaction.test.ts` + `createMetaWhatsAppModule.redactInboundLocation.integration.test.ts`
(com a constante `inboundLocation.constant.ts` já criada, para o vermelho ser de comportamento):

```text
(fail) createMetaWhatsAppModule - features.redactInboundLocation > ligada: a linha gravada nao tem a coordenada nem o rotulo
(fail) redactInboundLocation ligada > grava a linha sem payload.location e sem o rotulo, mantendo type location
(fail) redactInboundLocation ligada > so location sai: outra chave do payload fica
(fail) extractContent > com isLocationRedacted devolve a constante, sem rotulo
 5 pass
 4 fail
```

Antes disso, o primeiro vermelho foi `Cannot find module '../inboundLocation.constant'`.

### T1.3 — opção e ligação (`cdfd44d`)

Verde: `12 pass / 0 fail` (3 arquivos: locationRedaction, location existente, ligação).

| Mutação                                                  | Resultado                               |
| -------------------------------------------------------- | --------------------------------------- |
| caso de uso ignora a opção (`isLocationRedacted: false`) | 3 fail (ligada x2, ligação), 9 pass     |
| fábrica ignora a opção (`redactInboundLocation: false`)  | 1 fail (só o teste de ligação), 11 pass |
| restaurado                                               | 12 pass / 0 fail                        |

### T1.4 — integração antes (`f943432`), caso de uso depois (`ff12a47`)

Vermelho: `Cannot find module '../use-cases/RedactInboundLocations.use-case'`. Primeira versão do SQL
(`UPDATE ... WHERE id IN (subconsulta LIMIT FOR UPDATE)`) falhou: `lote de 1` redigiu 2 (o planejador
reexecuta a subconsulta); trocada pela CTE (`$with` do drizzle + `UPDATE ... FROM batch`), como no parecer.

**A integração RODOU**: `8 pass / 0 fail / 26 expect() calls`, sem skip (suíte inteira do módulo com
`DATABASE_URL`: `212 pass / 0 fail`; sem banco: `193 pass / 27 skip`, que é o que se evita aceitar).

| Mutação                                 | Resultado                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| sem `created_at <`                      | 2 fail                                                                                                                            |
| `payload - 'location'` trocado por NULL | 1 fail (`referredProduct` some)                                                                                                   |
| sem `NULLIF`                            | 2 fail (`payload` vira `{}`)                                                                                                      |
| sem `direction`                         | 2 fail (a saída cai)                                                                                                              |
| sem `company_id` nos dois lugares       | 3 fail (B cai)                                                                                                                    |
| sem `company_id` só na subconsulta      | 0 fail: **mutante equivalente**, o `company_id` repetido fora da subconsulta barra B (defesa em profundidade prevista no parecer) |

### T1.5 — changeset e gates (`060085c`)

`.changeset/meta-whatsapp-redact-inbound-location.md` (`minor`, só o módulo). Gates (comandos da CI):
`pnpm run build:all` exit 0; typecheck da CI (`-r --if-present run check` com os três filtros) sem erro;
`pnpm -F @adatechnology/meta-whatsapp-module test`: com `DATABASE_URL` `212 pass / 0 fail`, sem
`193 pass / 27 skip / 0 fail`; eslint dos arquivos tocados limpo (o único aviso do módulo,
`src/testing/mediaSamples.ts`, é anterior). Branch publicada; PR rascunho
https://github.com/Andersonfrfilho/adatechnology-packages/pull/126 (não mesclado). **Não publicado no npm.**

Divergências do parecer: (1) o SQL usa o construtor do drizzle (`$with`/`update().from()`), não SQL cru,
porque o módulo é agnóstico de driver; (2) a constante vive em `src/inboundLocation.constant.ts`;
(3) o teste de ligação ficou na integração (precisa do banco), não no unitário.

## Fase 2 — API e painel (worktree `jolly-golick-d05902`, sem push)

Banco: Postgres 65432 (`pg_isready` aceitando conexões). Outras sessões rodavam suítes na mesma máquina
(`angry-hamilton-090c30`); cada suíte usa banco descartável próprio.

### T2.1 — bump (`988f1de4a`)

`@adatechnology/meta-whatsapp-module` `0.7.0` → `0.8.0` e `@adatechnology/meta-whatsapp-provider` `0.3.1` → `0.4.0`
na API **e no worker** (o worker também pinava o provider `0.3.1`; sem subir ficariam duas cópias). Contratos
seguem `0.6.0`. `npm view @adatechnology/meta-whatsapp-module@0.8.0 dependencies`: meta-graph-core `0.3.0`,
provider `0.4.0`, contracts `0.6.0`. `bun install --frozen-lockfile`: `Checked 788 installs ... (no changes)`.
`dist/migrations/` do módulo instalado: 11 pastas (as mesmas). `bun run db:test` (com
`DRIZZLE_TEST_DATABASE_URL`, que ativa o contrato `meta-whatsapp-migration.contract.test.ts`): `125 pass / 0 fail`.
`bun run db:generate --name x`: `{"status":"no_changes","dialect":"postgresql"}`. Sem migration.

### T2.3 — integração vermelha antes (`612a39182`) e T2.2 — opção ligada (`27935b555`)

Fixture do webhook com `location` completa (`name`, `address`, `url`); a consulta filtra por `company_id`,
`direction = 'inbound'`, `type = 'location'` e afirma `content = INBOUND_LOCATION_CONTENT`,
`payload IS NULL OR NOT (payload ? 'location')` e `jsonb_typeof(payload) IS DISTINCT FROM 'string'`; o `captured`
com a coordenada do toque seguinte segue afirmado no mesmo teste.

Vermelho (módulo `0.8.0`, resolver sem a opção): `content` recebido `"📍 Localização: Casa do Cliente"` e
`has_no_location` `false` — `3 pass / 1 fail`. Contrato `test/whatsapp/meta-whatsapp-module-features.contract.ts`
(texto-fonte, escopo da chamada `createMetaWhatsAppModule({...})`) também vermelho antes do código.
Verde com a opção: contrato `50 pass / 0 fail`, integração `4 pass / 0 fail`.

| Mutação no resolver                      | Contrato (`whatsapp.contract.test.ts`) | Integração do motorista |
| ---------------------------------------- | -------------------------------------- | ----------------------- |
| `redactInboundLocation: true` → `false`  | 2 fail                                 | 1 fail                  |
| linha `features: {...}` removida         | 2 fail                                 | 1 fail                  |
| restaurado (regravado a partir da cópia) | 50 pass / 0 fail                       | 4 pass / 0 fail         |

### T2.4 — painel (`78011f527`)

Chave `whatsapp` do painel de retenção está em `trip.locale.json:1083` / `trip.en.locale.json:1083` (a spec dizia
`:1081`). Texto novo em pt-BR e en; `test/trip-hooks/location-retention-panel.contract.ts` troca a asserção do
texto antigo (vermelho antes: `Expected to contain: "A localização enviada pelo WhatsApp não fica..."`) e passa a
afirmar a ausência de "regra própria". `bun run test:hooks`: `582 pass / 0 fail`. Nenhum smoke ou PNG da 239
contém o texto (grep em `test/`, `scripts/`, `src/`); nada regerado. As menções em `specs/239-*` são histórico.

### T2.5 — documentação (`4903ed25f`)

`apps/api-transportada/CLAUDE.md` § WhatsApp, `docs/ai-context/api-transportada.md` (seção "Spec 245"),
`docs/SECURITY.md` (achado do transcript: redigido na origem para o que chegar **depois do deploy**; legado
**não** redigido) e ADR-0081 emenda 7.2 (2026-10-06). Prettier sem alteração.

### T2.4 — script do legado (não executado contra nenhum banco real)

`apps/api-transportada/scripts/whatsapp-location-redact.ts` (molde `whatsapp-flow-publish.ts`); a lógica está em
`src/whatsapp/application/whatsapp-location-redact.service.ts` (argumentos validados por Zod, laço de lotes de 500,
log só com `companyId` e contagens). Config por `parseEnvironment` + `createDatabaseProvider` (mesmo caminho do
`main.ts`), `MessageRepository` e os dois casos de uso do pacote `0.8.0`; `finally` fecha o pool com teto de 5 s.
Comando (para a T3.3, **por ambiente e por empresa, só com aprovação**):

```bash
bun run scripts/whatsapp-location-redact.ts --company <uuid> [--received-before <ISO>]            # só conta
bun run scripts/whatsapp-location-redact.ts --company <uuid> [--received-before <ISO>] --confirm # redige
```

Contrato `test/whatsapp/location-redact-script.contract.ts` e integração
`test/integration/whatsapp-location-redact.integration.ts` (Postgres descartável com as migrations do pacote).
Mutações (cada uma reprovou e foi restaurada): dry-run escrevendo (3 falhas), `companyId` trocado no `redact`
(2), corte `receivedBefore` ignorado (2), log com o resultado da contagem espalhado (1). `unreachable` é
contado e não é tocado. Nota: o filtro de empresa vive no SQL do pacote; a mutação cobre o que o script passa.

### Gates

- `bun install --frozen-lockfile`: `Checked 788 installs across 921 packages (no changes)`.
- `bun run format:check`: `All matched files use Prettier code style!`; `bun run lint`: exit 0;
  `bun run typecheck`: exit 0 (sete apps); `bun run build`: exit 0.
- `bun run test` (raiz): API `9710 pass / 34 skip / 0 fail` (os skips são os contratos que exigem banco, cobertos
  abaixo); demais apps `0 fail`.
- API, contrato: `bun --env-file=../../.env.test test --timeout 120000`: `9719 pass / 25 skip / 0 fail`.
- API, integração dos arquivos tocados: `bun --env-file=../../.env.test test --timeout 120000
./test/integration/whatsapp-*.integration.ts`: `53 pass / 0 fail` (11 arquivos).
- API, integração completa (`bun --env-file=../../.env.test run test:integration`, saída em arquivo):
  `986 pass / 8 skip / 0 fail`, `Ran 994 tests across 169 files [1707.45s]` (os 8 skips não foram
  classificados um a um: são `testWithPostgres`/guards de ambiente de outras specs; os 11 arquivos `whatsapp-*`
  rodaram sem pular, `53 pass`).
