# Tasks — 273 A ocorrência tem dono

> Cada task responde: **Mecânica?** · **Aceite por comando?** Duas "sim" → `haiku`. Gate de toda task:
> `bun run typecheck` + lint por app (cwd na app) + script `test` do `package.json` da app (nunca `bun test` cru) +
> commit isolado (`git commit --only`). Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Teste novo entra no agregador e na lista explícita do `package.json`. Task que toca `test/integration/**` fecha com
> `bun --env-file=../../.env.test run test:integration` (de `apps/api-transportada`) **sem skip**. Migration: aplica,
> reverte, reaplica e `db:generate` → `no_changes`.
> Worktree: `~/personal/transportada-wt/spec-273` (FS do Linux, branch `work/spec-273`). Nada fora dela.

## Fase 0 — Contrato

> 🤖 Modelo: `sonnet` (T0.2 é 🧠)

- [x] **T0.1** `sonnet` — Conferir contra o código: todos os caminhos que registram ocorrência (motorista, painel,
      parada, outros); a tabela/forma dos eventos da linha do tempo da ocorrência; o nome da coluna de estado
      (aberta/resolvida); versão do Postgres (FK `SET NULL (col)`); permissão de `…/occurrence-watchers/candidates`;
      como o sino é emitido hoje (outbox/chave de notificação) para reusar; onde a lista de ocorrências do painel filtra.
      Medir em staging (só contagem): ocorrências abertas, linhas nas três listas. Divergência vira nota no `evidence.md`.
- [x] **T0.2** 🧠 `opus` — Escrever a ADR-0109 e validar com `architect` o `plan.md` (dados, precedência, RF8, FK,
      avisos com reserva). Ajuste aprovado entra no `plan.md`. **Outras tasks herdam este contrato.**

## Fase 1 — Painel tolerante (vai a produção antes da API)

> 🤖 Modelo: `haiku`

- [ ] **T1.1** `haiku` — Teste antes: guardas de resposta aceitam `owner` (objeto ou `null`) na ocorrência, `isPrimary`
      nas linhas de responsáveis, `contractorMailPrimaryWatcherUserId` no tipo e os eventos `owner.assigned`/`owner.transferred`/`owner.cleared` na linha do tempo
      (renderiza como evento genérico). Depois, a tolerância.
- [ ] **T1.2** `sonnet` — Publicar a Fase 1 (PR → `staging` → `main`) **com aprovação humana**. Registrar commit.

## Fase 2 — API

> 🤖 Modelo: `sonnet` (T2.2 → `haiku`)

- [ ] **T2.1** `sonnet` — Migration A + schema Drizzle + `rollback.sql`.
- [ ] **T2.2** `haiku` — Teste antes (tabela de casos dos critérios 1–5) da `occurrence-owner.policy.ts`; depois a política.
- [ ] **T2.2b** `sonnet` — Elegibilidade espelhada, lado API (plan § Elegibilidade espelhada, D-f): teste antes com a
      fixture de casos E01–E27 em forma de fatos (`test/fixtures/occurrence-owner-eligibility.cases.ts`), exaustividade
      nos dois sentidos sobre `COMPANY_ROLE_PERMISSIONS` e `isGrantablePermission`, e integração
      `test/integration/occurrence-owner-eligibility.integration.ts` semeada pela fábrica (na lista do `package.json`,
      `--env-file`, zero skip); depois `occurrence-owner-eligibility.policy.ts` e `findOccurrenceWatcherUsers` usando-a
      e filtrando empresa `active`.
- [ ] **T2.3** `sonnet` — Estrela nas listas da empresa e da contratante: rotas `PUT/DELETE …/primary`, leitura com
      `isPrimary`, limpar estrela ao inativar/remover, `audit_logs`. Contratos (incluindo BOLA 404) antes.
- [ ] **T2.4** `sonnet` — Estrela no tipo: `contractorMailPrimaryWatcherUserId` no salvamento do tipo (contido na lista →
      senão 400), leitura, auditoria.
- [ ] **T2.5** `sonnet` — Dono no registro: `assign-occurrence-owner.service.ts` em todos os caminhos da T0.1, na
      transação. Integração: critérios 1–5 no banco.
- [ ] **T2.6** `sonnet` — Assumir/passar: `PUT /trip-occurrences/:id/owner`, evento `owner.transferred`, `audit_logs`, sino a quem
      recebeu. Contratos: 404 outra empresa e inelegível (spec RF4); 409 cancelada.
- [ ] **T2.7** `sonnet` — Leitura: `owner` na lista e no detalhe (com `isEligible`), filtro `owner=me|none|all`.
- [ ] **T2.8** `sonnet` — Reabertura avisa o dono (reserva: último que resolveu).
- [ ] **T2.10** `sonnet` — E-mail em nome do dono (RF7, RF8, critério 10): implementar a porta `OccurrenceOwnerReader`
      da 272 (dono elegível `{ userId, name, jobTitle }`) e o dono no `Cc` antes do corte em `resolve-mail-copy.service.ts`.
      **Depende da 272 em `staging`** (rebase sobre ela); "De" e assinatura não mudam aqui.
- [ ] **T2.9** `haiku` — Documentação viva: OpenAPI das rotas novas, `apps/api-transportada/CLAUDE.md` e
      `docs/ai-context/api-transportada.md`.

## Fase 3 — Worker

> 🤖 Modelo: `sonnet`

- [ ] **T3.0** `sonnet` — Elegibilidade espelhada, lado worker (D-f): fixture idêntica byte a byte à da API, política e
      constantes espelhadas, teste da raiz `test/occurrence-owner-eligibility-mirror.contract.test.ts` (falha se diferir
      ou faltar arquivo) com passo próprio no job `quality` do `ci.yml`, consulta de fatos por SQL cru (subconsultas
      separadas, vazio `'{}'`) e integração `test/integration/occurrence-owner-facts.integration.ts` semeada pela fábrica. Elegível = vínculo ativo **e**
      `occurrences.resolve`, igual à API — nunca "só vínculo".
- [ ] **T3.1** `sonnet` — Resposta da contratante → sino ao dono elegível (chave de notificação nova, registrada onde as
      outras estão).
- [ ] **T3.2** `sonnet` — Alarme de atraso → dono ?? quem despachou.
- ~~**T3.3**~~ — sem trabalho no worker: o envio automático é da API e o "De" é da 272 → movida para **T2.10**.
- [ ] **T3.4** `haiku` — `docs/ai-context/worker-transportada.md`.

## Fase 4 — Painel

> 🤖 Modelo: `sonnet` (T4.4 → `haiku`)

- [ ] **T4.1** `sonnet` — Estrela em `OccurrenceWatcherRow` (empresa e contratante) e em `OccurrenceTypeWatchersSelect`.
- [ ] **T4.2** `sonnet` — Filtro Minhas / Sem dono / Todas e status do dono na lista (D-g): "Atribuída a você" para o
      dono elegível, nome do dono para os demais, "Sem dono"; sem sino no registro.
- [ ] **T4.3** `sonnet` — Bloco "Dono" no detalhe com o mesmo status, origem, Assumir e Passar para…; eventos `owner.*` com texto.
- [ ] **T4.4** `haiku` — Textos em `.locale.json`; smoke do painel.

## Fase 5 — Publicação e verificação

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Revisão: `code-reviewer` e `security-reviewer` (BOLA, PII em log).
- [ ] **T5.2** `sonnet` — Rebase em `origin/staging`, gates completos, `bunx prettier --check .`, numeração de
      spec/ADR/migration conferida, PR → `staging` (autorizado), acompanhar CI e deploy.
- [ ] **T5.3** `sonnet` — Verificar em staging no navegador deste computador (texto, não screenshot): estrela, ocorrência
      nova com dono, assumir/passar, sino, e-mail no Mailpit com o nome do dono. Evidência no `evidence.md`.
- [ ] **T5.4** `sonnet` — Produção **com aprovação humana**, na ordem do plan § Publicação.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/273-a-ocorrencia-tem-dono/ (leia spec.md, plan.md, tasks.md e
evidence.md antes de começar; leia também specs/267-*, 270-*, 271-* e 272-* com os evidence.md, a ADR-0108 e a
ADR-0109). A 272 sai ANTES: a T2.10 só começa com a 272 em origin/staging (rebase sobre ela; a 272 manda nos nomes).
Árvore única: ~/personal/transportada-wt/spec-273 (FS do Linux, branch work/spec-273, criada de origin/staging); nada fora dela.
Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus, validar com architect antes de qualquer código) ·
Fase 1 → executor model=haiku (T1.2 sonnet) · Fase 2 → executor model=sonnet (T2.2/T2.9 haiku; T2.2b e T2.10 sonnet) ·
Fase 3 → executor model=sonnet (T3.0 antes de T3.1/T3.2; T3.3 movida para T2.10; T3.4 haiku) · Fase 4 → executor model=sonnet (T4.4 haiku) · Fase 5 → sonnet ·
revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com bun run typecheck + lint por app (cwd na app) + script `test` do
package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md.
Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Migration: aplica, reverte e reaplica e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates, `bunx prettier --check .`
na raiz; conferir numeração de spec/ADR/migration contra origin/staging. Publicar em staging está autorizado (T5.2).
Pare e pergunte antes de: qualquer merge em main (T1.2, T5.4 — painel tolerante vai a produção ANTES da API); qualquer
mudança de dados que não seja contagem em staging ou produção; e qualquer [NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md): dono escolhido no registro na ordem contratante → tipo → empresa (a cópia segue
tipo → contratante → empresa, sem mudança); um principal por lista (estrela), no tipo a estrela fica na lista "Em
cópia"; lista sem estrela dá o primeiro elegível por nome; elegível = vínculo ativo + occurrences.resolve, a MESMA
regra na API e no worker (D-f: elegibilidade espelhada com tabela de casos E01–E27 idêntica nas duas apps e teste da
raiz; nunca "só vínculo" no worker); dono sempre em cópia; sem backfill; assumir/passar por quem tem
occurrences.resolve, com evento e auditoria; sino ao dono na resposta da contratante, no alarme de atraso e na
reabertura, com o comportamento atual como reserva sem dono; SEM sino no registro — status "Atribuída a você" na lista e
no detalhe (D-g); e-mail automático em nome do dono pela porta OccurrenceOwnerReader e pelo "De" da 272.
```
