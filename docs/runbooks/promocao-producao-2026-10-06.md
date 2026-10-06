# Promoção staging → produção — 2026-10-06

> ⛔ **Aguarda aprovação humana.** Nada aqui foi aplicado em produção. O merge do PR, o deploy e as
> migrations dependem de uma pessoa, na janela descrita abaixo. As leituras de produção (variáveis e
> tamanho das tabelas) **não foram feitas** — o ambiente desta sessão as recusou — e são a primeira
> coisa a fazer antes de marcar o PR como pronto (§ 4).

Decisão do usuário (2026-10-06): promover **tudo** o que está em `staging`, inclusive o trabalho de
outras sessões já verde nos gates de staging.

## 0. ⚠️ Staging andou durante a preparação — decisão pendente

Esta árvore é `staging@54c97d5e5`. Enquanto os gates rodavam, `origin/staging` foi a `81cd849b6`:
**+78 commits**, quase todos da spec 241 (`items_mode` do tipo de ocorrência), com **4 migrations
novas** (`20261004165112_cargo_preview_failure_codes`,
`20261004174001_cargo_preview_security_failure_codes`,
`20261004180153_contractor_receiving_arrival_reference_label`,
`20261006033752_occurrence_type_items_mode`). Eles **não** estão neste PR, de propósito:

- A 241 exige ordem de publicação (ADR-0081 §9, `tasks.md` da 241): **painel tolerante primeiro, com
  o autoUpdate do PWA no ar, e só depois migration + API**. "Nunca a API/banco primeiro." Com a API
  nova e o painel atual de produção, `isTripOccurrence` e `isOccurrenceType` recusam as chaves novas
  e derrubam a lista da nota e o catálogo de tipos. O merge único na `main` sobe a API **antes** do
  painel (§ 6) — exatamente a ordem proibida.
- Depois da etapa 2 há um passo humano (cadastrar "Cliente pediu prorrogação do boleto" com Produtos
  = Desligado) e a T0.3 da 241 (medição em produção) segue pendente.

Caminhos: (1) promover este PR como está e levar a 241 depois, em dois PRs (painel, depois API); ou
(2) refazer a árvore sobre a staging nova, mas aí em dois PRs também (o primeiro só com o painel).
A escolha é humana. Staging nova já contém a tolerância a `emailsContractor`/`stopKind`; no caminho
(2) o hotfix `95f13de1f` deixa de ser diferença.

## 1. Como a árvore foi montada

| Ref                                 | SHA         | O que é                                                         |
| ----------------------------------- | ----------- | --------------------------------------------------------------- |
| `origin/main`                       | `b5a8943ae` | produção hoje (PR #140)                                         |
| `origin/staging`                    | `54c97d5e5` | base do conteúdo                                                |
| `promote/prod-2026-10-06-x` (local) | `7e7af5cad` | `X` = staging + cherry-pick de `95f13de1f`                      |
| `promote/prod-2026-10-06`           | `b64a7db94` | um commit sobre `origin/main` cuja árvore é exatamente a de `X` |

Sem `git merge`: `git restore --source=X --staged --worktree -- :/` sobre `origin/main` e um commit
único. Nenhum arquivo da main ficou de fora de `X` (zero `git rm`). Provas:

- `git diff X promote/prod-2026-10-06` → vazio.
- `git diff origin/staging promote/prod-2026-10-06` → só os 2 arquivos do hotfix `95f13de1f`
  (`tripResponse.validation.ts`, `occurrence-type-tolerance.contract.ts`, +23 linhas).
- `git merge-tree --write-tree origin/main promote/prod-2026-10-06` → sem conflito (o PR é linear).

`origin/main` está 380 commits atrás de staging; a promoção muda 1480 arquivos (o grosso são os oito
`snapshot.json` das migrations novas, ~490 mil linhas).

## 2. Os 53 commits só-da-main (sem contar 11 merges de PR)

`git cherry origin/staging origin/main` dá 37 `-` (patch-id igual em staging) e 16 `+`. Os 16 foram
conferidos por conteúdo: o diff `merge-base(d31b5fe22)..origin/main` de cada arquivo foi testado
hunk a hunk contra staging (`git apply --check -R`) e, onde não casou, lido à mão.

### (a) Já em staging com outro SHA — 37 por patch-id

Spec 224/225 (viagem concluída na lista do motorista, 14 commits: `7809bd9f6`…`5a7add7ff`),
`f61c55e9e` (#129, fila do comprovante), a correção/cancelamento da ocorrência hoje numerada 240
(`e8d0bb399`…`48f102343`, 19 commits), spec 242 (`7b4ea50c0`, `67f76e38f`) e a NFS-e (`0928d989f`,
o mesmo de `54c97d5e5` em staging).

### Os 16 sem patch-id equivalente

| Commit      | Assunto                                                      | Classe | Por quê                                                                                                 |
| ----------- | ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------- |
| `f4319c0e5` | girar a foto do canhoto antes do recorte                     | a      | aplica vazio sobre staging                                                                              |
| `3fdae958a` | cópia legada do painel ganha teto na redução                 | a      | aplica vazio                                                                                            |
| `8c28ca250` | exceção do comprovante pode ser alterada                     | a      | aplica vazio                                                                                            |
| `1e7805633` | painel exige `location`/`locationState` (196 T6.4)           | a      | todos os hunks presentes em staging; o conflito é texto vizinho mais novo                               |
| `933c6a853` | docs 196 T6.4                                                | c      | staging tem a versão mais nova de `tasks.md`/`evidence.md`                                              |
| `b69b93b53` | spec 222                                                     | c      | staging tem a spec 222 com mais tasks fechadas                                                          |
| `d96757058` | promoção #130 (12 commits + smoke)                           | a      | 91 arquivos; todo hunk de código presente; teste de integração da janela já refeito com a fixture comum |
| `827613a92` | ocorrência cancelada se mostra cancelada                     | a      | igual a `6bf382eed` de staging                                                                          |
| `391eb0442` | foco e rótulos do formulário de correção                     | a      | hunks presentes                                                                                         |
| `826a91802` | `TripTimelineEntry` exportada                                | a      | staging já exporta                                                                                      |
| `699c4cfc3` | teste vermelho das leituras de correção                      | a      | arquivo e entrada no `test:integration` presentes (a lista de staging é superconjunto: 168 × 155)       |
| `e7708ea7b` | gates da Fase 0.5 (docs)                                     | c      | staging reescreveu a nota                                                                               |
| `69633f603` | as duas linhas do tempo publicam o cancelamento              | a      | hunks presentes                                                                                         |
| `d61c9c66c` | renumeração 235 → 240                                        | c      | staging tem `specs/240-…` e `specs/235-o-ajudante-e-um-perfil`                                          |
| `09891b76e` | teste do PUT/GET de tipos com política de reentrega (242)    | a      | presente                                                                                                |
| `95f13de1f` | **catálogo de tipos tolera `emailsContractor` e `stopKind`** | **b**  | **ausente em staging** — cherry-pick limpo, é o único hotfix que a promoção carrega a mais              |

Nenhum conflito precisou de fusão manual: o único (b) aplicou limpo; os conflitos que o
`merge-tree` lista (me-trip.routes, find-current-driver-trip, DriverTripWorkspace, ProofImage,
TripTimeline, package.json…) são todos do lado de staging já conter a mudança da main com código
posterior em volta. Notas do que parecia diferença e não era:

- `driverTrip.module.css`: staging mudou de propósito o recuo do campo de busca (botão da câmera
  dentro da caixa) — staging prevalece.
- `renderHook.helper.ts`: staging tem o `afterEach` que desmonta raiz esquecida — superconjunto.
- `docs/ai-context/api-transportada.md`: a frase "pacotes `0.1.0` descartam `messages[].location`"
  foi atualizada em staging para `0.6.0`/`0.7.0`.

⚠️ O hotfix (b) também falta em **staging**: o painel de staging hoje esvazia a aba "Tipos de
ocorrência". Levar `95f13de1f` (ou `7e7af5cad`) para staging é um push separado, fora deste PR.

## 3. Inventário do que entra

Specs novas: 196 (fases restantes), 226, 227, 228, 229, 230, 231, 232, 233, 234, 235 (ajudante é um
perfil), 236, 237 (recebimento e prévia da carga), 238, 239 (expurgo na tela), 241, 243, 244 — e
avanços de 193, 222, 224, 225, 240, 242, 245. ADRs 0093, 0094, 0095. Pacotes
`@adatechnology/meta-whatsapp-*`: contracts `0.1.0 → 0.6.0`, module `0.1.0 → 0.7.0`, provider
`0.1.0 → 0.3.1` (API e worker).

**Nenhum schema de ambiente mudou** entre main e a promoção (`environment.schema.ts` de API, worker e
cron; `environment.config.ts` do driver e do client; `identityEnvironment.config.ts` do painel;
`.env.example`; `.railway/railway.ts` — diff vazio nos sete). Não há variável nova obrigatória no
boot, nem variável removida. `TRIP_LOCATION_PURGE_ENABLED` não existe no schema da main nem no da
promoção (worker `CLAUDE.md`: o interruptor é a linha da empresa em
`company_location_retention_settings`).

## 4. Pré-condições (antes de tirar o PR do rascunho)

Leituras de produção **não feitas nesta sessão** (o classificador do ambiente recusou a leitura de
variáveis do Railway production; por ser a mesma categoria, as consultas ao banco também não foram
tentadas). Quem aprovar roda, só leitura, e anota o resultado no PR:

1. **Gate A** — a chave `TRIP_LOCATION_PURGE_ENABLED` no worker de produção (só o nome):
   `railway variables --service worker --environment production --kv | cut -d= -f1 | grep -x TRIP_LOCATION_PURGE_ENABLED`.
   Em 2026-10-03 ela estava ausente (evidence da 239, T4.6). Se aparecer, não faz efeito (o schema a
   ignora), mas registre e apague depois.
2. **Variáveis do painel/driver** — os nomes `VITE_MAP_TILES_URL`, `VITE_DRIVER_APP_URL`,
   `VITE_CLIENT_APP_URL` no `transportada-frontend` de produção. São `preserve()` em
   `.railway/railway.ts` (valor só no painel). Nenhuma é nova nesta promoção; conferir só que o
   valor de produção não aponta para domínio de staging.
3. **Banco** — o serviço do banco de aplicação de produção **não se chama mais `Postgres-Hqfu`**:
   `railway ssh … -s Postgres-Hqfu` respondeu `Service 'Postgres-Hqfu' not found`. A lista de
   serviços do projeto tem `postgres-app` e `Postgres`. Confirmar pelo host do `DATABASE_URL` da
   `api` de produção qual dos dois é (memória do projeto: o "Postgres" já deu número falso uma vez) e
   corrigir `docs/runbooks/nfe-distribution.md` e `docs/spec/railway.md`.
4. **Medições, só SELECT, no banco certo** (os SQL com `/**/` no lugar de espaço, como em
   `nfe-distribution.md` §3.2):
   - migrations aplicadas: `select name from drizzle.__drizzle_migrations order by id` — esperado:
     264 aplicadas; as 8 da § 5 ausentes (o repo tem 272 pastas). Se faltar alguma **anterior** a
     `20261002153258`, ela entra no mesmo lote — recalcular a janela.
   - tamanho: `pg_total_relation_size` e `reltuples` de `trip_stop_events`, `trip_status_events`,
     `trip_stop_occurrences`, `trip_document_occurrences`, `trip_delivery_proofs`,
     `meta_whatsapp.messages`, **e também** `nfe_participants`, `fleet_drivers`,
     `membership_roles`, `company_group_roles`, `user_invitation_roles`.
   - `meta_whatsapp`: `select name from meta_whatsapp.<tabela de controle>` (ver
     `meta-whatsapp-migration.service.ts`) — quais das migrations 0004–0010 do pacote faltam.
   - antes de cada tentativa: `select count(*) from pg_stat_activity where state <> 'idle' and xact_start < now() - interval '30 seconds'` = 0.
5. **Gate B** — não ligar o expurgo em nenhuma empresa antes de o deploy do worker estar verde.

## 5. Migrations, na ordem, e o lock real

O `preDeploy` da API (`pre-deploy.service.ts`) roda `migrate()` do drizzle `1.0.0-rc.4`, que aplica
**todas as pastas pendentes numa transação só** (`pg-core/async/session.js:166`). Consequência: todo
lock tomado por qualquer pasta fica preso **até o COMMIT do lote inteiro**, e o
`VALIDATE CONSTRAINT` que o plano da 196 descreve como SHARE UPDATE EXCLUSIVE roda, na prática, sob o
ACCESS EXCLUSIVE que o `ADD COLUMN` da mesma transação já pegou.

| #   | Pasta                                               | Tabelas existentes travadas                                                                               | Lock                                                                                         | Varre                                                              |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `20261002153258_occurrence_location_stamp`          | `trip_status_events`, `trip_stop_occurrences`, `trip_document_occurrences`                                | ACCESS EXCLUSIVE (ADD COLUMN), **sem `lock_timeout`**                                        | 8 VALIDATE + 1 CREATE INDEX parcial por tabela                     |
| 2   | `20261002213734_delivered_moment_clock`             | `trip_delivery_proofs`, `trip_stop_events`                                                                | ACCESS EXCLUSIVE (ADD COLUMN), sem `lock_timeout`                                            | CREATE INDEX em `trip_stop_events`                                 |
| 3   | `20261002230234_helper_role_and_can_drive`          | `fleet_drivers`, `company_group_roles`, `membership_roles`, `user_invitation_roles`                       | ACCESS EXCLUSIVE, sem `lock_timeout`                                                         | VALIDATE em `fleet_drivers`; troca de CHECK nas 3 de papel (varre) |
| 4   | `20261003010806_event_location_whatsapp_coordinate` | as 3 da #1 (já presas)                                                                                    | ACCESS EXCLUSIVE, `lock_timeout 3s`                                                          | 3 VALIDATE                                                         |
| 5   | `20261003170340_contractor_receiving_profiles`      | `companies`, `contractors` (FK)                                                                           | SHARE ROW EXCLUSIVE, sem `lock_timeout`                                                      | tabela nova vazia                                                  |
| 6   | `20261003190847_location_retention_settings`        | as 5 tabelas de evento + `companies`                                                                      | SHARE (CREATE INDEX) — as 4 já presas em ACCESS EXCLUSIVE; `lock_timeout 3s`                 | 5 CREATE INDEX parciais                                            |
| 7   | `20261003204733_cargo_arrivals`                     | `nfe_participants` (índice), `companies`, `contractors`, `nfe_documents`, `user_company_memberships` (FK) | SHARE em `nfe_participants` com `lock_timeout 3s`; SHARE ROW EXCLUSIVE nas outras            | CREATE INDEX **cheio** em `nfe_participants`                       |
| 8   | `20261004140624_cargo_previews`                     | `companies`, `contractors`, `nfe_documents`, `user_company_memberships`, `cargo_arrivals` (FK)            | SHARE ROW EXCLUSIVE                                                                          | 7 tabelas novas vazias                                             |
| —   | pacote `meta_whatsapp` (transação própria, depois)  | `meta_whatsapp.messages`, `settings`                                                                      | ACCESS EXCLUSIVE (ALTER TYPE varchar(32) sem reescrita; ADD COLUMN; 2 CREATE INDEX parciais) | 2 CREATE INDEX em `messages`                                       |

Do início da #1 até o COMMIT: **leitura e escrita bloqueadas** nas 5 tabelas de evento, em
`fleet_drivers` e nas 3 de papel; **escrita bloqueada** em `nfe_participants`, `companies`,
`contractors`, `nfe_documents` e `user_company_memberships` (a importação de NF-e e a emissão param).

**Duração do lock — estimativa honesta: não medida.** Sem o tamanho real (§ 4.4), só a ordem de
grandeza: cada `VALIDATE`/`CREATE INDEX` é uma varredura sequencial; 8+1+3+1 varreduras de cada uma
das 3 tabelas de evento, 2 de `trip_stop_events`, 1 cheia de `nfe_participants`. Com tabelas de até
~10⁵ linhas espere segundos; com ~10⁷, minutos. A duração em staging também não foi medida nesta
sessão (o log do pre-deploy de staging a daria). Refazer a conta com o `reltuples` medido antes de
escolher a janela.

**Risco principal — fila atrás do ALTER.** A #1, #2 e #3 não têm `lock_timeout`: se houver uma
transação aberta tocando qualquer tabela de evento, o `ALTER` espera indefinidamente e **toda**
consulta seguinte àquela tabela enfileira atrás dele (o painel e a app do motorista travam, não
erram). Mitigação sem escrita: conferir § 4.4 (transação longa = 0) imediatamente antes do deploy.
Mitigação mais forte, que é **decisão humana** (mudança de configuração de produção): pôr
`options=-c lock_timeout=3s` no `DATABASE_URL` só do pre-deploy, ou `ALTER ROLE … SET lock_timeout`.
Se o lote estourar o tempo, a transação inteira volta — nada fica pela metade, o deploy da API falha
e a versão antiga segue no ar.

### Janela recomendada

Fora do horário de campo: depois das 22h e antes das 5h (sem motorista registrando parada nem
importação de NF-e agendada no `cron` de 5 em 5 minutos — confira o último `job_executions`). Um
operador acompanhando o log do pre-deploy.

## 6. Ordem de deploy

O workflow `deploy.yml` sobe os serviços a partir do mesmo merge na `main`; não há como fazer pushes
separados neste PR. A API é o gargalo declarado (migrations no preDeploy).

1. **API + migrations** (preDeploy). Se falhar, nada mais é deployado com sentido — parar.
2. **Worker.** Rotinas novas: leitura do canhoto (`trip.canhoto.read`), expurgo de localização
   (inerte sem linha de empresa), outbox da prévia de carga.
3. **Painel, driver, client, landing.**

Risco: o painel/driver não esperam o worker. Pior caso descrito pela 239 (Gate B): a tela
"Localização" diz o estado da linha da empresa enquanto o worker antigo ainda roda — não apaga nada.
Por isso o Gate B: ninguém liga o expurgo até o worker novo estar verde.

## 7. Verificação pós-deploy

- `GET /health` da API e do worker = 200.
- `job_executions` do worker na última meia hora sem `42703` (coluna inexistente) nem `42P01`
  (tabela inexistente).
- Rotas novas sem token respondem 401 (e com token sem permissão, 403): prévia de carga, recebimento
  da carga, perfis de recebimento do contratante, retenção de localização, `PATCH …/proof/review/automatic`.
- **Sonda da T4.3 da 196**, com token de motorista **de teste**: `dispatch` e ocorrência de parada com
  `tripId`/`stopId` inexistentes — esperado 404/409/422, **nunca 400 em `location`**.
- Painel: aba "Tipos de ocorrência" lista os tipos (é o hotfix `95f13de1f`); tela "Localização" com o
  expurgo **desligado** por padrão; linha do tempo da viagem abre.
- `drizzle.__drizzle_migrations` com as 8 pastas novas.

## 8. Rollback, por camada

1. **App primeiro**: redeploy da imagem anterior de painel/driver/client, depois worker, depois API
   (Railway → deployments → redeploy do anterior). Todas as migrations são aditivas: a API antiga roda
   sobre o schema novo (colunas anuláveis, tabelas novas que ela ignora).
2. **Schema só se indispensável**, à mão, com a API já revertida, na ordem inversa, pelo `rollback.sql`
   de cada pasta. Os `rollback.sql` recusam quando há dado (coluna com coordenada gravada, tabela nova
   com linha) — as tabelas novas nascem vazias. `can_drive` e o papel `helper`: o rollback falha se já
   houver ajudante cadastrado. Nunca apagar a linha de `__drizzle_migrations` sem o `DROP`
   correspondente.
3. `meta_whatsapp`: rollback em `apps/api-transportada/drizzle-meta-whatsapp/rollback.sql`, só se o
   pacote voltar a `0.1.0`.

## 9. O que fica desligado por padrão em produção

- Expurgo de localização: sem linha em `company_location_retention_settings`, nada é apagado.
- Pedido de localização no grafo de fluxo do WhatsApp: só depois de republicar o fluxo.
- Canhoto lido por máquina: a rotina aprova só código que casa; o resto fica `pending`.

## 10. Gates (branch `promote/prod-2026-10-06`, 2026-10-06)

| Gate                                                      | Resultado                                       |
| --------------------------------------------------------- | ----------------------------------------------- |
| `bun install --frozen-lockfile`                           | 1559 pacotes                                    |
| `bun run format:check`                                    | "All matched files use Prettier code style!"    |
| `bun run lint`                                            | 0 errors, 16 warnings                           |
| `bun run typecheck`                                       | verde nas 7 apps                                |
| `bun run build`                                           | verde nas 5 apps com build                      |
| API `bun run test` (contrato)                             | 9628 pass, 34 skip, 0 fail (198 arquivos)       |
| worker / cron                                             | 1617 / 101 pass, 0 fail                         |
| painel (`frontend-transportada`)                          | 6832 + 489 pass, 0 fail                         |
| client / driver / landing                                 | 89 / 1198 / 131 pass, 0 fail                    |
| `db:generate --name x`                                    | `{"status":"no_changes"}`                       |
| `db:test` (inclui static-migration e cadeia de snapshots) | 124 pass, 0 fail (8 arquivos)                   |
| integração completa (`test:integration`, `.env.test`)     | 975 pass, 1 skip, 0 fail (164 arquivos, 1775 s) |
