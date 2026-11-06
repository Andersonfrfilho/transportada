# Tasks — 298 A nota bipada vem da SEFAZ

Cada task fecha com typecheck + testes da app (script `test` e, quando tocar `test/integration/**`, `test:integration`
com `--env-file=../../.env.test`) + commit isolado + evidência em `evidence.md`.

## Fase 0 — Medir antes

> 🤖 Modelo: `sonnet`

- [ ] T0.1 Script `tmp/ops/producao-consulta-por-chave.sh <chave>` (leitura, 1 consulta `consChNFe` de dentro do
      container do worker, imprime só `cStat`, `xMotivo` e `schema`). **Rodar em produção pede aprovação humana** e a
      chave de uma das notas de 06/11. Evidência: `cStat` registrado. Não bloqueia as fases seguintes.
      Script pronto (`tmp/ops/producao-consulta-por-chave.sh`); rodar em produção: pendente de aprovação.

## Fase 1 — Banco e API

> 🤖 Modelo: `sonnet` (T1.1 → `haiku`)

- [x] T1.1 Migration aditiva (D1, D3, índice único parcial) + schema da API e cópia do worker — `make migration-test`.
- [x] T1.2 Contrato das rotas (RF1, RF2, 404 entre empresas, idempotência, `found`) — antes do código.
- [x] T1.3 Use cases + rotas + outbox + OpenAPI — contratos da T1.2 verdes; `test:integration` da rota.
- [x] T1.4 Verificação em lote `POST /v1/nfe-documents/access-key-checks` (RF11d: ≤200 chaves, só da empresa,
      uma query) — contrato antes, depois rota; `test:integration`.

## Fase 2 — Worker

> 🤖 Modelo: `sonnet`

- [x] T2.1 `[P]` Política pura de desfecho (tabela `cStat`/`DfeItem` → estado e motivo, RF4) — contrato de tabela.
- [x] T2.2 `[P]` Gateway: `consultarPorChave` no gateway e na factory — contrato com dublê.
- [x] T2.3 Orçamento atômico (D3) — integração com duas reservas concorrentes e 656 abrindo 65 min.
- [x] T2.4 Consumidor + repositório (importa `procNFe` pelo escritor comum, RF5, RF6, RF8) + topologia + `main.ts` —
      integração: importa, não duplica com a distribuição.
- [x] T2.5 Reenfileirar `waiting` na rotina existente (D5) — contrato da rotina.

## Fase 3 — Painel

> 🤖 Modelo: `sonnet` (T3.4 → `haiku`)

- [x] T3.0 Leitor de mão (RF11e): extração da chave em qualquer posição do texto (contrato com Code-128, URL de QR
      correta e URL embaralhada por layout ABNT2), foco persistente, Enter/Tab, rajada < 100 ms sem perda — contrato
      no componente do design system (055 D7). Evidência com um leitor real do cliente.
- [x] T3.1 Cliente + hook de polling + componente de linha (RF9, RF10) — contratos dos estados.
- [x] T3.2 Criação da viagem (`useTripQuickCreate`): o bip deixa de acrescentar direto; toda nota bipada vai à lista
      de notas encontradas com "Acrescentar"/"Acrescentar todas"; `notFound` vira busca (RF9) — contrato do critério 4.
- [ ] T3.3 Detalhe da viagem (RF9, RF10) e origem "busca por chave" na página de NF-e (RF12) — contratos.
- [ ] T3.5 Importar por bip na página de NF-e (RF11–RF11c): leitor contínuo, resumo, filtros, sessão do navegador —
      contrato do critério 4a.
- [ ] T3.4 Locales pt-BR/en dos estados e motivos — `typecheck` + teste de chaves de locale.

## Fase 4 — Publicar

> 🤖 Modelo: `sonnet`

- [ ] T4.1 Staging: bipar chave de homologação (recusa `not_found` com XML) e chave cadastrada; evidência por texto
      (`read_page`), sem screenshot intermediário.
- [ ] T4.2 Produção (**aprovação humana**): migration + API → worker → painel (ADR-0081 §9, tolerante primeiro);
      uma chave real importada e vinculada; atualizar `docs/runbooks/producao.md` e o `CLAUDE.md` (§14 do code-standart).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/298-a-nota-bipada-vem-da-sefaz/ (leia spec.md, plan.md, tasks.md e
evidence.md antes de começar). Trabalhe só no worktree ../transportada-wt/spec-298 (branch work/spec-298); antes de
cada fase: git fetch && git rebase origin/staging e confira que o número 298 e a migration não colidiram.
Uma task por vez, na ordem do tasks.md (Fase 3 começa pela T3.0, o leitor de mão). T0.1 só escreve o script.
Comportamento pedido pelo dono (não reinterpretar): na página de NF-e o bip IMPORTA (não é conferência); na criação
da viagem o bip busca e importa sozinho e a nota vai para "Notas encontradas" com "Acrescentar" / "Acrescentar todas
as prontas" — nenhuma nota entra na viagem sem Acrescentar, inclusive as já cadastradas (muda o hook atual, RF9).
Leitor de mão USB/Bluetooth é o caminho principal (RF11e). Protótipo aprovado: https://claude.ai/artifact/Mt4upuJMJwAKnmRuqE98tR
Modelos: Fase 0 → executor model=sonnet · Fase 1 → executor model=sonnet (T1.1 model=haiku) ·
Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet (T3.4 model=haiku) · Fase 4 → executor model=sonnet ·
revisão de cada fase → code-reviewer model=sonnet; segurança da rota e do worker → security-reviewer.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Gates de toda task: bun run typecheck; testes pelo script test da app (nunca bun test cru); na API, contrato
(bun --env-file=../../.env.test test --timeout 120000) e, se tocar test/integration, também
bun --env-file=../../.env.test run test:integration; teste novo entra na lista do package.json; make migration-test
na T1.1; lint por app; commit isolado por task com evidência em evidence.md.
Urgente: ao fim de cada fase pronta, avise e peça para publicar em staging (push para staging faz deploy), na
ordem banco/API → worker → painel.
Pare e pergunte antes de: push para staging, qualquer chamada à SEFAZ de produção (T0.1), deploy ou merge para main/produção (T4.2),
migration destrutiva, qualquer [NEEDS CLARIFICATION], e se a SEFAZ responder algo que a tabela do RF4 não cobre.
Ao terminar: atualizar docs/runbooks/producao.md, CLAUDE.md da raiz e apps/*/CLAUDE.md tocados (§14), e
/oh-my-claudecode:cancel.
```
