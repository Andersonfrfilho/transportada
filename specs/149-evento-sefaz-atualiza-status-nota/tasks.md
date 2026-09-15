# Spec 149 — Tarefas

| fase | tasks | modelo recomendado | fallback se der 429 |
| ---- | ----- | ------------------ | ------------------- |
| 1    | T1 🧠 | `opus`             | `fable`             |
| 2    | T2    | `sonnet`           | `opus`              |
| 2    | T3 🧠 | `opus`             | `fable`             |
| 3    | T4    | `sonnet`           | `opus`              |
| 3    | T5    | `sonnet`           | `opus`              |
| 4    | T6 🧠 | `opus`             | `fable`             |
| 5    | T7    | `haiku`            | `sonnet`            |

A fase H (histórico, D13–D20) roda **entre a Fase 1 e a Fase 2**: a migration H1 cria as colunas que a
T3 grava.

| fase | tasks | modelo recomendado | fallback se der 429 |
| ---- | ----- | ------------------ | ------------------- |
| H    | H1 🧠 | `opus`             | `fable`             |
| H    | H2    | `sonnet`           | `opus`              |
| H    | H3    | `sonnet`           | `opus`              |
| H    | H4    | `sonnet`           | `opus`              |

Ordem de execução: T1 → H1 → T2 → H1b → T3 (grava também `status_code`, protocolo, origem, ator,
solicitante e snapshot — `t3-parecer-architect.md` A5/A6) → H2' → H3 → H4 → T4 → T5 → T6 → T7.

## Fase 1 — Fiscal gate

> 🤖 Modelo: `opus` 🧠

- [ ] T1 🧠 — Conferir no pacote instalado (`@adatechnology/fiscal-provider@0.3.0-rc.7`, `dist/` e fixtures
      do próprio pacote) que `importarNfeXml` sobre `procEventoNFe` preenche `event.type` com o `tpEvento`
      (`110111`, `110112`, `110110`…) e `event.statusCode` com o `cStat` do `retEvento`, e que o `DfeItem` do
      `resNFe` traz `situacao`. Registrar em `evidence.md` os valores reais de um XML de cancelamento e de uma
      CC-e dos fixtures do worker (`apps/worker-transportada/test/fixtures/`). **Se `statusCode` não vier,
      parar e levar ao usuário** (D2 não se sustenta sem ele). Conferir também se `NfeXmlEvent` expõe
      o protocolo (`protocol`) e o texto da CC-e (`xCorrecao`); se o texto não vier, **parar e perguntar**
      antes de mudar e publicar o pacote (D18) — a aplicação não parseia o XML por conta própria.

## Fase H — Histórico de eventos fiscais da nota

> 🤖 Modelo: `sonnet` (H1 é 🧠 — `opus`, migration crítica, validada por `architect` `opus` antes)

- [x] H1 🧠 — Migration aditiva `nfe_event_history` (plan § "Migration"): nove colunas nullable em
      `nfe_events` com CHECKs de domínio e de coerência origem/ator, FK composta para `nfe_imports`, e a
      tabela `nfe_document_status_changes` com índice e FKs compostas. Schema da API e **cópia no worker**
      atualizados. Contrato de schema vermelho antes (CHECK recusa `manual` sem ator, `automatic` com
      ator, status fora do domínio); `make migration-test` aplica e reverte; `rollback.sql` ao lado.
- [x] H1b — Migration `20260915025926_nfe_document_protocol_presence` (achada na T3, decisão do
      usuário): `nfe_documents_authorization_protocol_presence_check` passa a exigir protocolo só da
      nota `authorized`, para a `unsigned` poder ser cancelada ou denegada (D4). Rollback falha se já
      houver `cancelled`/`denied` sem protocolo — roll-forward.
- [x] H2' — Reduzida pelo A7 do `t3-parecer-architect.md` (origem, ator, solicitante, `status_code`,
      `protocol`, snapshot e `nfe_document_status_changes` foram para a T3). Resta, em commit isolado
      depois da T3: (1) subir `@adatechnology/fiscal-provider` de `0.3.0-rc.7` para `0.3.1` no worker,
      com lockfile e `--frozen-lockfile`, alinhando API e cron se fixarem a mesma versão; (2) em
      `writeEventWithStatus`, gravar `correctionText` só em `110110`, cortado em 1000 caracteres;
      (3) inverter o teste de lacuna da T1 (`nfe-event-fields.contract.ts`); (4) integração: a CC-e
      grava o texto e o texto não aparece em nenhum log.
- [ ] H3 — API `GET /v1/nfe-documents/:id/events` (D19): contrato de rota vermelho antes para H9, H10,
      H12, H13 (404 entre empresas; "usuário removido" com `actor: null`) e H14 (cursor, `limit` teto 100,
      400 no excesso), e para a **ausência** de `xmlObjectId`/chave de storage/XML na resposta. Depois
      use case, repositório, schema Zod e rota com `nfe.read`; OpenAPI gerado inclui a rota (teste de
      presença). Integração com `--env-file=../../.env.test`.
- [ ] H4 — Tela: drawer "Histórico fiscal" na linha da `NfeDocumentTable` (D20). Contrato de tela
      vermelho antes: entradas na ordem, tipo em pt-BR, status anterior→novo com texto (não só cor),
      origem manual/automática com ator/solicitante, "Sistema (distribuição agendada)", "usuário
      removido", "origem desconhecida", texto da CC-e, estado vazio e de erro, "carregar mais", `Esc`
      fecha e o foco volta à linha. Textos no locale.

## Fase 2 — Worker: política e escrita

> 🤖 Modelo: `sonnet` (T3 é 🧠 — `opus`, desenho validado por `architect` `opus` antes)

- [x] T2 — Contrato vermelho e depois a política pura `nfe-document-status-transition.policy.ts` +
      `nfe-document-status.constant.ts` (D1–D4). Teste de tabela: todos os tipos × `cStat` (com e sem
      `statusCode`), `situacao` 1/2/3, todas as origens × destinos; `cancelled`/`denied` terminais.
      Arquivo novo na lista de testes do `package.json` do worker.
- [x] T3 🧠 — Escopo do `t3-parecer-architect.md` (A1–A6). Integração vermelha (Postgres real,
      `.env.test`) para H1–H7 nos **dois** trilhos (importação de XML e distribuição): origem, ator e
      solicitante coerentes nos três casos da D14, evento antes da nota, reprocessamento, evento
      legado, CC-e/manifestação/`cStat` fora do conjunto, negativo entre empresas e isolamento do lock
      (H5), resumo (H6), corrida determinística nas duas ordens mais 20 rodadas em `Promise.all` (H7).
      Depois: A1 (resumo com situação passa pelo adapter); `resolveNfeEventOrigin` e a cópia de
      `SYSTEM_DISTRIBUTION_ACTOR_USER_ID`; `drizzle-nfe-document-status.persistence.ts` (lock com
      namespace, `applyStatusChange` com `clock_timestamp()`, `recordStatusChange`,
      `findPendingStatusFromEvents`); `nfe-document-status-write.persistence.ts` (ordem do A5); fiação
      nos dois repositórios com `logger` injetado e log depois do commit. Grava `status_code`,
      `protocol`, origem, ator, solicitante e snapshot. `updated_at` só muda quando `changed: true`.

## Fase 3 — Uso da nota: CT-e, API e tela

> 🤖 Modelo: `sonnet`

- [ ] T4 — Contrato vermelho: emissão de CT-e com nota cancelada depois da seleção falha o item com
      `CTE_BATCH_DOCUMENT_NOT_AUTHORIZED`, não-retentável, **sem** chamar o gateway fiscal fake (H8).
      Depois a releitura de `nfe_documents.status` em `cte-issuance-consumer.effect.ts` (ou onde o item é
      montado), filtrando por `company_id`.
- [ ] T5 — API: contrato de `GET /nfe-documents` (nota cancelada sobe ao topo — H1) e das respostas de
      lote/CT-e e viagem expondo o status da nota (reaproveitar `cte-batch-selection.query.ts:215` e
      `drizzle-trip.repository.ts:694`), com contrato negativo de tenant. Tela: aviso "NF-e cancelada após
      a emissão" no CT-e autorizado e na nota da viagem; textos no `*.locale.json`; contrato de tela.

## Fase 4 — Backfill (parada obrigatória)

> 🤖 Modelo: `opus` 🧠

- [ ] T6 🧠 — **Antes de escrever código, perguntar ao usuário** se quer o backfill e por qual fonte:
      (a) só eventos gravados depois do deploy (têm `status_code`) ou (b) reler o XML dos eventos
      antigos no storage para obter o `cStat`. Medir no banco de staging quantas notas `authorized` têm
      evento 110111/110112 em `nfe_events` (consulta só de leitura) e levar o número. Se aprovado: rotina
      one-shot idempotente, por empresa, que usa `applyStatusChange`; teste de integração; roda só com
      aprovação humana por ambiente.

## Fase 5 — Documentação

> 🤖 Modelo: `haiku`

- [ ] T7 — Atualizar `docs/spec/fiscal-integration.md` (seção "Eventos que mudam a situação da NF-e"),
      `apps/worker-transportada/CLAUDE.md` (invariante: status da nota só muda pela política, com lock por
      chave, nunca rebaixa), `docs/ai-context/worker-transportada.md` e `docs/ai-context/api-transportada.md`.
      Registrar os follow-ups (CC-e aplicada/visível, alerta ativo, MDF-e/fatura sobre nota cancelada) em
      `evidence.md`. Fechar `evidence.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/149-evento-sefaz-atualiza-status-nota/ (leia spec.md,
plan.md e tasks.md antes de começar; leia também CLAUDE.md, AGENTS.md, apps/worker-transportada/CLAUDE.md
e docs/spec/fiscal-integration.md). Trabalhe num worktree próprio (make worktree NAME=spec-149 ou a branch
work/ordem-notas), sem push e sem git stash. Uma task por vez, na ordem do tasks.md, contrato vermelho
antes do código. Ordem: T1 → H1 → T2 → T3 → H2 → H3 → H4 → T4 → T5 → T6 → T7.
Modelos: T1 🧠 → executor model=opus · H1 🧠 → executor model=opus (migration validada antes por architect
model=opus) · T2 → executor model=sonnet · T3 🧠 → executor model=opus (desenho do lock e da propagação
validado antes por architect model=opus) · H2, H3, H4 → executor model=sonnet · T4, T5 → executor model=sonnet ·
T6 🧠 → opus, só depois da resposta do usuário · T7 → writer model=haiku · revisão final → code-reviewer
model=opus + security-reviewer (tenant). Se o modelo der 429, siga o fallback da tabela do tasks.md.
Regras que não se negociam: só 110111/110112 com cStat 135/136/155 cancelam; resumo cSitNFe 2 cancela e 3
denega só a partir de unsigned; cancelled e denied nunca saem; updated_at só muda quando o status muda;
CC-e não toca a nota; toda escrita filtra por company_id e toma pg_advisory_xact_lock por (empresa, chave);
nada fiscal é cancelado automaticamente; nunca logar XML.
Histórico: origem manual/automática derivada de nfe_imports (source + requested_by_user_id vs
SYSTEM_DISTRIBUTION_ACTOR_USER_ID), só ids gravados e nome resolvido na leitura pela membership da
mesma empresa; snapshot anterior/novo gravado, nunca recalculado; evento antigo = "origem
desconhecida"; endpoint sem XML nem chave de storage, 404 entre empresas; nome e texto de CC-e nunca
em log.
Cada task fecha com typecheck (bun run typecheck) + lint + testes da app alterada (integração da API e do
worker com --env-file=../../.env.test; pular não é passar; teste novo entra na lista do package.json) +
commit isolado, evidência em specs/149-evento-sefaz-atualiza-status-nota/evidence.md.
Pare e pergunte antes de: push, deploy, aplicar a migration H1 fora do Postgres local/descartável,
qualquer outra migration, rodar o backfill (T6) em qualquer ambiente, mudar ou publicar o pacote
fiscal, e se a T1 mostrar que o pacote não entrega statusCode ou o texto da CC-e no evento.
```
