# Evidência — spec 246

## Índice

Estado em 2026-10-06, branch `work/spec-239` sobre `origin/staging` `0e31a602b` (107 commits à frente). Tabela **task → commit → onde está a evidência**; os SHAs são os
**atuais** (depois dos rebases), e quando uma seção antiga cita outro hash, ele é o de antes do rebase. Pendentes do usuário: **T1d.0** e **T3.0**.

| task                                                 | commit(s)                                                                                                                                                                                                                                | evidência (seção deste arquivo)                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| spec, plan, tasks, correções do architect e D-a..D-d | `54e9daa7a`, `4f04b2e07`, `67ebc1791`, `1f9eaac86`, `d5d6ffd24`                                                                                                                                                                          | "Correções da spec antes de implementar"                               |
| T1.1 schema                                          | `9fdcf20c2`                                                                                                                                                                                                                              | "T1.1"                                                                 |
| T1.2 migration 🧠                                    | `3dbd7865e`                                                                                                                                                                                                                              | "T1.2"                                                                 |
| T1.3 valor da coluna                                 | `d23abd845`                                                                                                                                                                                                                              | "T1.3"                                                                 |
| T1.4 mutações                                        | `4d699fa1d` (gates `ad6f2779a`)                                                                                                                                                                                                          | "T1.4", "Gates ao fechar a Fase 1"                                     |
| T1b.1b painel tolerante                              | `c3cb65c5f`                                                                                                                                                                                                                              | "T1b.1b (painel)"                                                      |
| T1b.1 tabela e backfill de momentos                  | `482a8cd2f`                                                                                                                                                                                                                              | "T1b.1"                                                                |
| T1b.1b API (derivação, leitura tolerante, `PUT`)     | `5ee5c4102`                                                                                                                                                                                                                              | "T1b.1b (API)"                                                         |
| T1b.2 🧠 momento fixo por caso de uso                | `31e18617e`                                                                                                                                                                                                                              | "T1b.2"                                                                |
| T1b.3 CA00 contra o banco                            | `88062484c`                                                                                                                                                                                                                              | "T1b.3"                                                                |
| T1b.4 CA00b nas linhas                               | `62d3cbb48`                                                                                                                                                                                                                              | "T1b.4"                                                                |
| T1b.5 mutações                                       | `05164673c`                                                                                                                                                                                                                              | "T1b.5"                                                                |
| T1b.6 tipo sem momento recusado                      | `5b788f5c4` (gates `02df1291a`)                                                                                                                                                                                                          | "T1b.6"                                                                |
| T1c.0 pré-condição da 241                            | `d5d6ffd24`                                                                                                                                                                                                                              | "Conferência da pré-condição (T1c.0)"                                  |
| T1c.1 colunas e CHECKs                               | `714fae9a8`                                                                                                                                                                                                                              | "T1c.1"                                                                |
| T1c.2 backfill do mínimo de foto                     | `ca6d208e0`                                                                                                                                                                                                                              | "T1c.2"                                                                |
| T1c.4 painel tolerante                               | `f268acecc`                                                                                                                                                                                                                              | "T1c.4 (painel)"                                                       |
| T1c.3 `allowsMultipleItems`                          | `3880456da`                                                                                                                                                                                                                              | "T1c.3"                                                                |
| T1c.4 API (Produtos obrigatório e mínimos)           | `7ce12752d` (gates `8e9d7df17`)                                                                                                                                                                                                          | "T1c.4 (API)"                                                          |
| **T1d.0** medição em produção                        | — **pendente do usuário**                                                                                                                                                                                                                | "T1d.0"                                                                |
| T1d.1 leitura existente presa                        | `cf8fbb0e5`                                                                                                                                                                                                                              | "T1d.1"                                                                |
| T1d.2 🧠 backfill dos anexos                         | `f59b03f5d`                                                                                                                                                                                                                              | "T1d.2"                                                                |
| T1d.3 backfill nas linhas                            | `69c85a8ce`                                                                                                                                                                                                                              | "T1d.3"                                                                |
| T1d.4 mutações                                       | `58ea3f2ed`                                                                                                                                                                                                                              | "T1d.4"                                                                |
| T1d.5 escrita dupla e mínimo de fotos                | `32287fa91`                                                                                                                                                                                                                              | "T1d.5"                                                                |
| T1d.6 demonstrativo e correção                       | `9bd5922de` (gates `780278f70`)                                                                                                                                                                                                          | "T1d.6"                                                                |
| Fase 2: painel e app tolerantes                      | `24312a31a`, `d01333eab`                                                                                                                                                                                                                 | "Painel e app tolerantes antes da API"                                 |
| T2.1 + T2.2 projeção e verificação                   | `a89bf4345`                                                                                                                                                                                                                              | "T2.1 + T2.2"                                                          |
| T2.3 registro cobra o efetivo                        | `0429b965c`                                                                                                                                                                                                                              | "T2.3"                                                                 |
| T2.3b CA04 no comportamento                          | `be17c2276`                                                                                                                                                                                                                              | "T2.3b"                                                                |
| T2.4 `PUT` e assinatura                              | `c853ac78f`                                                                                                                                                                                                                              | "T2.4"                                                                 |
| T2.4b produtos e mínimos                             | `83eaa3aa7`                                                                                                                                                                                                                              | "T2.4b"                                                                |
| T2.5 assinatura isolada                              | `7d023f044`                                                                                                                                                                                                                              | "T2.5"                                                                 |
| T2.6 WhatsApp                                        | `56e443c34`                                                                                                                                                                                                                              | "T2.6"                                                                 |
| T2.7 lista de anexos                                 | `34cc8b821` (gates `b37805fbc`)                                                                                                                                                                                                          | "T2.7"                                                                 |
| **T3.0** medição staging e produção                  | — **pendente do usuário**                                                                                                                                                                                                                | "Medições pendentes"                                                   |
| T3.1, T3.2 o servidor cobra a exceção                | `a89bf4345`, `0429b965c`, `83eaa3aa7`                                                                                                                                                                                                    | "T3.1 e T3.2"                                                          |
| T3.3 paridade snapshot × registro                    | `ec8b57da1`                                                                                                                                                                                                                              | "T3.3"                                                                 |
| T4.1, T4.1b formulário do motorista                  | `5b5014c17`                                                                                                                                                                                                                              | "T4.1 e T4.1b"                                                         |
| T4.2 assinatura na fila                              | `ece2cb069`                                                                                                                                                                                                                              | "T4.2"                                                                 |
| T4.3 gate offline                                    | `d9556c082`                                                                                                                                                                                                                              | "T4.3"                                                                 |
| T5.1 aba Tipos                                       | `5d410d135`, `dcecf81ad`                                                                                                                                                                                                                 | "T5.3 (1ª metade)", "M8"                                               |
| T5.2 mover o painel                                  | `1b380de0c`, `f17ac8f56`, `01616cc76`                                                                                                                                                                                                    | "T5.3 (1ª metade)"                                                     |
| T5.3-api rota em lote                                | `d0845fa73`                                                                                                                                                                                                                              | "T5.3-api"                                                             |
| T5.3 (1ª e 2ª metade), T5.3c                         | `338e7e31b`, `76a170f83`, `86c7ab009`, `9257165f7`, `f657922b0`                                                                                                                                                                          | "T5.3 (1ª metade)", "T5.3 (2ª metade) e T5.3c"                         |
| T5.3b momentos                                       | `74196c68d`                                                                                                                                                                                                                              | "T5.3b"                                                                |
| T5.3d aviso ao contratante                           | `ff90da272`                                                                                                                                                                                                                              | "T5.3d"                                                                |
| T5.3e busca e filtros                                | `f62bbe59d`                                                                                                                                                                                                                              | "T5.3e"                                                                |
| T5.4 endereço antigo                                 | `94fda003d`                                                                                                                                                                                                                              | "T5.4"                                                                 |
| T6.1 revisão de design                               | `509ccc332`, `54810e1dd`, `f3d7adcdc`, `eebfc36fa`, `65bf777d0`, `65418e9b6`, `b6747863c`                                                                                                                                                | "T6.1"                                                                 |
| T6.1b, 1ª passada (API)                              | `f955b2d07`, `6aaca67a1`, `2f5eaa756`, `ab94009d3`, `bf64705ff`, `43eece3a9`, `195c38fad`, `f99a683c5`, `bffb9c381`, `21952498c`, `71b642f4f`                                                                                            | "Correções da revisão final (API)", "Veredito das passadas"            |
| T6.1b, 2ª passada (painel)                           | `f127b2ca9`, `278c2beb8`, `87b81a3c9`, `ae66bb535`, `197eca323`, `1eddeb95c`, `0138cbbac`, `88a5fe260`, `ec9949728`, `5058dd35f`, `695f58cf7`, `4a2c8435c`, `57b817e60`, `1f9b20e47`, `650049d4a`, `17df7010d`, `5600185f0`, `aff8a08ba` | "Correções da revisão final (painel)", "Varredura de regressão visual" |
| T6.1b, 3ª passada                                    | `b046107f2`, `0eb4a8655`, `d12a13f73`, `826e93330`, `89444abef`, `2f939d0cf`, `c71b0b130`, `2de9b6d8b`                                                                                                                                   | "Correções da terceira revisão"                                        |
| T6.2 contexto vivo                                   | `2b943d116`                                                                                                                                                                                                                              | "T6.2" (abaixo)                                                        |
| T6.3 gates, conferência, mutações                    | `e98f0d5a5`                                                                                                                                                                                                                              | "T6.3"                                                                 |
| T6.4 este consolidado                                | o commit que traz esta seção                                                                                                                                                                                                             | "Ordem de publicação em etapas", "Fechamento"                          |

## Ordem de publicação em etapas

**Pré-requisitos de produção (valem para as três etapas e para o PR `staging` → `main`):**

- **T1d.0 e T3.0 estão pendentes de autorização do usuário** (leituras em produção, e a T3.0 também em staging). **A 246 não vai a `main` sem as duas medições registradas aqui.**
- ⚠️ **O afrouxamento das exceções passa a valer no deploy da API** (etapa 2): uma exceção `optional` sobre tipo `required` deixa de ser ignorada pelo servidor assim que a API sobe, e não há
  variável de ambiente que ligue ou desligue isso. Staging pode receber as três etapas sem as medições; produção, não.
- A T1d.0 é parada obrigatória **antes da etapa 3**; a T3.0, antes de a etapa 2 chegar a produção.

**Por que o histórico não sobe commit a commit nas etapas 2 e 3.** As quatro migrations foram renomeadas duas vezes (`…112823…` → `…1848xx` → `…2051xx`) e, nos commits intermediários,
o `snapshot.json` tem `prevIds` que não existem na cadeia atual da staging (p.ex. `482a8cd2f`: `ba78d050` ← `9cd11178`): `drizzle-kit check` só passa no estado final. Por isso as etapas 2 e 3 se
montam **por arquivo, a partir do tip**: os commits de código entram em ordem e as pastas de migration entram uma vez, na forma final. Os commits que tocam `apps/api-transportada/drizzle/`
são `9fdcf20c2`, `3dbd7865e`, `482a8cd2f`, `714fae9a8`, `ca6d208e0`, `f59b03f5d`, `f99a683c5`, `21952498c` e `b046107f2`.

### Etapa 1 — painel e apps tolerantes (sem migration, sem API)

Guards e telas que aceitam os campos novos, a rota em lote e o endereço novo **ainda inexistentes** na API: ausente lê como hoje, 404 da rota em lote vira `[]`, `moments` ausente esconde o seletor.

Commits, em ordem: `c3cb65c5f`, `f268acecc`, `24312a31a`, `d01333eab`, `5b5014c17`, `ece2cb069`, `d9556c082`, `5d410d135`, `1b380de0c`, `f17ac8f56`, `dcecf81ad`, `01616cc76`, `86c7ab009`,
`338e7e31b`, `76a170f83`, `9257165f7`, `74196c68d`, `ff90da272`, `f62bbe59d`, `94fda003d`, `509ccc332`, `54810e1dd`, `f3d7adcdc`, `eebfc36fa`, `65bf777d0`, `65418e9b6`, `f127b2ca9`, `278c2beb8`, `87b81a3c9`,
`ae66bb535`, `197eca323`, `1eddeb95c`, `0138cbbac`, `88a5fe260`, `ec9949728`, `5058dd35f`, `695f58cf7`, `4a2c8435c`, `57b817e60`, `1f9b20e47`, `650049d4a`, `17df7010d`, `d12a13f73`, `826e93330`,
`89444abef`, `2f939d0cf`. Apps: `apps/frontend-transportada` e `apps/frontend-driver`; nenhum arquivo de `apps/api-transportada`.

`specs/` que vão nesta etapa (só documentação): `specs/246-a-exigencia-da-ocorrencia-chega-na-rua/` inteira, na versão final (`spec.md`, `plan.md`, `tasks.md`, `evidence.md`, `preview.html`, `prints/`) —
commits só de spec: `54e9daa7a`, `4f04b2e07`, `67ebc1791`, `1f9eaac86`, `d5d6ffd24`, `4d699fa1d`, `ad6f2779a`, `05164673c`, `02df1291a`, `8e9d7df17`, `58ea3f2ed`, `780278f70`, `b37805fbc`, `f657922b0`,
`b6747863c`, `43eece3a9`, `195c38fad`, `bffb9c381`, `71b642f4f`, `5600185f0`, `aff8a08ba`, `e98f0d5a5` e o commit da T6.4 — e a renumeração "239 → 246" em `specs/241-…/{spec,plan,tasks,evidence}.md` (vem em `2b943d116`).
Os `docs/ai-context/frontend-*.md` e os `CLAUDE.md` das apps seguem em `2b943d116` (etapa 2, abaixo).

Verificação: `bun run --cwd apps/frontend-transportada test` (7064 + 727), `bun run --cwd apps/frontend-driver test` (1242), typecheck, lint, build, e o painel contra a API **anterior**
(a tela de tipos continua funcionando sem os campos novos).

### Etapa 2 — API e as migrations `…205139`, `…205158`, `…205209`

Só depois de a etapa 1 estar em staging. Commits de código, em ordem: `9fdcf20c2`, `3dbd7865e`, `d23abd845`, `482a8cd2f`, `5ee5c4102`, `31e18617e`, `88062484c`, `62d3cbb48`, `5b788f5c4`, `714fae9a8`, `ca6d208e0`,
`3880456da`, `7ce12752d`, `cf8fbb0e5`, `32287fa91`, `9bd5922de`, `a89bf4345`, `0429b965c`, `be17c2276`, `c853ac78f`, `83eaa3aa7`, `7d023f044`, `56e443c34`, `34cc8b821`, `ec8b57da1`, `d0845fa73`, `f955b2d07`, `6aaca67a1`,
`2f5eaa756`, `ab94009d3`, `bf64705ff`, `f99a683c5`, `21952498c`, `b046107f2`, `0eb4a8655`, `c71b0b130`, `2de9b6d8b`, `2b943d116` (contexto vivo: `CLAUDE.md`, `docs/ai-context/`, numeração da 241).

Migrations (pastas finais, uma vez): `20261006205139_occurrence_type_requirement_modes`, `20261006205158_occurrence_type_moments`, `20261006205209_occurrence_type_quantity_minimums`, cada uma com
`migration.sql`, `rollback.sql` e `snapshot.json`; cadeia `ed7fba64` (a `20261006180700` da 237) → `1bd14adf` → `03ada616` → `f738435d`.

**O que a etapa 2 deve tirar do tip** (pertence à etapa 3): a pasta `…205232_street_occurrence_attachment_backfill`; `test/database-migration/street-occurrence-attachment-backfill.static.contract.ts`
e seu `import` em `test/database-migration.contract.test.ts`; a linha `'20261006205232_street_occurrence_attachment_backfill'` em `test/database-migration/static-migration.contract.ts` (linha ~354);
`test/integration/street-occurrence-attachment-backfill.integration.ts` e sua entrada em `test:integration` do `package.json` da API. Sem a quarta pasta, o `db:generate` segue `no_changes`
(a quarta é `--custom`, não muda o esquema) e o `db:check` fica limpo.

Verificação: contrato da API, `db:test` (esta etapa roda com 3 migrations em vez de 4), `db:generate` = `no_changes`, `db:check`, **a integração completa em blocos**, e `make migration-test`. A etapa 2 **ativa o
afrouxamento das exceções** (RF6) e a escrita dupla da foto de rua.

### Etapa 3 — o backfill dos anexos da rua

**Só depois de a `…205139` estar aplicada no ambiente e da medição T1d.0** (parada obrigatória, pede autorização do usuário; esperado 0 ocorrências com as duas fontes). Entra, em um commit:
`apps/api-transportada/drizzle/20261006205232_street_occurrence_attachment_backfill/` (`migration.sql`, `rollback.sql`, `snapshot.json`, prev `f738435d`), seu contrato estático
(`test/database-migration/street-occurrence-attachment-backfill.static.contract.ts` + o `import` em `database-migration.contract.test.ts` + a linha da lista em `static-migration.contract.ts`), a integração
`street-occurrence-attachment-backfill` (+ entrada em `test:integration`). Commits de origem: `f59b03f5d` (migration), `69c85a8ce` (integração), e a parte da `b046107f2`/`21952498c`/`f99a683c5` que tocou esta pasta.
O backfill é deploy **separado** porque o migrador roda tudo numa transação e o `ADD COLUMN signature_object_id` da `…205139` segura `ACCESS EXCLUSIVE` enquanto o `INSERT` correria.

### O que exige rebase e regeração

- **Se a staging ganhar migration nova entre etapas**, a cadeia bifurca (duas folhas, `db:check` em conflito): é o que aconteceu duas vezes. As migrations ainda **não publicadas** são apagadas e
  regeradas em ordem, com `db:generate` e o esquema de cada passo, o SQL idêntico reaplicado e só o nome trocado (comentário e `DELETE` do journal do `rollback.sql`). Atualizar o nome em
  `test/database-migration/static-migration.contract.ts`, nos cinco testes que leem o `migration.sql`/`rollback.sql` pelo caminho
  (`occurrence-type-requirement-modes`, `occurrence-requirement-modes-registration`, `occurrence-type-moments-backfill`, `occurrence-type-quantity-minimums`, `street-occurrence-attachment-backfill`),
  no `plan.md`, em `docs/ai-context/api-transportada.md` e neste arquivo. Provar: `db:generate` = `no_changes`, `db:check`, `db:test`.
- Migration **já aplicada** em algum ambiente não se renomeia: se isso acontecer, é decisão do orquestrador (a que cede é a mais nova), e esta seção deve ser reescrita.
- Conflito esperado a cada rebase: as duas listas de teste do `package.json` da API (uma linha cada; mesclar por token, conferir duplicados e que todo arquivo do disco está na lista) e
  `docs/ai-context/api-transportada.md` (as seções ficam todas).
- Depois de todo rebase: `bun install --frozen-lockfile`, `bun run typecheck` (props que outra spec tornou obrigatórios só aparecem como TS2739) e os gates da seção "T6.3".

## Pré-requisitos de produção

**A 246 não vai a `main` sem estas duas medições registradas aqui; as duas são pendentes do usuário** (leitura em produção pede autorização dele).

- [ ] **T3.0** — staging e produção, só leitura: exceções (nas duas tabelas) com `attachment_mode <> 'required'` sobre tipo `required` (consulta exata na T3.0 do `tasks.md`). O afrouxamento das exceções (RF6) **passa a valer no deploy da API**, sem variável de ambiente que o segure: sem esta medição ninguém sabe quantos registros passam a ser aceitos sem foto.
- [ ] **T1d.0** — produção, só leitura: `count(*)` de `trip_document_occurrences.attachment_object_id IS NOT NULL` e quantas têm as duas fontes (esperado 0). Parada antes da migration do backfill de anexos em produção.

Staging pode receber a spec sem elas; a promoção a produção (PR `staging` → `main`) não.

## Correções da spec antes de implementar (2026-10-06)

Um `architect` validou os desenhos de `spec.md`, `plan.md` e `tasks.md` contra o código real, e o
usuário fechou quatro decisões. Nada foi implementado: só documentação. Cada correção abaixo foi
conferida contra a árvore de `origin/staging` (`81cd849b6`).

### Decisões do usuário

| Decisão | O que mudou                                                                                                                                                                                                                                                                                        | Por quê                                                                                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-a     | As colunas novas das **duas** tabelas de exceção (`note_mode`, `signature_mode`, `items_mode`, `photo_minimum_count`, `items_minimum_count`) são **nulas, sem default**: nulo herda do tipo, campo a campo. P2 deixou de dizer "cada exceção declara os três"; RF1a ganhou a opção "Igual ao tipo" | `resolveWithOverrides` já é `recipient ?? contractor ?? general ?? fallback`. Exceção que só endurece a assinatura não deve repetir o resto. O RF5 fica intacto (campo a campo)                                                                                                                      |
| D-b     | **Fase 3 reescrita.** T3.1 🧠 (chave de cache por nota), T3.2 (mandar `contractorId`/`recipientTaxId` na URL), CA03 antiga, RF6 antiga e "defeito 1" descartados. Nova Fase 3: o **registro no servidor** lê os modos efetivos por nota; medição T3.0 antes de ativar em produção                  | O snapshot já resolve por nota (`drizzle-current-driver-trip.repository.ts` `toDriverDocument`; app em `occurrenceRegistration.service.ts`). Mandar CNPJ na URL viola `security.md` §3, e `driverTripClient.service.ts` (~203-207) recusa de propósito. O defeito real é o servidor ignorar exceções |
| D-c     | Backfill de momentos mapeia `separation + stop` também para `stop`                                                                                                                                                                                                                                 | Preserva o comportamento de todo leitor. Fechar o furo (tipo de galpão com `flow: stop`) é spec à parte                                                                                                                                                                                              |
| D-d     | Fotos N só na ocorrência de nota (`document`); parada fora. Demonstrativo ao cliente passa a mostrar foto de rua e resposta da correção (CA09, RF14). **Assinatura em `signature_object_id`, nunca como linha de anexo** — RF9 corrigido (dizia "guardada como anexo")                             | A FK da tabela de anexos aponta só para `trip_document_occurrences`; `report-stop-occurrence.use-case.ts` não lê `attachment_mode`. Como linha, a assinatura contaria como foto no mínimo, no expurgo e no demonstrativo                                                                             |

### Correções técnicas do architect

1. **T1.2 (nota e assinatura).** `note_mode` do tipo é `NOT NULL DEFAULT 'optional'`, não `off`
   (a observação hoje é sempre opcional; `off` a esconderia em todo tipo sem foto obrigatória —
   RF1a/RF3 tratavam `off` como estado atual e foram corrigidos). `signature_mode` do tipo
   `DEFAULT 'off'`. Backfill do tipo: `required` onde `attachment_mode = 'required'`, senão
   `optional`. Exceções: `note_mode = CASE WHEN attachment_mode = 'required' THEN 'required' ELSE
'optional' END` em **toda** linha existente (uma exceção `optional` sobre tipo `required` com `note_mode` nulo
   herdaria `required` e endureceria o que é opcional hoje); `signature_mode` das exceções nulo. Ordem:
   `ADD COLUMN` do tipo (default constante) → `ADD COLUMN` das exceções → `UPDATE`s → CHECKs nomeadas
   (≤ 63 caracteres) → por último `signature_object_id`, com FK composta
   `(company_id, signature_object_id) → stored_objects(company_id, id) ON DELETE RESTRICT` nas duas
   tabelas de ocorrência. `rollback.sql` derruba CHECKs, colunas e o registro do journal
   (`ROW_COUNT = 1`); não toca `items_mode` nem as CHECKs da 241; o que se perde (`note_mode` gravado)
   está dito.
2. **Ordem T1.3/T1.4.** A T1.3 verifica o **valor da coluna** (padrão de
   `contractor-contact-channels.integration.ts`: semear antes, reexecutar o `UPDATE`), com cinco
   casos; três mutações. A prova de **comportamento** da CA04 (`TRIP_OCCURRENCE_NOTE_REQUIRED`) virou
   a T2.3b, **depois** da T2.3 (antes dela a regra ainda está no código).
3. **T1b (momentos).** Backfill fiel a todo leitor: quatro regras (incluindo `office` onde
   `stage = 'delivery'` e `stop` onde `separation + stop`), `ON CONFLICT DO NOTHING`, tipos inativos
   entram. Tabela no padrão de tenant (FK a `companies`, FK composta com `ON DELETE CASCADE`,
   `UNIQUE (company_id, occurrence_type_id, moment)`, CHECK gerada de `OCCURRENCE_MOMENTS`,
   coberta por `tenant-safety.contract.ts`). Regra de derivação de `stage`/`flow` para tipo com vários
   momentos; leitura tolerante na janela de deploy; `PUT` que muda `stage`/`flow` de tipo com vários
   momentos → 409; API recusa `document + stop` até o app deduplicar por id + momento. **T1b.2:**
   momento FIXO por caso de uso, guarda `acceptsOccurrenceMoment`, política da rota inalterada,
   proibido `resolveOccurrencePermission` no caminho novo; tabela de pontos de código no plan.
   **RF0b corrigido:** o escritório usa `trip.report-on-behalf`, não `trip.report`. **CA00
   corrigida:** o desajuste responde `409 TRIP_DOCUMENT_NOT_REACHABLE` (era `404` neste texto; o código real é 409, ver a Fase 1b) / `422
OCCURRENCE_TYPE_NOT_SEPARATION` / `422 OCCURRENCE_TYPE_NOT_FIELD`, não 403 (códigos conferidos em
   `trip.error.ts:553,576,604`). **CA00b:** verifica as linhas da tabela, não só as listas. **T1b.5:**
   duas mutações. Nota: `separation + document` nunca sai do backfill; os dois "Avaria" existentes
   não são fundidos. Os números de linha da lista do architect foram reconferidos: todos batem nesta
   árvore, exceto onde o plan manda reconferir ao implementar; `SettingsResolutionPanel.component.tsx:61`
   foi acrescentado.
4. **T1d (anexos da rua).** `trip_document_occurrence_attachments` **não tem `retention_until`**
   (está em `stored_objects.retention_until`; o objeto é o mesmo) — corrigido em spec, plan e task. A
   leitura "anexo novo, senão coluna antiga" **já existe** desde a 161 T10: T1d.1 virou contrato que
   prende o que existe. SQL do backfill com `created_at = o.created_at` obrigatório e `NOT EXISTS`
   (pode haver ocorrência com anexo só na posição 2). Migration própria em **deploy separado** da T1.2
   (o migrator roda tudo numa transação; `ADD COLUMN signature_object_id` seguraria `ACCESS
EXCLUSIVE` durante o `INSERT`). Medição em produção (T1d.0) só com autorização. Objeto servindo N
   ocorrências (lote do escritório) vira N linhas com o mesmo `stored_object_id`, e o expurgo da 161
   supõe uma por objeto: documentado, e a escrita dupla da T1d.5 não usa `trip_occurrence_attachment`
   para o lote. `rollback.sql` não apaga as linhas. Sementes (a)-(e), três mutações. O id do anexo
   antigo muda (id da ocorrência → id da linha) na linha do tempo e no feed: registrado.
5. **T1c / `items_mode`.** T1c.0 satisfeita e marcada: a 241 está em `origin/staging` `81cd849b6`,
   migration `20261006033752_occurrence_type_items_mode`. `items_mode` das exceções é coluna nula
   (D-a). **Decisão tomada aqui:** sem CHECK `off ⇒ unset` nas exceções, porque a política de
   reentrega é do tipo. **Decisão tomada aqui:** `items_mode` + `items_minimum_count` da exceção vão
   como **par** (nulo em `items_mode` herda o par; declarado usa o próprio, e `items_minimum_count`
   nulo é "todos os itens") — sem isso a exceção não consegue pedir "todos" sobre um tipo que pede
   "ao menos 2". Referências de linha do plan atualizadas (`trip.schema.ts` 2416/2532/2584 →
   2594/2685/2737; regra da nota em `register-driver-occurrence.use-case.ts:146-152`, não 137). O
   comentário de `itemsMode` (~2621) que cita "spec 239" é a 246: corrigir na T1.1.
6. **WhatsApp do motorista** não colhe assinatura (nem foto). **Decisão tomada aqui (RF13):** tipo com
   assinatura `required` não é registrável por esse canal — o servidor devolve o erro estável da
   assinatura, como já devolve para foto obrigatória; a lista **não** é filtrada por exigência
   nesta spec. Task T2.6 prende o comportamento. Sem `[NEEDS CLARIFICATION]`.

### Decisões que o usuário pode vetar (tomadas nesta revisão)

- RF13: o WhatsApp não filtra a lista; o erro estável diz o campo.
- Par `items_mode` + `items_minimum_count` na exceção.
- Sem CHECK `off ⇒ unset` nas exceções.
- `signature_object_id` criada também em `trip_stop_occurrences` (o architect pediu "nas duas
  tabelas"), embora a exigência da parada esteja fora do escopo (D-d): a coluna fica **sem escritor
  nem leitor** nesta spec, para evitar uma segunda migration.
- `preview.html`: as quatro seleções da exceção ganharam a opção "Igual ao tipo" (estado inicial da
  exceção nova) e a dica abaixo da grade a explica — o protótipo só mostrava três estados.

### Conferência da pré-condição (T1c.0)

`git rev-parse origin/staging` = `81cd849b686a93775569ae07ac8910added452f7`. A árvore tem
`apps/api-transportada/drizzle/20261006033752_occurrence_type_items_mode/` com
`items_mode varchar(16) DEFAULT 'optional' NOT NULL`, `company_occurrence_types_items_mode_check` e
`company_occurrence_types_items_off_shape_check`; `trip.schema.ts:2624` declara `itemsMode`.

## Medições pendentes (pedem autorização do usuário; só leitura)

- [ ] T1d.0 — produção: `count(*)` de `trip_document_occurrences.attachment_object_id IS NOT NULL`, e
      quantas têm as duas fontes (esperado 0). Consulta exata em "T1d.0" (Fase 1d).
- [ ] T3.0 — staging e produção: exceções com `attachment_mode <> 'required'` sobre tipo `required`.
      A Fase 3 só ativa em produção depois deste registro.

## Fase 1 — O dado passa a carregar a exigência

### T1.1 — Schema (2026-10-06)

`trip.schema.ts`: no tipo, `note_mode varchar(16) NOT NULL DEFAULT 'optional'` e `signature_mode
varchar(16) NOT NULL DEFAULT 'off'` (padrões em `OCCURRENCE_TYPE_REQUIREMENT_DEFAULTS`,
`trip-occurrence.constant.ts`), com `company_occurrence_types_note_mode_check` e
`company_occurrence_types_signature_mode_check` sobre `DELIVERY_PROOF_FIELD_MODES`. Nas duas exceções,
`note_mode` e `signature_mode` **nulas, sem padrão** (D-a). `signature_object_id` em
`trip_document_occurrences` e `trip_stop_occurrences`, com `<tabela>_company_signature_object_fk`
(`(company_id, signature_object_id) → stored_objects(company_id, id) ON DELETE RESTRICT ON UPDATE
CASCADE`, molde de `trip_document_occurrences_company_object_fk`). Comentário de `itemsMode` corrigido
("239" → "246").

**Decisão — nomes das CHECKs das exceções.** `<tabela>_signature_mode_check` passaria de 63
caracteres nas duas exceções (65 e 64); as quatro CHECKs das exceções perdem o prefixo `company_`:
`occurrence_type_contractor_overrides_note_mode_check` (52),
`occurrence_type_contractor_overrides_signature_mode_check` (57),
`occurrence_type_recipient_overrides_note_mode_check` (51),
`occurrence_type_recipient_overrides_signature_mode_check` (56). Uma regra só para as quatro, em vez
de encurtar só a que estoura.

Contrato primeiro — `test/trip-schema/occurrence-type-requirement-modes.contract.ts` (registrado em
`test/trip-schema.contract.test.ts`), rodado contra o `trip.schema.ts` de `HEAD` (o arquivo foi
trocado pelo de `HEAD` só para a execução e restaurado em seguida):

```text
$ bun test ./test/trip-schema/occurrence-type-requirement-modes.contract.ts   # schema de HEAD
(fail) ... > o tipo nasce com observação optional e assinatura off, nunca nulas
(fail) ... > o vocabulário do tipo é preso por CHECK nomeada
(fail) ... > company_occurrence_type_contractor_overrides: as colunas novas são nulas e sem padrão (D-a, nulo herda)
(fail) ... > company_occurrence_type_contractor_overrides: CHECKs de vocabulário com nome dentro de 63 caracteres
       Expected length: 2 / Received length: 0
(fail) ... > company_occurrence_type_recipient_overrides: as colunas novas são nulas e sem padrão (D-a, nulo herda)
(fail) ... > company_occurrence_type_recipient_overrides: CHECKs de vocabulário com nome dentro de 63 caracteres
(fail) ... > trip_document_occurrences: signature_object_id nula, presa ao objeto da mesma empresa
(fail) ... > trip_stop_occurrences: signature_object_id nula, presa ao objeto da mesma empresa
 0 pass
 8 fail
```

Com o schema novo: `8 pass, 0 fail`; `bun test ./test/trip-schema.contract.test.ts` → `249 pass, 0
fail`; `bun run typecheck` → 0 erros. `bun run db:generate --name occurrence_type_requirement_modes`
→ `drizzle/20261006184835_occurrence_type_requirement_modes/migration.sql` (DDL na ordem do
drizzle-kit; a ordem do plan, os `UPDATE`s e o `rollback.sql` são a T1.2).

### T1.2 🧠 — Migration na ordem do plan (2026-10-06)

`drizzle/20261006184835_occurrence_type_requirement_modes/`: o DDL do `db:generate` foi reordenado à
mão e ganhou os três `UPDATE`s e o `rollback.sql` no padrão da casa. Ordem: `ADD COLUMN` do tipo
(padrão constante) → `ADD COLUMN` das exceções (nulas) → `UPDATE company_occurrence_types SET
note_mode = 'required' WHERE attachment_mode = 'required'` → `UPDATE <exceção> SET note_mode = CASE
WHEN attachment_mode = 'required' THEN 'required' ELSE 'optional' END` (sem `WHERE`, toda linha; nas
duas exceções) → as seis CHECKs → `signature_object_id` nas duas ocorrências → as duas FKs.
`signature_mode` das exceções fica nulo. `rollback.sql`: `BEGIN` → FKs → `signature_object_id` →
CHECKs → colunas → `DELETE` do journal com `ROW_COUNT <> 1 → RAISE` → `COMMIT`; não toca
`items_mode` nem as CHECKs da 241; o cabeçalho diz o que se perde.

Contrato primeiro — `test/database-migration/occurrence-type-requirement-modes.static.contract.ts`
(registrado em `test/database-migration.contract.test.ts`; a lista de diretórios de
`static-migration.contract.ts` ganhou a migration), contra o `migration.sql` como o drizzle-kit
gerou e sem `rollback.sql`:

```text
$ bun test ./test/database-migration/occurrence-type-requirement-modes.static.contract.ts
error: Missing fragment: UPDATE "company_occurrence_types" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';
(fail) a exigência vira dado na ordem do plan (spec 246 T1.2) > colunas do tipo → das exceções → UPDATEs → CHECKs → signature_object_id
ENOENT: no such file or directory, open '.../drizzle/20261006184835_occurrence_type_requirement_modes/rollback.sql'
(fail) a exigência vira dado na ordem do plan (spec 246 T1.2) > o rollback desfaz só a 246, em ordem inversa, e não toca a 241
 0 pass
 2 fail
```

Depois: os contratos estáticos de migration (`occurrence-type-requirement-modes.static`,
`static-migration`, `schema-snapshot`, `migration-readiness`, `pre-deploy`, `migration-chain`) →
`86 pass, 0 fail`; `bun run db:generate` → `{"status":"no_changes"}`; `make migration-test
ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432) → `127 pass, 0 fail, 0 skip` em 8 arquivos.

Validação por `architect` (opus, só leitura) sobre o SQL final: **APROVADO**, sem bloqueios — as
CHECKs só leem valores que a própria migration gravou ou nulo; as FKs caem sobre coluna nova toda
nula (nenhuma linha verificável), sem precisar de `NOT VALID`; `ADD COLUMN` com padrão constante não
reescreve a tabela; rollback em ordem inversa, sem tocar a 241. Diferenças de forma apontadas, sem
efeito: um `ALTER` por coluna (formato do drizzle-kit) em vez de um por tabela; `migration.sql` sem
cabeçalho de copyright, como o molde da 241.

### T1.3 — Valor da coluna sobre dado antigo (2026-10-06)

`test/integration/occurrence-type-requirement-modes.integration.ts` (entrou na lista
`test:integration` do `package.json` da API, logo depois de `occurrence-type-items-mode`). O banco
descartável nasce migrado, **desfaz só a 246 pelo próprio `rollback.sql`**, recebe tipos e exceções
gravados sem as colunas novas, e o migrador reaplica o `migration.sql` lido do disco — os `UPDATE`s
que rodam são os do arquivo, junto com o padrão do `ADD COLUMN` (é o que deixa a mutação (2) da T1.4
visível; reexecutar só o `UPDATE` sobre colunas já criadas não a pegaria). **Decisão:** é a variação
do molde de `contractor-contact-channels.integration.ts` (semear antes, rodar o SQL do arquivo) que
cobre as três mutações. Casos, todos sobre o mesmo tipo `required` nas exceções:

| Semente                                 | `note_mode` esperado | `signature_mode` |
| --------------------------------------- | -------------------- | ---------------- |
| tipo `attachment_mode = required`       | `required`           | `off`            |
| tipo `optional`                         | `optional`           | `off`            |
| tipo `off`                              | `optional`           | `off`            |
| contratante `required`                  | `required`           | nulo             |
| contratante `optional` sobre `required` | `optional`           | nulo             |
| destinatário `required`                 | `required`           | nulo             |
| destinatário `off` sobre `required`     | `optional`           | nulo             |

```text
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-requirement-modes.integration.ts
 1 pass
 0 fail
```

**Rollback não toca a 241 (CA07)** — `test/database-migration/occurrence-type-requirement-modes.assertion.ts`,
chamado de `database-migration.integration.ts` logo depois da asserção da 241 (roda no `make
migration-test`): lê `pg_constraint` e `information_schema.columns`; antes do rollback há as 2 CHECKs
da 241 + as 6 CHECKs e 2 FKs da 246, e 9 colunas; depois do rollback restam exatamente
`company_occurrence_types_items_mode_check`, `company_occurrence_types_items_off_shape_check` e
`company_occurrence_types.items_mode`; o migrador reaplica e o estado completo volta. A CHECK
estática de ordem é a da T1.2 (`occurrence-type-requirement-modes.static.contract.ts`).
`make migration-test ENV_FILE=.env.test` → `127 pass, 0 fail, 0 skip`.

Prova de que a asserção não é vazia — o `rollback.sql` ganhou à mão um `DROP CONSTRAINT IF EXISTS
"company_occurrence_types_items_off_shape_check"` só para esta execução, restaurado em seguida
(`git status` limpo):

```text
$ make migration-test ENV_FILE=.env.test
error: expect(received).not.toMatch(expected)
(fail) a exigência vira dado na ordem do plan (spec 246 T1.2) > o rollback desfaz só a 246, em ordem inversa, e não toca a 241
error: expect(received).toEqual(expected)
-   "company_occurrence_types_items_off_shape_check",
(fail) Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration
 125 pass
 2 fail
```

### T1.4 — Mutações (2026-10-06)

Cada mutação foi aplicada ao `migration.sql` da T1.2 só para a execução, e o arquivo foi restaurado
da cópia em seguida (`git status` limpo). Comando das três:
`cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-requirement-modes.integration.ts`.

**(1) Tirar o `UPDATE` do tipo.**

```text
-UPDATE "company_occurrence_types" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';--> statement-breakpoint
error: expect(received).toEqual(expected)
-   "note_mode": "required",
+   "note_mode": "optional",
(fail) a exigência vira dado sem mudar o que já está gravado (spec 246 T1.3) > tipo e exceções antigos saem com observação e assinatura conforme a regra da 179
 0 pass
 1 fail
```

**(2) Padrão `'off'` em `note_mode` do tipo.**

```text
-ALTER TABLE "company_occurrence_types" ADD COLUMN "note_mode" varchar(16) DEFAULT 'optional' NOT NULL;--> statement-breakpoint
+ALTER TABLE "company_occurrence_types" ADD COLUMN "note_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
error: expect(received).toEqual(expected)
-   "note_mode": "optional",
+   "note_mode": "off",
(fail) a exigência vira dado sem mudar o que já está gravado (spec 246 T1.3) > tipo e exceções antigos saem com observação e assinatura conforme a regra da 179
 0 pass
 1 fail
```

**(3) O `CASE` das exceções vira `WHERE attachment_mode = 'required'`.**

```text
+UPDATE "company_occurrence_type_contractor_overrides" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';--> statement-breakpoint
+UPDATE "company_occurrence_type_recipient_overrides" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';--> statement-breakpoint
error: expect(received).toEqual(expected)
-   "note_mode": "optional",
+   "note_mode": null,
(fail) a exigência vira dado sem mudar o que já está gravado (spec 246 T1.3) > tipo e exceções antigos saem com observação e assinatura conforme a regra da 179
 0 pass
 1 fail
```

Restaurado: `1 pass, 0 fail`. A prova de **comportamento** da CA04 (`TRIP_OCCURRENCE_NOTE_REQUIRED`)
é a T2.3b, depois da T2.3.

### Gates ao fechar a Fase 1 (2026-10-06, primeiro plano)

| Gate                                                                         | Resultado                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                              | sem mudanças                                                                                                                                                                                                                        |
| `bun run typecheck`                                                          | saída 0, 0 erros                                                                                                                                                                                                                    |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`            | "All matched files use Prettier code style!"                                                                                                                                                                                        |
| contrato da API (`bun --env-file=../../.env.test test --timeout 120000`)     | `9727 pass, 25 skip, 0 fail` (199 arquivos); antes da fase, em `f86a9e8c2`: `9717 pass, 25 skip, 0 fail` — os 25 pulados são anteriores                                                                                             |
| integração, um arquivo por vez com `--env-file=../../.env.test`              | `occurrence-type-requirement-modes` 1/0 · `occurrence-type-items-mode` 5/0 · `occurrence-type-catalog-seed` 2/0 · `occurrence-type-redelivery-policy` 2/0 · `occurrence-type-leaves-document-behind` 4/0 (pass/fail, nenhum pulado) |
| `make migration-test ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432) | `127 pass, 0 fail, 0 skip`                                                                                                                                                                                                          |
| `bun run db:generate`                                                        | `no_changes`                                                                                                                                                                                                                        |
| `bun run --cwd apps/api-transportada build`                                  | saída 0                                                                                                                                                                                                                             |

## Fase 1b — O momento vira conjunto

### T1b.1b (painel) — a guarda do catálogo tolera `moments` antes da API (2026-10-06)

Ordem de publicação (ADR-0081 §9): o `GET`/`PUT /company-settings/occurrence-types` passa a mandar
`moments` na T1b.1b da API, e a guarda de chave exata do painel (`isOccurrenceType`,
`apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts`) reprovaria a lista
inteira. Este commit é **separado** dos da API para poder subir antes. `moments` entra na lista de
chaves permitidas, presente só passa com o vocabulário de `OCCURRENCE_MOMENTS` (cópia por valor em
`trip/shared/occurrence.constant.ts`), ausente é API anterior. O `PUT` do painel
(`buildOccurrenceTypeUpdate`) monta o corpo campo a campo e não manda `moments` — a API mantém o
gravado (T1b.1b).

Conferidos os outros leitores das respostas que a Fase 1b toca: `frontend-driver` e
`frontend-client` **não** leem o catálogo (`/company-settings/occurrence-types`); a lista do
motorista (`/me/trips/current/occurrence-types`), o snapshot (`document.occurrenceTypes`), a lista do
escritório (`/trips/occurrence-types/field`) e a verificação (`settings-resolution`) **não mudam de
forma** nesta fase — nenhum campo novo sai neles. A guarda `isTripOccurrence` (~1461) lê ocorrências,
não tipos, e também não muda.

Contrato primeiro — `test/trip/occurrence-type-tolerance.contract.ts`, vermelho antes da guarda:

```text
$ bun test ./test/trip/occurrence-type-tolerance.contract.ts
error: TRIP_RESPONSE_INVALID
      at occurrenceTypesFromApi (.../src/modules/trip/shared/tripResponse.validation.ts:1073:82)
(fail) tolerância a allowsMultipleItems/redeliveryPolicy ausentes (achado B7) > aceita `moments` da API nova, e a lista sem ele da API anterior [2.12ms]
 9 pass
 1 fail
```

Depois: `10 pass, 0 fail`; `bun run typecheck` (app) saída 0; `eslint` nos três arquivos sem achado.

### T1b.1 — A tabela de momentos e o backfill (2026-10-06)

`OCCURRENCE_MOMENT`/`OCCURRENCE_MOMENTS` (`separation`, `document`, `stop`, `office`, nesta ordem
canônica) e a guarda `acceptsOccurrenceMoment({ moments, moment })` em
`src/shared/trip-occurrence.constant.ts`. A tabela mora em arquivo próprio,
`src/database/occurrence-type-moment.schema.ts` (exportado por `database.schema.ts`), no padrão de
tenant: `company_occurrence_type_moments_company_id_companies_id_fk` (restrict/cascade),
`company_occurrence_type_moments_type_fk` `(company_id, occurrence_type_id) →
company_occurrence_types(company_id, id) ON DELETE CASCADE`, `company_occurrence_type_moments_unique
(company_id, occurrence_type_id, moment)` e `company_occurrence_type_moments_moment_check` gerada de
`inList(OCCURRENCE_MOMENTS)`.

Migration `drizzle/20261006184901_occurrence_type_moments/` (`db:generate --name
occurrence_type_moments`, depois o backfill à mão): `CREATE TABLE` → as duas FKs → cinco `INSERT …
SELECT … ON CONFLICT ON CONSTRAINT "company_occurrence_type_moments_unique" DO NOTHING`, uma regra da
tabela do plan por instrução (a de `stop` são duas: `delivery + stop` e `separation + stop`, D-c), sem
filtro de `active` — tipo inativo entra. O cabeçalho registra que `separation + document` nunca sai do
backfill e que os dois "Avaria" existentes continuam dois tipos. `rollback.sql`: `BEGIN` → `DROP
TABLE` → `DELETE` do journal com `ROW_COUNT <> 1 → RAISE` → `COMMIT`; não toca `stage` nem `flow`, e
o cabeçalho diz o preço (tipo com mais momentos do que o par `stage`/`flow` diz perde o conjunto; um
`separation + document` volta a ser só de galpão).

Contratos primeiro, vermelhos:

```text
$ bun test ./test/trip-schema/tenant-safety.contract.ts
SyntaxError: Export named 'companyOccurrenceTypeMoments' not found in module '.../src/database/database.schema.ts'.
 0 pass
 1 fail
 1 error

$ bun test ./test/database-migration/occurrence-type-moments.static.contract.ts
error: occurrence_type_moments is required
(fail) o momento vira conjunto (spec 246 T1b.1) > o rollback derruba só a tabela e o journal, e não toca stage nem flow [1.65ms]
 0 pass
 2 fail
```

Depois: `tenant-safety.contract.ts` → `18 pass, 0 fail` (a tabela entrou em `TRIP_TABLES` e ganhou o
caso de FK composta, unicidade e CHECK igual a `inList(OCCURRENCE_MOMENTS)`);
`bun test ./test/trip-schema.contract.test.ts` → `250 pass, 0 fail`; os contratos estáticos de
migration (`occurrence-type-moments.static`, `static-migration` — a lista de diretórios ganhou a
pasta —, `schema-snapshot`, `migration-readiness`, `pre-deploy`, `migration-chain`,
`occurrence-type-requirement-modes.static`) → `88 pass, 0 fail`; `bun run db:generate` →
`no_changes`; `bun run typecheck` → saída 0. Rollback no `make migration-test`:
`test/database-migration/occurrence-type-moments.assertion.ts` (chamado logo depois do da T1.2)
derruba a tabela pelo `rollback.sql`, confere que `stage` e `flow` do tipo seguem de pé e que o
migrador a reaplica — `make migration-test ENV_FILE=.env.test` → `129 pass, 0 fail, 0 skip` em 8
arquivos. As **linhas** do backfill sobre dado semeado são a T1b.4.

### T1b.1b (API) — Derivação de `stage`/`flow`, leitura tolerante e o `PUT` com `moments` (2026-10-06)

Regra pura em `src/trips/domain/occurrence-moment.policy.ts`: `deriveOccurrenceMomentsFromStageAndFlow`
(gêmea do backfill: `separation` → `[separation]`, `separation + stop` → `[separation, stop]`,
`delivery + document` → `[document, office]`, `delivery + stop` → `[stop, office]`);
`resolveOccurrenceTypeMoments` (leitura tolerante: o gravado vence, tipo sem linha usa os derivados);
`deriveStageAndFlowFromMoments` (`stage = 'separation'` se e só se `separation ∈ momentos`; `flow =
'stop'` se e só se `stop ∈` e `document ∉`); `assertOccurrenceMomentsAreWritable` (`document + stop`
→ `422 OCCURRENCE_TYPE_MOMENTS_DOCUMENT_AND_STOP`); `isExpressedByStageAndFlow`. Erros em
`occurrence-moment.error.ts` (arquivo próprio, molde de `canhoto-review.error.ts`).

Leitura: `findOccurrenceType` e `listOccurrenceTypes` (`delivery-proof-read.support.ts`) devolvem
`moments` resolvidos, por `withOccurrenceTypeMoments`
(`src/trips/infrastructure/occurrence-type-moments.query.ts`) — **uma** consulta para a lista
inteira. O `GET /company-settings/occurrence-types` e a resposta do `PUT` passam a trazer `moments`
(o painel já tolera: commit `2cf84cb2f`). `OccurrenceTypeRecord.moments` é opcional só para os
dublês; toda guarda passa pelo resolvedor.

Escrita: `occurrenceTypeSchema` aceita `moments` (vocabulário fechado, opcional). Em
`saveOccurrenceTypeWithTemplate`: com `moments`, `stage`/`flow` gravados são os derivados do
conjunto (o corpo continua mandando `stage`, que o conjunto vence); sem `moments`, o gravado fica.
**Interpretação registrada** de "`PUT` que muda `stage`/`flow` de tipo com vários momentos → 409":
"vários momentos" é o conjunto que o par `stage`/`flow` **não** diz inteiro (ex.: `separation +
document`). Um tipo `delivery + document` tem dois momentos (`document`, `office`) e o par o diz
inteiro — trocar o `flow` dele pelo painel de hoje **re-deriva** o conjunto (`[stop, office]`), senão
a troca não teria efeito no registro, que passa a ler o conjunto. A gravação do tipo e do conjunto é
uma transação só (`saveOccurrenceType`); criação sem `moments` grava o derivado. `stop_kind` segue a
regra antiga sobre o `flow` gravado, que agora é o derivado — tipo com `stop` sempre ganha `other`
quando vazio. O `seedOccurrenceTypeCatalog` do pre-deploy grava sem linha de momento (não passa por
`saveOccurrenceType`); a leitura tolerante cobre.

Contratos primeiro (`test/trip-occurrence/occurrence-moment.contract.ts` e
`occurrence-type-moments-write.contract.ts`, registrados em `test/trip-occurrence.contract.test.ts`),
vermelhos antes da implementação:

```text
$ bun test ./test/trip-occurrence/occurrence-moment.contract.ts ./test/trip-occurrence/occurrence-type-moments-write.contract.ts
error: Cannot find module '../../src/trips/domain/occurrence-moment.policy.js' from '.../test/trip-occurrence/occurrence-moment.contract.ts'
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > com moments, stage e flow gravados são os derivados do conjunto [0.46ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > nota e parada juntas são recusadas antes de gravar [0.10ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > sem moments, mudar o flow de tipo que o par diz inteiro re-deriva o conjunto [0.07ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > tipo antigo sem linha de momento segue a mesma regra, pelos derivados [0.06ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > sem moments, mudar stage/flow de tipo com vários momentos é 409 [0.06ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > "deixa a nota para trás" vale pelo stage derivado do conjunto [0.11ms]
(fail) o corpo do PUT do catálogo aceita moments (spec 246 T1b.1b) > moments no vocabulário passa; ausente continua ausente (mantém o gravado) [2.68ms]
 2 pass
 8 fail
```

Depois: `21 pass, 0 fail`; `bun test ./test/trip-occurrence.contract.test.ts` → `374 pass, 0 fail`;
`bun run --cwd apps/api-transportada typecheck` → saída 0. Integração dos que gravam tipo pelo
`saveOccurrenceType` (agora em transação com o conjunto), um por vez com `--env-file`:
`occurrence-type-items-mode` 5/0 · `occurrence-type-leaves-document-behind` 4/0 ·
`occurrence-type-redelivery-policy` 2/0 · `occurrence-type-catalog-seed` 2/0 ·
`occurrence-type-requirement-modes` 1/0 (pass/fail, nenhum pulado). A escrita e a leitura do
conjunto contra o banco são provadas na T1b.3.

### T1b.2 🧠 — A guarda é o momento fixo de cada caso de uso (2026-10-06)

Desenho validado por `architect` antes desta fase (ver "Correções da spec"). A guarda é
`acceptsOccurrenceMoment({ moments, moment })` (`shared/trip-occurrence.constant.ts`), chamada sempre
por `occurrenceTypeAcceptsMoment({ moment, type })` (`trips/domain/occurrence-moment.policy.ts`), que
passa o conjunto pela leitura tolerante. A política de cada rota **não mudou**;
`resolveOccurrencePermission` (`occurrence.policy.ts`) não entra em nenhum caminho novo — nenhuma
permissão é calculada a partir dos momentos do tipo.

Pontos de código, reconferidos nesta árvore (os números mudaram desde o plan):

| Ponto (plan)                                                                                                                                                                                                                  | Linha hoje                                                        | O que mudou                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register-trip-occurrence.use-case.ts:323`                                                                                                                                                                                    | ~330                                                              | `separation` no conjunto, senão `422 OCCURRENCE_TYPE_NOT_SEPARATION`; a ocorrência grava `stage: separation` (o momento do registro), não o par do tipo                                                                                                   |
| `register-driver-occurrence.use-case.ts:105-112`                                                                                                                                                                              | ~105                                                              | `document` no conjunto, senão `409 TRIP_DOCUMENT_NOT_REACHABLE` (cobre tipo de galpão e de parada; o `flow` sai da conta)                                                                                                                                 |
| `office-occurrence-batch.service.ts:35-40`                                                                                                                                                                                    | ~36                                                               | `office` no conjunto, senão `422 OCCURRENCE_TYPE_NOT_FIELD`                                                                                                                                                                                               |
| `drizzle-driver-field-report.repository.ts:1053` (parada)                                                                                                                                                                     | ~1045                                                             | `findStopOccurrenceType` deixou o `where flow = 'stop'`: lê o tipo ativo, resolve o conjunto (`withOccurrenceTypeMoments`) e só devolve com `stop` nele — mesma resposta `null` → `422 OCCURRENCE_TYPE_NOT_STOP`                                          |
| `register-driver-flow-actions.ts:399,445` (WhatsApp do motorista)                                                                                                                                                             | 397, 443 + `isOfferedToDriver`                                    | lista e conferência da resposta pelo momento `document`: **a lista perde os tipos de parada**                                                                                                                                                             |
| `register-operator-trip-flow-actions.ts:583,628` (WhatsApp do operador)                                                                                                                                                       | 583, 626 + `isOfferedToOperator`                                  | momento `separation`, pelo conjunto                                                                                                                                                                                                                       |
| `list-field-occurrence-types.use-case.ts:126,193`                                                                                                                                                                             | `selectFieldOccurrenceTypes`                                      | ganha o parâmetro `moment`; ausente é a lista do motorista (`document` ou `stop`, `DRIVER_FIELD_MOMENTS`); as exceções em lote são lidas só para os tipos do momento                                                                                      |
| `me-trip.routes.ts` (`GET /me/trips/current/occurrence-types`)                                                                                                                                                                | —                                                                 | aceita `?moment=` só dos momentos do motorista (`document`, `stop`); outro valor é `400`; ausente é a lista de hoje                                                                                                                                       |
| `trip-field-office-occurrence.routes.ts` (`GET /trips/occurrence-types/field`)                                                                                                                                                | —                                                                 | pede a lista do momento `office`                                                                                                                                                                                                                          |
| `drizzle-current-driver-trip.repository.ts:781,1045` (snapshot)                                                                                                                                                               | ~781, ~1043                                                       | tipos e exceções do snapshot pelo momento `document` (sai o `filter(flow === 'document')`)                                                                                                                                                                |
| `read-settings-resolution.use-case.ts:125`                                                                                                                                                                                    | 125                                                               | **sem mudança**: a lista vem de `listFieldOccurrenceTypes` sem `moment` (a lista de rua do motorista); o `stage: delivery` da resposta é rótulo da tela, não decisão                                                                                      |
| `save-occurrence-type.use-case.ts:96`                                                                                                                                                                                         | ~121                                                              | (T1b.1b) "deixa a nota para trás" confere o `stage` **derivado** do conjunto                                                                                                                                                                              |
| `delivery-proof-read.support.ts:846-1110`                                                                                                                                                                                     | `findOccurrenceType`, `listOccurrenceTypes`, `saveOccurrenceType` | (T1b.1b) leitura com o conjunto resolvido; escrita do conjunto na transação do tipo                                                                                                                                                                       |
| Painel (`TripOccurrences.component.tsx:136`, `separationOccurrenceButton.service.ts:28`, `SettingsResolutionPanel.component.tsx:61`, `OccurrenceTypeCatalogPanel.component.tsx:88`, `OccurrenceTypeRow.component.tsx:51,135`) | —                                                                 | **sem mudança nesta fase** (Fase 5): continuam lendo `stage`, que segue gravado e derivado do conjunto — um tipo `separation + document` tem `stage = 'separation'` e aparece no botão do separador. Guardas de chave exata: commit do painel `2cf84cb2f` |
| App (`occurrenceRegistration.service.ts:48-51`)                                                                                                                                                                               | —                                                                 | **sem mudança**: a API recusa `document + stop`, então o `flow` de cada tipo continua único                                                                                                                                                               |

⚠️ **Divergência registrada (consequência de D-c, não do código):** um tipo antigo `separation +
stop` vira `{separation, stop}` no backfill (D-c, para preservar o registro de parada, que já o
aceitava por ler só `flow`). Como a lista do motorista passa a ser "tipos com `document` ou `stop`",
esse tipo **passa a aparecer** na lista do app (antes ficava fora por `stage = 'separation'`) — a
CA00b ("nenhuma lista muda") não vale para esse caso de borda. O tipo só nasce por chamada direta à
API (o painel esconde `flow` em tipo de galpão). Nenhuma regra consistente com o conjunto evita
isso sem fechar o furo, que D-c mandou para spec à parte.

Contratos primeiro, vermelhos antes da implementação (`test/trip-occurrence/occurrence-moment-guard.contract.ts`,
casos novos em `test/driver-trip/me-routes.contract.ts`, `test/trip-field-office/occurrences-route.contract.ts`,
`test/whatsapp-commands/driver-flow-actions.contract.ts` e `operator-flow-actions.contract.ts`). Os
dublês gravam `stage` em desacordo com `moments` de propósito — a guarda que lê o par reprova. Os
dois do WhatsApp rodaram contra os arquivos de `HEAD` (trocados só para a execução e restaurados):

```text
$ bun test ./test/trip-occurrence/occurrence-moment-guard.contract.ts
(fail) o separador registra só no momento separation (spec 246 T1b.2) > tipo só de nota é recusado, mesmo com stage separation gravado [0.54ms]
(fail) o motorista registra só no momento document (spec 246 T1b.2) > tipo separation + document passa, embora o stage gravado seja separation [0.35ms]
(fail) o motorista registra só no momento document (spec 246 T1b.2) > tipo só de galpão é inalcançável, mesmo com stage delivery gravado [0.09ms]
(fail) o motorista registra só no momento document (spec 246 T1b.2) > tipo de parada é inalcançável na rota de nota [0.07ms]
(fail) o escritório registra só no momento office (spec 246 T1b.2) > tipo de nota sem office é recusado, mesmo com stage delivery [0.17ms]
(fail) o escritório registra só no momento office (spec 246 T1b.2) > tipo com office passa, mesmo com stage separation gravado [0.08ms]
(fail) as listas de rua seguem o momento, não o stage (spec 246 T1b.2) > o motorista (sem moment) vê nota e parada, inclusive o tipo de galpão + nota [0.17ms]
(fail) as listas de rua seguem o momento, não o stage (spec 246 T1b.2) > com moment, só os tipos daquele momento [0.05ms]
 1 pass
 8 fail

$ bun test ./test/driver-trip/me-routes.contract.ts ./test/trip-field-office/occurrences-route.contract.ts
(fail) os tipos de ocorrência do motorista (spec 157) > repassa moment de rua, ausente é undefined, e recusa momento de outro papel [10.11ms]
(fail) as rotas da ocorrência do escritório (spec 156 T7.3) > GET pede a lista do momento office [0.49ms]
 19 pass
 2 fail

$ bun test ./test/whatsapp-commands/driver-flow-actions.contract.ts ./test/whatsapp-commands/operator-flow-actions.contract.ts   # flow actions de HEAD
(fail) FlowActions do motorista — Minha viagem (spec 144 T015) > a lista é a do momento document: perde o tipo de parada, ganha o de galpão + nota [1.04ms]
(fail) FlowActions do operador — Viagens do armazém (spec 144 T016) > a lista é a do momento separation, pelo conjunto e não pelo stage [0.41ms]
 90 pass
 2 fail
```

Depois: os cinco arquivos verdes; `bun test ./test/trip-occurrence.contract.test.ts
./test/whatsapp-commands.contract.test.ts ./test/driver-trip.contract.test.ts` → `1117 pass, 0
fail`; contrato completo da API → `9762 pass, 25 skip, 0 fail` (199 arquivos; os 25 pulados são
anteriores); `typecheck` saída 0. Integração do WhatsApp, um por vez com `--env-file`:
`whatsapp-driver-flow-actions` 4/0 · `whatsapp-operator-flow-actions` 7/0. A prova contra o banco,
com os códigos reais, é a T1b.3.

### T1b.3 — CA00 contra o Postgres, com os códigos reais (2026-10-06)

Códigos conferidos em `src/trips/domain/trip.error.ts` antes do teste: `TripDocumentNotReachableError`
é `TRIP_DOCUMENT_NOT_REACHABLE` com **status 409** (a CA00 e a tarefa diziam `404` — o código real é
`409`, e é ele que o teste prende); `OccurrenceTypeNotSeparationError` `422
OCCURRENCE_TYPE_NOT_SEPARATION`; `OccurrenceTypeNotFieldError` `422 OCCURRENCE_TYPE_NOT_FIELD`.

`test/integration/occurrence-type-moments-registration.integration.ts` (na lista `test:integration`
do `package.json`, logo depois de `occurrence-type-requirement-modes`). Os tipos nascem pelo
`saveOccurrenceType` com `moments` — o mesmo caminho da rota de cadastro, provando a escrita do
conjunto na transação do tipo e a leitura de volta. Os casos de uso são os reais, com os
repositórios Drizzle: `registerDriverOccurrence`, `registerTripOccurrence` (com
`persistSeparationOccurrenceWithAttachment`) e a rota do lote do escritório
(`wireOccurrenceRoute`).

1. **Recusas:** motorista com tipo só `separation` na rota de nota → `{ code:
'TRIP_DOCUMENT_NOT_REACHABLE', status: 409 }`; separador com tipo só `document` na rota do galpão
   → `422 OCCURRENCE_TYPE_NOT_SEPARATION`; escritório com o mesmo tipo (sem `office`) → `422
OCCURRENCE_TYPE_NOT_FIELD`. Os três se repetem com uma **segunda conta** da mesma empresa — a que,
   no token, teria separador e motorista juntos — e a recusa é a mesma; nenhuma ocorrência gravada
   (`count = 0`). Limite dito: o papel vem do token (Keycloak), não do banco; o que este teste prova
   é que a guarda é do caso de uso, independente de quem chama. A política de cada rota, inalterada,
   segue provada pelos contratos de rota (`occurrences-route.contract.ts` "aceite 1",
   `me-routes.contract.ts`, `separator-role.contract.test.ts`).
2. **O mesmo id nas duas listas:** `separation + document` sai do catálogo com `moments:
['separation', 'document']`, `stage: 'separation'`, `flow: 'document'`; aparece na lista do
   separador (catálogo pelo momento `separation`, o filtro do WhatsApp do operador) e na do motorista
   (`listFieldOccurrenceTypes`) com o mesmo id; e os dois papéis o registram — duas ocorrências do
   mesmo `occurrence_type_id`, com `stage` `separation` e `delivery` (o momento de cada registro).

```text
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-moments-registration.integration.ts
 2 pass
 0 fail
```

A execução vermelha que prova que o teste não é vazio são as duas mutações da T1b.5.

### T1b.4 — CA00b: as linhas da tabela sobre dado antigo (2026-10-06)

`test/integration/occurrence-type-moments-backfill.integration.ts` (na lista `test:integration`, logo
depois da T1b.3), no molde da T1.3: banco descartável migrado → desfaz só a T1b.1 pelo próprio
`rollback.sql` → grava tipos antigos (sem a tabela) → o migrador reaplica o `migration.sql` lido do
disco. Verifica as **linhas** de `company_occurrence_type_moments`, não as listas — a leitura
tolerante devolveria os mesmos conjuntos com a tabela vazia. Sementes (a tabela do plan + um tipo
aposentado):

| Semente (`stage` + `flow`)       | Linhas esperadas     |
| -------------------------------- | -------------------- |
| `separation` + `document`        | `separation`         |
| `separation` + `stop` (D-c)      | `separation`, `stop` |
| `delivery` + `document`          | `document`, `office` |
| `delivery` + `stop`              | `stop`, `office`     |
| `delivery` + `document`, inativo | `document`, `office` |

Depois reexecuta os cinco `INSERT`s lidos do disco e confere que nenhuma linha nova nasce (`ON
CONFLICT DO NOTHING`). `separation + document` não sai de nenhuma semente (só o operador monta).

```text
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-moments-backfill.integration.ts
 1 pass
 0 fail
```

Prova de que não é vazio — o `INSERT` de `separation + stop → stop` arrancado do `migration.sql` só
para a execução (restaurado da cópia; `git status` limpo):

```text
-INSERT INTO "company_occurrence_type_moments" ("company_id", "occurrence_type_id", "moment") SELECT "company_id", "id", 'stop' FROM "company_occurrence_types" WHERE "stage" = 'separation' AND "flow" = 'stop' ...
error: expect(received).toEqual(expected)
@@ -4,3 +4,3 @@
      "separation",
-     "stop",
    ],
(fail) o backfill dos momentos sobre tipos antigos (spec 246 T1b.4, CA00b) > cada tipo antigo ganha as linhas da tabela do plan, inativo inclusive, e reexecutar não duplica [1650.17ms]
 0 pass
 1 fail
```

Sobre "nenhuma lista muda": o conteúdo de cada lista sobre esse dado é o da T1b.2 (separador =
tipos com `separation`; escritório = tipos com `office` = os `delivery` de hoje; nota do motorista =
tipos com `document` = os `delivery + document` de hoje). A única lista que muda é a do motorista
para o caso de borda `separation + stop` — ver a divergência registrada na T1b.2.

### T1b.5 — As duas mutações deixam a T1b.3 vermelha (2026-10-06)

Cada mutação foi aplicada a `acceptsOccurrenceMoment` (`src/shared/trip-occurrence.constant.ts`) só
para a execução, e o arquivo foi restaurado da cópia em seguida (`git status` limpo). Comando das
duas: `cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
./test/integration/occurrence-type-moments-registration.integration.ts`.

**(1) `includes(momento do registro)` → `moments.length > 0`** ("o tipo tem algum momento"). O
motorista registra o tipo só de galpão na rota de nota:

```text
-  return params.moments.includes(params.moment)
+  return params.moments.length > 0
error: expect(received).toEqual(expected)
- {
-   "code": "TRIP_DOCUMENT_NOT_REACHABLE",
-   "status": 409,
- }
+ "ACCEPTED"
(fail) cada registro no próprio momento, contra o Postgres (spec 246 T1b.3, CA00) > o momento que o papel não cobre não grava, com o código real — e a conta com os dois papéis recebe o mesmo [2672.46ms]
 1 pass
 1 fail
```

**(2) → "algum momento de rua"** (`document`, `stop` ou `office`). O motorista com tipo só de galpão
segue recusado (não há momento de rua), mas o separador registra o tipo só de nota no galpão:

```text
-  return params.moments.includes(params.moment)
+  return params.moments.some((moment) => moment !== OCCURRENCE_MOMENT.separation)
error: expect(received).toEqual(expected)
- {
-   "code": "OCCURRENCE_TYPE_NOT_SEPARATION",
-   "status": 422,
- }
+ "ACCEPTED"
(fail) cada registro no próprio momento, contra o Postgres (spec 246 T1b.3, CA00) > o momento que o papel não cobre não grava, com o código real — e a conta com os dois papéis recebe o mesmo [2677.69ms]
 1 pass
 1 fail
```

Restaurado: `2 pass, 0 fail`.

### T1b.6 — Tipo sem nenhum momento é recusado (API) (2026-10-06)

`assertOccurrenceMomentsAreWritable` recusa o conjunto vazio com `422
OCCURRENCE_TYPE_MOMENTS_REQUIRED` (`OccurrenceTypeMomentsRequiredError`, em
`occurrence-moment.error.ts`), antes de gravar — `PUT` com `moments: []`. Sem `moments`, o cadastro
nunca fica vazio: a criação grava o derivado de `stage`/`flow` e a edição mantém ou re-deriva
(T1b.1b). **A parte da tela** (o seletor múltiplo recusando o vazio) é a T5.3b, na Fase 5, por
escopo desta fase.

Contratos primeiro, vermelhos:

```text
$ bun test ./test/trip-occurrence/occurrence-moment.contract.ts ./test/trip-occurrence/occurrence-type-moments-write.contract.ts
(fail) o conjunto gravável (spec 246 T1b.1b) > conjunto vazio é recusado: o tipo não apareceria para ninguém (T1b.6) [0.74ms]
(fail) o cadastro grava o conjunto de momentos (spec 246 T1b.1b) > conjunto vazio é recusado antes de gravar [1.71ms]
 21 pass
 2 fail
```

Depois: `23 pass, 0 fail`; `typecheck` saída 0.

### Gates ao fechar a Fase 1b (2026-10-06, primeiro plano)

`git fetch`: nenhuma migration nova em `origin/staging` desde o começo da fase (a 246 segue no topo:
`20261006184835_occurrence_type_requirement_modes` → `20261006184901_occurrence_type_moments`).

| Gate                                                                         | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                              | sem mudanças                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bun run typecheck`                                                          | saída 0 (todas as apps)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`            | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| contrato da API (`bun --env-file=../../.env.test test --timeout 120000`)     | `9766 pass, 25 skip, 0 fail` (199 arquivos); no fim da Fase 1 eram `9727 pass, 25 skip` — os 25 pulados são anteriores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| integração, um arquivo por vez com `--env-file=../../.env.test`              | novos: `occurrence-type-moments-registration` 2/0 · `occurrence-type-moments-backfill` 1/0; tocados: `occurrence-type-requirement-modes` 1/0 · `occurrence-type-items-mode` 5/0 · `occurrence-type-leaves-document-behind` 4/0 · `occurrence-type-redelivery-policy` 2/0 · `occurrence-type-catalog-seed` 2/0 · `trip-field-authorship` 5/0 · `trip-occurrence-attachment` 6/0 · `stop-occurrence-photo` 8/0 · `whatsapp-driver-flow-actions` 4/0 · `whatsapp-operator-flow-actions` 7/0 · `trip-field-office` 25/0 · `current-driver-trip-concluded-window` 4/0 · `me-trip` 21/0 · `event-location-stamp` 23/0 · `trip-occurrence-type-items-read` 4/0 · `trip-occurrence-item-quantity` 5/0 · `trip-occurrence-correction` 8/0 · `trip-occurrence-case` 4/0 · `trip-auto-dispatch` 8/0 · `trip-detail-leaves-behind` 2/0 (pass/fail; nenhum pulado). A lista completa `test:integration` **não** foi rodada |
| `make migration-test ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432) | `129 pass, 0 fail, 0 skip` em 8 arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `bun run db:generate`                                                        | `no_changes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bun run build`                                                              | saída 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| painel: `bun run --cwd apps/frontend-transportada test`                      | `6943 pass, 0 fail` (33 arquivos) + `test:hooks` `582 pass, 0 fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| painel: `eslint .` com a app como cwd                                        | saída 0, `0 errors, 16 warnings` — todos `react-hooks/exhaustive-deps` em arquivos que esta fase não tocou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| app do motorista: `bun run --cwd apps/frontend-driver test`                  | `1198 pass, 0 fail` (sem mudança de código nesta fase)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| API: `bun run lint`                                                          | saída 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Fase 1c — Produtos e quantidade mínima viram dado

### T1c.1 — Colunas, CHECKs e rollback (2026-10-06)

Migration `20261006184909_occurrence_type_quantity_minimums` (`db:generate --name`, depois cabeçalho e
`rollback.sql` à mão). Tipo: `photo_minimum_count smallint NOT NULL DEFAULT 1` (CHECK 1..5) e
`items_minimum_count smallint` nulo (CHECK `>= 1`; CHECK `items_minimum_count IS NULL OR items_mode =
'required'`). Nas duas exceções: `items_mode varchar(16)`, `photo_minimum_count smallint` e
`items_minimum_count smallint`, **nulas e sem padrão** (D-a), com CHECKs que aceitam nulo (vocabulário
de `items_mode`; 1..5; `>= 1`; `items_minimum_count IS NULL OR coalesce(items_mode, '') = 'required'`).
Nomes das exceções sem o prefixo `company_` (<= 62 caracteres). **Sem** CHECK `off ⇒ unset` nas
exceções. Constantes `OCCURRENCE_ITEMS_MODE.required` e `OCCURRENCE_PHOTO_MINIMUM_COUNT`
(`trip-occurrence.constant.ts`).

Contrato primeiro — `test/trip-schema/occurrence-type-minimum-counts.contract.ts`, contra o schema
sem as colunas:

```text
$ bun --env-file=../../.env.test test test/trip-schema.contract.test.ts
(fail) ... > foto nasce com mínimo 1, nunca nulo; produtos nulo = todos os itens
(fail) ... > as três CHECKs do mínimo existem, nomeadas
(fail) company_occurrence_type_contractor_overrides ... > as três colunas são nulas e sem padrão
(fail) company_occurrence_type_contractor_overrides ... > as CHECKs novas cabem em 63 caracteres ...
(fail) company_occurrence_type_recipient_overrides ... > as três colunas são nulas e sem padrão
(fail) company_occurrence_type_recipient_overrides ... > as CHECKs novas cabem em 63 caracteres ...
 251 pass
 6 fail
```

Com o schema: `257 pass, 0 fail`. `bun run db:generate` → `no_changes`. Contrato estático da ordem e do
rollback (`database-migration/occurrence-type-quantity-minimums.static.contract.ts`) e asserção contra
o Postgres (`occurrence-type-quantity-minimums.assertion.ts`, no `database-migration.integration.ts`):
antes do rollback há 13 CHECKs (2 da 241 + 11 desta) e 9 colunas; depois restam só
`company_occurrence_types_items_mode_check`, `company_occurrence_types_items_off_shape_check` e
`company_occurrence_types.items_mode`; o migrador reaplica e o estado completo volta.
`make migration-test ENV_FILE=.env.test` → `131 pass, 0 fail, 0 skip`.

**Achado — ordem dos rollbacks.** A CHECK `items_minimum_shape_check` do tipo lê `items_mode`; o
`rollback.sql` da 241 (`DROP COLUMN items_mode`) a derruba junto, e reaplicar a 241 não a recria. Na
primeira execução a asserção rodava depois da da 241 e viu 12 CHECKs em vez de 13. Rollbacks valem
em ordem inversa do histórico (a 246 antes da 241, como em produção); a asserção desta migration roda
**antes** da da 241. A asserção da T1.2 passou a filtrar `items_mode` só do tipo, porque as exceções
agora também têm a coluna.

### T1c.2 — O backfill do mínimo de foto, sobre dado antigo (2026-10-06)

`migration.sql` ganhou a ordem do backfill: `photo_minimum_count` nasce **nula** no tipo, o
`UPDATE "company_occurrence_types" SET "photo_minimum_count" = 1` roda e só então a coluna vira
`DEFAULT 1 NOT NULL`, antes das CHECKs. `items_mode` do tipo não é tocado e as colunas novas das
exceções ficam nulas (herdam). `db:generate` segue `no_changes` (o estado final é o mesmo).

**Divergência declarada.** A task fala em `photo_minimum_count = 1` "onde a foto é `required`". Com a
coluna `NOT NULL DEFAULT 1` num `ADD COLUMN` só, o `UPDATE` seria um no-op e nenhuma mutação o deixaria
vermelho; por isso a coluna nasce nula e o `UPDATE` cobre **todo** tipo (para tipo não `required` o 1 é
inerte: a quantidade só é lida com foto `required`). O valor final é o mesmo do plan.

`test/integration/occurrence-type-quantity-minimums.integration.ts` (na lista `test:integration`):
banco descartável migrado, `rollback.sql` da migration nova, semeia três tipos (foto `required`,
`optional`, `off` + produtos `off`) e uma exceção de contratante e uma de destinatário, e o migrador
reaplica o `migration.sql` do disco. Verifica o **valor da coluna**: os três tipos saem com
`photo_minimum_count = 1`, `items_minimum_count` nulo e `items_mode` como estava (`optional`, `optional`,
`off`); as duas exceções, com as três colunas nulas.

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-quantity-minimums.integration.ts
 1 pass
 0 fail
```

Mutações no `migration.sql` (restaurado depois de cada uma; `git diff` limpo contra a versão do passo):

```text
(1) arrancar o UPDATE do tipo
PostgresError: column "photo_minimum_count" of relation "company_occurrence_types" contains null values
(fail) os mínimos nascem sem mudar o que já está gravado (spec 246 T1c.2) > todo tipo antigo sai com ...
 0 pass / 1 fail
(2) o UPDATE passa a gravar também "items_mode" = 'optional' no tipo
error: expect(received).toEqual(expected)   # o tipo com items_mode 'off' voltou 'optional'
 0 pass / 1 fail
(3) UPDATE extra preenchendo photo_minimum_count = 1 nas exceções de contratante
error: expect(received).toEqual(expected)   # esperado null, recebido 1
 0 pass / 1 fail
```

O contrato estático (`occurrence-type-quantity-minimums.static.contract.ts`) agora prende a ordem
`ADD COLUMN` nula → `UPDATE` → `SET DEFAULT` → `SET NOT NULL` → CHECKs e exige um único `UPDATE`:
`bun test ./test/database-migration.contract.test.ts` → `90 pass, 4 skip, 0 fail` (os 4 pulados são
anteriores: os de banco desse arquivo, cobertos no `make migration-test`).

### T1c.4 (painel) — O catálogo tolera os mínimos antes de a API mandá-los (2026-10-06)

`isOccurrenceType` (`tripResponse.validation.ts`) reprovaria a lista inteira quando o `GET` do
catálogo passar a trazer `photoMinimumCount` e `itemsMinimumCount` (guarda de chave exata).
Ausente é API anterior; `photoMinimumCount` presente só passa inteiro de 1 a 5
(`OCCURRENCE_PHOTO_MINIMUM_COUNT`, cópia por valor da API em `occurrence.constant.ts`);
`itemsMinimumCount` passa `null` (todos os itens da nota) ou inteiro `>= 1`. `itemsMode = 'required'`
já era aceito pelo vocabulário do painel (`OCCURRENCE_ITEMS_MODES`); `allowsMultipleItems` já estava
nas chaves permitidas. Conferidos e **sem mudança**: os guards da nota (`typeItemsMode`,
`typeAllowsMultipleItems`, `tripResponse.validation.ts`) e do feed (`tripOccurrenceFeedClient.service.ts`)
só dependem de `OCCURRENCE_ITEMS_MODES`, que já inclui `required`, e a T1c não acrescenta campo a essas
respostas; `apps/frontend-driver` e `apps/frontend-client` não têm guard do catálogo.

Contrato primeiro (`test/trip/occurrence-type-tolerance.contract.ts`), com o guard antigo:

```text
$ bun test ./test/trip/occurrence-type-tolerance.contract.ts
error: TRIP_RESPONSE_INVALID
(fail) tolerância ... > aceita `photoMinimumCount` e `itemsMinimumCount` da API nova, presentes ou ausentes
 11 pass
 1 fail
```

Com o guard novo: `12 pass, 0 fail`; `bun run typecheck` da app → 0 erros.

### T1c.3 — `allowsMultipleItems` no `PUT`/`GET` do catálogo (2026-10-06)

A coluna e o `GET` já existiam (`listOccurrenceTypes` devolve `allowsMultipleItems`); o que faltava para
o campo ser **do cadastro** (RF1b) era o `PUT` não o sobrescrever: `occurrence.schema.ts` tinha
`z.boolean().default(true)`, e uma edição que não tocasse o campo religava "vários produtos" num tipo
de produto único — a mesma armadilha que a 242 corrigiu em `redeliveryPolicy`. Agora é `optional()`
sem `default`: ausente é "não mexa" (o `UPDATE` omite a coluna) e a criação sem o campo usa o padrão
`true` da coluna. Escrita: `SaveOccurrenceTypeValues`, `SaveOccurrenceTypeInput` e `writeOccurrenceTypeRow`
passam a `allowsMultipleItems?: boolean | undefined`.

Contrato primeiro (`test/trip-occurrence/allows-multiple-items-write.contract.ts`), com o schema antigo:

```text
$ bun --env-file=../../.env.test test test/trip-occurrence.contract.test.ts
(fail) o cadastro do tipo grava "allowsMultipleItems" só quando ele vem (spec 246 T1c.3) > ausente fica ausente — nunca vira `true`
 388 pass
 1 fail
```

Com a mudança: `389 pass, 0 fail`. Dois testes anteriores dependiam do padrão antigo:
`item-quantity-schema.contract.ts` ("sem o campo, o padrão é true") passou a afirmar que fica ausente —
o padrão `true` é da coluna, provado no banco abaixo.

Contra o Postgres (`test/integration/occurrence-type-allows-multiple-items.integration.ts`, na lista
`test:integration`): cria com `false`, o `listOccurrenceTypes` (o `GET`) devolve `false`, regravar só o
nome preserva `false`, regravar com `true` grava, e a criação sem o campo sai `true`:

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-allows-multiple-items.integration.ts
 2 pass
 0 fail
```

Mutação — o `UPDATE` volta a gravar `allowsMultipleItems: input.allowsMultipleItems ?? true`
(restaurado em seguida):

```text
Expected: false
Received: true
(fail) "allowsMultipleItems" do tipo de ocorrência contra o Postgres (spec 246 T1c.3) > grava, o GET devolve, e ausente não altera
 1 pass / 1 fail
```

### T1c.4 (API) — Produtos obrigatório e os dois mínimos no cadastro (2026-10-06)

`occurrence.schema.ts`: `itemsMode` aceita os três modos (`DELIVERY_PROOF_FIELD_MODES`; a 241 devolvia
400 para `required`), `itemsMinimumCount` (inteiro 1..999, `null` = todos os itens, ausente = não mexa)
e `photoMinimumCount` (inteiro 1..5, sem `null`, ausente = não mexa); vocabulário fora disso segue 400.
`saveOccurrenceTypeWithTemplate` valida o estado **resultante**: `itemsMinimumCount` sem
`itemsMode = 'required'` é `OccurrenceTypeItemsMinimumRequiresRequiredError` (`422`,
`OCCURRENCE_TYPE_ITEMS_MINIMUM_REQUIRES_REQUIRED`, `trip.error.ts`), lendo o gravado quando o campo
vem ausente — então `PUT { itemsMode: 'optional' }` sobre um tipo `required` com mínimo 3 é recusado, e
sair de `required` exige mandar `itemsMinimumCount: null`. A guarda `off` + política da 241 e o
`OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` do registro seguem como estavam (as duas contratos da 241 passam).
A forma mora em `domain/occurrence-items-shape.policy.ts` (a guarda `off` da 241 foi para lá, para o
caso de uso ficar abaixo de 200 linhas). A escrita (`writeOccurrenceTypeRow`) omite os dois mínimos
quando ausentes — nenhum `?? 'x'` no `UPDATE` (lição da 242) — e a CHECK
`company_occurrence_types_items_minimum_shape_check`, atingida numa corrida, vira o mesmo 422
(`OCCURRENCE_TYPE_ITEMS_MINIMUM_SHAPE_CHECK`). `findOccurrenceType`, `listOccurrenceTypes` (o `GET`) e a
resposta do `PUT` devolvem `itemsMinimumCount` e `photoMinimumCount`.

**Defeito achado na 1b e corrigido aqui — o `PUT` perdia `moments`.** `main.ts` montava os `values` do
caso de uso campo a campo e **não repassava `moments`**: o campo passava na fronteira (`occurrence.schema.ts`)
e no caso de uso, e sumia na composição, sem erro. A composição agora usa
`toSaveOccurrenceTypeValues` (`save-occurrence-type-values.mapper.ts`), com contrato que preenche todo
campo do `PUT` e exige igualdade. (`moments` ainda não tem teste de ponta a ponta pelo HTTP real; o
mapeador é o que o prende.)

Contrato primeiro (`test/trip-occurrence/items-minimum-count-write.contract.ts`, mais o ajuste de
`items-mode-type-write.contract.ts`: "`required` volta 400" virou "`required` é aceito"), com o `src` de
`HEAD`:

```text
$ bun --env-file=../../.env.test test test/trip-occurrence.contract.test.ts   # src sem a T1c.4
(fail) ... itemsMode required é aceito
(fail) ... itemsMinimumCount 2 é aceito (nulo = todos os itens)
(fail) ... itemsMinimumCount null é aceito (nulo = todos os itens)
(fail) ... photoMinimumCount 1 / 3 / 5 é aceito
(fail) ... optional com mínimo no corpo: 422 com código estável e nada gravado
(fail) ... off com mínimo no corpo: 422 ...
(fail) ... mínimo no corpo e modo ausente sobre tipo gravado optional: 422 ...
(fail) ... modo optional no corpo, mínimo ausente e mínimo gravado: 422 ...
(fail) ... mínimo no corpo sem tipo gravado: 422 ...
 409 pass
 13 fail
```

Com a implementação: `422 pass, 0 fail`; `bun run typecheck` e `bun run lint` da API saem 0.

Contra o Postgres (`test/integration/occurrence-type-minimum-counts.integration.ts`, na lista
`test:integration`): grava `required` + mínimo 2 + foto 3, o `GET` devolve, regravar só o nome preserva os
três, `null` grava "todos os itens", criação sem os campos sai foto 1 e produtos nulo; o caso de uso
lê o gravado (sair de `required` sem zerar o mínimo é 422 e nada muda; com `itemsMinimumCount: null`
grava); e a corrida cai na CHECK, traduzida no mesmo 422.

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-minimum-counts.integration.ts
 4 pass
 0 fail
```

Mutações (restauradas depois de cada uma):

```text
(1) o UPDATE grava `itemsMinimumCount: input.itemsMinimumCount ?? null`
Expected: 2 / Received: null
(fail) ... > grava, o GET devolve, e ausente não altera nenhum dos dois   (3 pass / 1 fail)
(2) sem a tradução da CHECK da forma em `rethrowItemsOffShapeViolation`
Expected constructor: [class OccurrenceTypeItemsMinimumRequiresRequiredError ...]
(fail) ... > na corrida, a CHECK da forma vira o mesmo 422 e nada é gravado   (3 pass / 1 fail)
(3) `assertItemsMinimumMatchesMode({ stored: null, values })` — o gravado ignorado
integração: 4 pass / 0 fail (a CHECK do banco ainda segura e traduz) — o contrato pega:
(fail) ... > modo optional no corpo, mínimo ausente e mínimo gravado: 422 ...
(fail) ... > mínimo no corpo com o tipo gravado required (modo ausente) grava
 420 pass / 2 fail
```

### Gates ao fechar a Fase 1c (2026-10-06, primeiro plano)

| Gate                                                                         | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                              | sem mudanças                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `bun run typecheck`                                                          | saída 0 (todas as apps)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`            | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| contrato da API (`bun --env-file=../../.env.test test --timeout 120000`)     | `9812 pass, 25 skip, 0 fail` (199 arquivos); no fim da Fase 1b eram `9766 pass, 25 skip` — os 25 pulados são anteriores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| integração, um arquivo por vez com `--env-file=../../.env.test`              | novos: `occurrence-type-quantity-minimums` 1/0 · `occurrence-type-allows-multiple-items` 2/0 · `occurrence-type-minimum-counts` 4/0; tocados: `occurrence-type-requirement-modes` 1/0 · `occurrence-type-items-mode` 5/0 · `occurrence-type-leaves-document-behind` 4/0 · `occurrence-type-redelivery-policy` 2/0 · `occurrence-type-catalog-seed` 2/0 · `occurrence-type-moments-registration` 2/0 · `occurrence-type-moments-backfill` 1/0 · `trip-occurrence-type-items-read` 4/0 · `trip-occurrence-item-quantity` 5/0 · `trip-occurrence-attachment` 6/0 · `stop-occurrence-photo` 8/0 · `trip-field-authorship` 5/0 · `trip-field-office` 25/0 · `me-trip` 21/0 (pass/fail; nenhum pulado). A lista completa `test:integration` **não** foi rodada |
| `make migration-test ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432) | `131 pass, 0 fail, 0 skip` em 8 arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `bun run db:generate`                                                        | `no_changes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `bun run build`                                                              | saída 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| API: `bun run lint`                                                          | saída 0 (`--max-warnings=0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| painel: `bun run --cwd apps/frontend-transportada test`                      | `6945 pass, 0 fail` (33 arquivos) + `test:hooks` `582 pass, 0 fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| painel: `eslint .` com a app como cwd                                        | `0 errors, 16 warnings` — todos `react-hooks/exhaustive-deps` em arquivos que esta fase não tocou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| app do motorista: `bun run --cwd apps/frontend-driver test`                  | `1198 pass, 0 fail` (sem mudança de código nesta fase)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Fase 1d — A foto da rua guarda N anexos

### T1d.0 — Medição em produção: **pendente, pede autorização do usuário** (2026-10-06)

Não executada. É leitura em produção (banco Postgres-Hqfu) e exige autorização explícita do usuário;
é a parada obrigatória antes de aplicar a T1d.2 em produção. A consulta que será rodada, só leitura:

```sql
SELECT
  count(*) FILTER (WHERE o.attachment_object_id IS NOT NULL) AS with_column,
  count(*) FILTER (
    WHERE o.attachment_object_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM trip_document_occurrence_attachments a
        WHERE a.company_id = o.company_id AND a.occurrence_id = o.id)
  ) AS with_both_sources,                                   -- esperado 0
  count(DISTINCT o.attachment_object_id) AS distinct_objects -- < with_column = objeto do lote em N
FROM trip_document_occurrences o;
```

### T1d.1 — A leitura existente presa por contrato (2026-10-06)

A leitura "linha nova, senão coluna antiga" existe desde a 161 T10 e **não mudou**: o feed
(`listDocumentOccurrenceAttachmentLocations`, `trip-occurrence-feed.query.ts:781-877`), o painel
(`resolveOccurrenceAttachmentRecords`, `occurrence-attachment.service.ts:107-123`), a contagem da linha
do tempo da viagem (`trip-timeline-document.query.ts:72-87`) e os eventos de foto da linha do tempo da
ocorrência (`listPhotoSources`, `trip-occurrence-timeline.query.ts:52-93`). Os testes da 161 cobriam
cada fonte sozinha, numa ocorrência de galpão; faltava a ocorrência de **rua** com **as duas fontes**
— o estado que o backfill e a escrita dupla criam.

`test/integration/street-occurrence-attachment-read.integration.ts` (na lista `test:integration`,
sementes em `test/fixtures/street-occurrence-attachment.fixture.ts`), três casos sobre uma ocorrência
`stage = 'delivery'`, cada um pelas quatro leituras:

| Semente                     | Feed / painel                | Contagem da viagem | Evento de foto da ocorrência |
| --------------------------- | ---------------------------- | ------------------ | ---------------------------- |
| só a coluna                 | 1 item, **id da ocorrência** | 1                  | id e hora **da ocorrência**  |
| coluna + linha na posição 1 | 1 item, **id da linha**      | 1                  | id e hora **da linha**       |
| sem coluna e sem linha      | nenhum                       | 0                  | nenhum                       |

**Mudança conhecida, registrada aqui e coberta pelo segundo caso:** quando a linha passa a existir, o
id do anexo deixa de ser o id da ocorrência e passa a ser o id da linha, no feed, no painel e na linha
do tempo da ocorrência; a hora do evento de foto passa a ser o `created_at` da linha — por isso o
backfill copia `o.created_at` (T1d.2).

```text
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/street-occurrence-attachment-read.integration.ts
 3 pass
 0 fail
```

O contrato prende o que existe, então nasce verde. Prova de que não é vazio — duas mutações,
restauradas em seguida (`git status` só com os arquivos novos):

```text
(1) feed: `if (newRows.length > 0)` → `if (newRows.length > 99)` (a coluna vence a linha)
-     "91cc9c31-01f4-404b-82ba-a503a944de0c",
+     "51b2930f-e182-4498-96b1-059f96b41667",
(fail) ... > coluna e linha: só a linha, uma vez — o id e a hora passam a ser os da linha
 2 pass / 1 fail
(2) painel: com linha, soma também a coluna antiga
+   "9fdfba6b-8205-4379-886b-ecb8b604c31c",
(fail) ... > coluna e linha: só a linha, uma vez — o id e a hora passam a ser os da linha
 2 pass / 1 fail
```

### T1d.2 🧠 — Migration própria do backfill (2026-10-06)

`bun run db:generate --custom --name street_occurrence_attachment_backfill` →
`drizzle/20261006184921_street_occurrence_attachment_backfill/` (migration vazia + `snapshot.json`).
`migration.sql`, sob um cabeçalho que diz o porquê de cada cláusula e o deploy separado:

```sql
INSERT INTO "trip_document_occurrence_attachments"
  ("company_id", "occurrence_id", "stored_object_id", "thumbnail_object_id", "position", "created_at")
SELECT o."company_id", o."id", o."attachment_object_id", NULL, 1, o."created_at"
FROM "trip_document_occurrences" o
WHERE o."attachment_object_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "trip_document_occurrence_attachments" a
    WHERE a."company_id" = o."company_id" AND a."occurrence_id" = o."id"
  )
ON CONFLICT ON CONSTRAINT "trip_document_occurrence_attachments_unique_position" DO NOTHING;
```

Nomes conferidos no schema: `trip_document_occurrence_attachments_unique_position` é o `UNIQUE
(company_id, occurrence_id, position)` (`trip.schema.ts:2414`); a tabela não tem `retention_until`
(está em `stored_objects`). `attachment_object_id` não é tocada. `rollback.sql`: `BEGIN` → `DELETE`
do journal pelo nome, `ROW_COUNT <> 1 → RAISE` → `COMMIT`; **não apaga linha**, com a justificativa no
cabeçalho (não se distingue a linha do backfill da escrita dupla; ficar não muda a leitura; reaplicar
não duplica).

Contrato primeiro — `test/database-migration/street-occurrence-attachment-backfill.static.contract.ts`
(registrado em `test/database-migration.contract.test.ts`; a pasta entrou na lista de
`static-migration.contract.ts`), contra a migration vazia do `--custom`:

```text
$ bun test ./test/database-migration/street-occurrence-attachment-backfill.static.contract.ts
error: expect(received).toContain(expected)
(fail) ... > um INSERT ... SELECT só, com a hora da ocorrência, sem duplicar e sem tocar a coluna
ENOENT: no such file or directory, open '.../20261006184921_street_occurrence_attachment_backfill/rollback.sql'
(fail) ... > o rollback só tira o registro do journal, conferindo que tirou um
 0 pass
 2 fail
```

Depois: `bun --env-file=../../.env.test test ./test/database-migration.contract.test.ts` → `92 pass, 4
skip, 0 fail` (os 4 pulados são anteriores, de banco, cobertos no `migration-test`); `bun run
db:generate` → `no_changes`; `make migration-test ENV_FILE=.env.test` → `133 pass, 0 fail` em 8
arquivos.

**Expurgo — caminho confirmado.** A spec citava `drizzle-occurrence-attachment-purge-gateway.ts` sem
pasta: ele está no **worker**,
`apps/worker-transportada/src/trip-occurrence-attachment-purge/infrastructure/drizzle-occurrence-attachment-purge-gateway.ts:24-36`
(`findAttachmentByObjectId`, `or(stored_object_id, thumbnail_object_id)`, `limit(1)`). Os candidatos
(`drizzle-trip-occurrence-attachment-purge.repository.ts:23-34`) são só objetos
`trip_occurrence_attachment`/`trip_occurrence_thumbnail` com `retention_until` vencida.

**Um objeto servindo N ocorrências** (documentado em `plan.md` § T1d.2, não resolvido aqui):

- Lote do escritório: o objeto é `delivery_proof` **sem** `retention_until`
  (`drizzle-office-occurrence-batch.repository.ts:120-131`) — nunca é candidato do expurgo. Vira N
  linhas com o mesmo `stored_object_id`, inofensivas para o expurgo.
- Achado do architect: o mesmo **upload do motorista** (`trip_occurrence_attachment`) pode ser
  referenciado por duas ocorrências — `findConfirmedUpload` (`drizzle-occurrence-upload.repository.ts:133-157`)
  não o consome. Vira duas linhas; o expurgo apaga os bytes, **uma** linha e marca o objeto
  `deleted`; a outra fica apontando para objeto `deleted`, lida como `expired` — o que a coluna já
  mostrava. Não é regressão; é uma linha morta por ocorrência extra. Coberto na T1d.3 (semente f).

**Validação por `architect` (opus, só leitura) sobre o SQL final: APROVADO.** Nenhum caminho para FK,
CHECK ou unique falharem (a FK de origem `trip_document_occurrences_company_object_fk` foi criada
validada; a miniatura vai nula; a posição é a constante 1; o `NOT EXISTS` usa
`..._company_occurrence_idx`); rollback seguro, reaplicação converge; o lock é `ROW EXCLUSIVE` nos
anexos e `ACCESS SHARE` nas ocorrências, conflito real só com o `FOR UPDATE SKIP LOCKED` do expurgo
(converge). **Condição de publicação obrigatória**, registrada no `plan.md`: a T1.2 ainda não está em
`origin/staging` nem em `origin/main`; o migrador aplica as pendentes numa transação só, então a
T1.2 tem de estar aplicada (journal de staging e produção) **antes** de esta pasta entrar em qualquer
push. Nada no código garante isso. Recomendações acatadas: semente (f) na T1d.3; a janela entre o
backfill e a escrita dupla documentada no `plan.md` (reaplicar o mesmo SQL antes de remover a leitura
da coluna).

### T1d.3 — O backfill sobre dado antigo, verificado nas linhas (2026-10-06)

`test/integration/street-occurrence-attachment-backfill.integration.ts` (na lista `test:integration`;
sementes em `test/fixtures/street-occurrence-backfill-scenario.fixture.ts`). O banco descartável nasce
migrado, o `rollback.sql` da T1d.2 tira o journal, as sementes são gravadas, e o migrador reaplica o
`migration.sql` lido do disco. Cada semente tem data própria e antiga (1 a 11/09), para que `now()` no
lugar de `o.created_at` nunca passe.

| Semente                                                       | Linhas esperadas depois do backfill                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| (a) rua, coluna, sem linha                                    | 1 linha, posição 1, o objeto da coluna, data da ocorr.                      |
| (b) rua, coluna + linha só na posição 2                       | só a linha 2 que já existia (nenhuma na posição 1)                          |
| (c) galpão, duas linhas, sem coluna                           | as duas, intocadas                                                          |
| (d) lote: um objeto `delivery_proof` em três ocorrências      | 3 linhas, o mesmo `stored_object_id`, cada uma com a data da sua ocorrência |
| (e) rua sem foto                                              | nenhuma                                                                     |
| (f) mesmo upload do motorista em duas ocorrências (architect) | 2 linhas, o mesmo `stored_object_id`                                        |

Afirma a lista **exata** das linhas da empresa (`toEqual` + `toHaveLength(9)`), que o feed
(`listTripOccurrenceAttachmentLocations`) e o painel (`readOccurrenceAttachments`) devolvem
**exatamente uma** foto em (a) e (b), e que tirar o journal e reaplicar dá a mesma contagem.

```text
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/street-occurrence-attachment-backfill.integration.ts
 1 pass
 0 fail
```

O vermelho de "antes da T1d.2" é a mutação (1) da T1d.4 — a migration sem o `INSERT` é o estado de
antes do backfill.

### T1d.4 — As três mutações deixam a T1d.3 vermelha (2026-10-06)

Cada mutação foi aplicada ao `migration.sql` da T1d.2 só para a execução e restaurada da cópia em
seguida (`cmp` igual; a execução restaurada dá `1 pass, 0 fail`). Comando:
`cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000 ./test/integration/street-occurrence-attachment-backfill.integration.ts`.

```text
(1) arrancar o INSERT (migration.sql vira `SELECT 1;`) — somem as linhas de (a), (d) e (f)
- Expected  - 36
+ Received  + 0
(fail) a foto antiga da rua ganha a linha da 161 (spec 246 T1d.3) > as cinco sementes saem com as linhas certas, a hora da ocorrência, e reexecutar não duplica
 0 pass / 1 fail

(2) tirar o NOT EXISTS — (b) ganha a posição 1 ao lado da 2: duas fotos
- Expected  - 0
+ Received  + 6
+     "createdAt": 2026-09-02T10:00:00.000Z,      # a data de (b), na posição 1
(fail) ... > as cinco sementes saem com as linhas certas, a hora da ocorrência, e reexecutar não duplica
 0 pass / 1 fail

(3) tirar `o.created_at` (coluna e valor) — a linha nasce com a hora do deploy
- Expected  - 13
+ Received  + 13
+     "createdAt": 2026-10-06T13:17:12.978Z,
(fail) ... > as cinco sementes saem com as linhas certas, a hora da ocorrência, e reexecutar não duplica
 0 pass / 1 fail
```

### T1d.5 — Escrita dupla da foto de rua e o mínimo de fotos (2026-10-06)

**Escrita dupla.** `saveTripOccurrence` (`delivery-proof-read.support.ts`), a escrita comum da nota do
motorista (`saveDocumentOccurrence`) e do lote do escritório, grava a coluna `attachment_object_id`
como antes e, quando ela vem preenchida, a linha de `trip_document_occurrence_attachments` na mesma
transação (`mirrorStreetOccurrenceAttachment`, `street-occurrence-attachment.persistence.ts`): posição
1, sem miniatura, `created_at` da ocorrência. O galpão passa `attachmentObjectId` ausente e segue
gravando as próprias linhas (161). O **lote** usa o próprio objeto `delivery_proof`, o mesmo nas N
notas — nenhum objeto `trip_occurrence_attachment` nasce por ele. A assinatura **não** passa por aqui:
não há escritor de `signature_object_id` nesta fase (T2.4), e a T1d.6 prova que ela não aparece como
foto. Comentário da tabela em `trip.schema.ts` corrigido ("nunca é escrita por aquele canal" deixou de
valer).

**Mínimo de fotos (RF8).** `assertDriverOccurrencePhotoRequirement`
(`domain/occurrence-photo-requirement.policy.ts`) reúne a regra que estava inline no caso de uso
(observação e anexo obrigatórios com foto `required`, 179) e acrescenta: com a foto `required`, a
quantidade de anexos abaixo de `photoMinimumCount` é `TripOccurrencePhotoMinimumNotMetError` (`422
TRIP_OCCURRENCE_PHOTO_MINIMUM_NOT_MET`, `trip.error.ts`). Com a foto opcional ou desligada o mínimo
não é lido. `register-driver-occurrence.use-case.ts` caiu de 216 para 208 linhas.

⚠️ **Lacuna registrada (não é divergência do plan, é algo que nenhuma task cobre):** a rota do
motorista leva **um** anexo só (`attachmentObjectId`). Um tipo com `photo_minimum_count > 1` fica
irregistrável pela rota até ela aceitar N anexos — nenhuma task da spec acrescenta isso (a T4.1b só
bloqueia o botão no app). Hoje o mínimo só sobe acima de 1 pelo `PUT` da API (o painel não o expõe
antes da Fase 5).

Contrato primeiro — `test/trip-occurrence/photo-minimum-guard.contract.ts` (registrado em
`test/trip-occurrence.contract.test.ts`) e a integração
`test/integration/street-occurrence-attachment-write.integration.ts` (na lista `test:integration`;
registro pelo caminho real em `test/fixtures/street-occurrence-registration.fixture.ts`), antes da
implementação:

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence/photo-minimum-guard.contract.ts
SyntaxError: Export named 'TripOccurrencePhotoMinimumNotMetError' not found in module '.../src/trips/domain/trip.error.ts'.
 0 pass
 1 fail
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/street-occurrence-attachment-write.integration.ts
- Expected  - 9
+ Received  + 1
(fail) ... > motorista com upload: coluna e linha; sem foto, nenhuma linha
Expected length: 2
Received length: 0
(fail) ... > lote do escritório: o mesmo objeto do lote, uma linha por nota
 0 pass
 2 fail
```

Depois: `bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts` → `425 pass, 0
fail`; `street-occurrence-attachment-write` → `2 pass, 0 fail`; `bun run typecheck` 0 erros;
`db:generate` → `no_changes`. Integrações tocadas, uma por vez: `trip-field-authorship` 5/0 ·
`trip-field-office` 25/0 · `trip-occurrence-attachment` 6/0 · `trip-occurrence-timeline` 3/0 ·
`trip-occurrence-feed-document` 6/0 · `trip-occurrence-feed-case` 2/0 · `trip-occurrence-correction`
8/0 · `trip-occurrence-correction-read` 8/0 · `extra-charge-batch-statement` 2/0 · `trip-timeline` 45/0 ·
`occurrence-type-moments-registration` 2/0 (pass/fail, nenhum pulado).

### T1d.6 — O demonstrativo e a correção mostram a foto de rua, nunca a assinatura (2026-10-06)

Os dois leitores só conhecem a tabela da 161 e **não mudaram de código**: o demonstrativo ao cliente
(`DrizzleOccurrenceStatementRepository.loadPhotos`, `drizzle-occurrence-statement.repository.ts:251-325`)
e a resposta da correção (`readOccurrenceView`, `drizzle-occurrence-correction.repository.ts:312-324`).
Passam a mostrar a foto de rua porque a escrita dupla (T1d.5) grava a linha, e o backfill (T1d.2)
grava a das ocorrências antigas — **depois** que a T1d.2 for aplicada. Antes dela, ocorrência antiga
só com a coluna continua sem foto nesses dois leitores, como hoje (não é regressão). A assinatura fica
em `signature_object_id`, que nenhum dos dois lê.

`test/integration/street-occurrence-photo-statement.integration.ts` (na lista `test:integration`): o
motorista registra uma ocorrência de rua com foto pelo caminho real; uma assinatura é gravada na coluna
`signature_object_id` da mesma ocorrência; uma cobrança dessa ocorrência é fechada num lote pelo
`createExtraChargeBatchesUseCase`. O demonstrativo (`listChargeRows`) traz `photoCount = 1` e a chave
do objeto **da foto**; a correção (`readOccurrenceView`) traz um anexo, posição 1, com o **id da
linha** (não o da ocorrência — a mudança de id registrada na T1d.1).

Contrato primeiro, rodado antes da T1d.5:

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/street-occurrence-photo-statement.integration.ts
error: expect(received).toBe(expected)
Expected: 1
Received: 0
(fail) o demonstrativo e a correção mostram a foto de rua, nunca a assinatura (spec 246 T1d.6) > uma foto no demonstrativo e na correção, com a assinatura gravada ao lado
 0 pass
 1 fail
```

Depois da T1d.5: `1 pass, 0 fail`.

**Leitores que passam a mostrar a foto de rua** (com a linha gravada): o demonstrativo de ocorrências
ao cliente (PDF do lote) e a resposta da correção/cancelamento da ocorrência. Os que **já** a mostravam
pela coluna e agora a mostram pela linha (mesma foto, id e hora da linha): o feed de ocorrências
(`GET` dos anexos), o painel (`readOccurrenceAttachments`), a contagem da linha do tempo da viagem e o
evento de foto da linha do tempo da ocorrência.

### Gates ao fechar a Fase 1d (2026-10-06, primeiro plano)

| Gate                                                                         | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                              | sem mudanças                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `bun run typecheck`                                                          | saída 0 (todas as apps)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`            | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| contrato da API (`bun --env-file=../../.env.test test --timeout 120000`)     | `9817 pass, 25 skip, 0 fail` (199 arquivos); no fim da Fase 1c eram `9812 pass, 25 skip` — os 25 pulados são anteriores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| API: `bun run lint`                                                          | saída 0 (`--max-warnings=0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| integração, um arquivo por vez com `--env-file=../../.env.test`              | novos: `street-occurrence-attachment-read` 3/0 · `street-occurrence-attachment-backfill` 1/0 · `street-occurrence-attachment-write` 2/0 · `street-occurrence-photo-statement` 1/0; tocados: `trip-field-authorship` 5/0 · `trip-field-office` 25/0 · `trip-occurrence-attachment` 6/0 · `trip-occurrence-timeline` 3/0 · `trip-occurrence-feed-document` 6/0 · `trip-occurrence-feed-case` 2/0 · `trip-occurrence-correction` 8/0 · `trip-occurrence-correction-read` 8/0 · `extra-charge-batch-statement` 2/0 · `trip-timeline` 45/0 · `occurrence-type-moments-registration` 2/0 · `me-trip` 21/0 · `stop-occurrence-photo` 8/0 · `event-location-stamp` 23/0 · `whatsapp-driver-flow-actions` 4/0 · `trip-occurrence-upload-confirm` 3/0 + 1 pulado (anterior: depende do MinIO, arquivo não tocado). A lista completa `test:integration` **não** foi rodada |
| `make migration-test ENV_FILE=.env.test` (Postgres de teste 127.0.0.1:65432) | `133 pass, 0 fail` em 8 arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `bun run db:generate`                                                        | `no_changes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `bun run build`                                                              | saída 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| worker / painel                                                              | não tocados nesta fase (nenhum arquivo de `apps/worker-transportada` nem `apps/frontend-*` mudou); suítes não rodadas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Pendente: **T1d.0** (medição em produção, pede autorização) e a **ordem de publicação** — a T1.2
aplicada em staging e produção antes de a pasta `20261006184921_street_occurrence_attachment_backfill`
entrar em qualquer push (plan § T1d.2).

## Fase 2 — A API resolve e cobra os campos do tipo

### Painel e app tolerantes antes da API (ADR-0081 §9, 2026-10-06)

Commits separados e **anteriores** a qualquer mudança de formato da API.

- **Painel** (`e06efb55a`): o guard de `GET /trips/occurrence-types/field` (`isFieldOccurrenceType`,
  `hasKeys`) aceitava só `id`, `name` e `attachmentMode` — e a API **já mandava** `flow`, `itemsMode` e
  `stopKind`: o diálogo de ocorrência de nota do escritório já recusava a resposta inteira
  (`TRIP_RESPONSE_INVALID`), defeito anterior a esta spec. Agora aceita, ausentes ou presentes, `flow`,
  `itemsMode`, `stopKind`, `photoMode`, `noteMode`, `signatureMode`, `photoMinimumCount` e
  `itemsMinimumCount`; o catálogo aceita `noteMode`/`signatureMode`; a verificação aceita os campos
  resolvidos e `sources` (`hasKeys` no lugar de `hasExactKeys`). Valor fora do vocabulário continua
  reprovando. Contrato: `test/trip/occurrence-requirement-modes-tolerance.contract.ts`. Vermelho antes
  do guard (`git checkout` do `src`):

```text
$ bun test ./test/trip/occurrence-requirement-modes-tolerance.contract.ts
error: TRIP_RESPONSE_INVALID
      at occurrenceTypesFromApi (.../tripResponse.validation.ts:1075:82)
(fail) o catálogo tolera noteMode e signatureMode (spec 246 T2.4) > aceita presentes ou ausentes
(fail) a verificação tolera os campos resolvidos e as camadas (spec 246 RF12) > aceita a forma anterior e a nova, com a camada de cada campo
 4 pass
 3 fail
```

Depois: `7 pass, 0 fail`; `bun run test` do painel `582 pass, 0 fail`; `bun run typecheck` e
`bun run lint` (0 erros; 16 avisos anteriores).

- **App do motorista** (`b1f8b22e3`): `isDriverOccurrenceType` já ignora chave a mais; o contrato
  passou a prender isso para os campos novos (`bun test test/driver-trip.contract.test.ts` → `1079 pass,
0 fail`). Nenhuma mudança de código.

### T2.1 + T2.2 — A projeção resolve os seis campos, campo a campo (2026-10-06)

Um commit só para as duas (o contrato da T2.1 só passa com a implementação da T2.2; o vermelho está
registrado abaixo). `resolveOccurrenceRequirements`
(`src/trips/domain/occurrence-requirements.policy.ts`) aplica `resolveWithOverrides` a cada campo e
marca a camada de onde veio; é a **única** resolução — `resolveFieldOccurrenceTypes` (snapshot,
`drizzle-current-driver-trip.repository.ts`), `listFieldOccurrenceTypes` (rota do motorista e do
escritório) e `readSettingsResolution` (verificação, RF12) chamam o mesmo. O par `itemsMode` +
`itemsMinimumCount` herda junto.

**Formato novo.** Em `GET /me/trips/current/occurrence-types`, `GET /trips/occurrence-types/field`
e em `document.occurrenceTypes` do snapshot (`GET /me/trips/current`), cada tipo passa a trazer, além de
`attachmentMode`/`flow`/`id`/`itemsMode`/`name`/`stopKind`: `photoMode` (igual a `attachmentMode`, que
fica por um ciclo), `noteMode`, `signatureMode`, `photoMinimumCount` (1..5) e `itemsMinimumCount`
(número ou `null` = todos os itens). Em `GET /company-settings/settings-resolution`, cada tipo traz os
mesmos seis campos e `sources` (`photoMode`, `noteMode`, `signatureMode`, `itemsMode`, `itemsMinimumCount`,
`photoMinimumCount` → `type | contractor | recipient | default`).

Contrato primeiro (`test/trip-occurrence/requirement-modes-resolution.contract.ts`,
`.../settings-resolution-requirements.contract.ts`, registrados em `test/trip-occurrence.contract.test.ts`):

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence/requirement-modes-resolution.contract.ts
SyntaxError: Export named 'listFieldOccurrenceTypeResolutions' not found in module '.../list-field-occurrence-types.use-case.ts'.
 0 pass
 1 fail
 1 error
$ bun --env-file=../../.env.test test ./test/trip-occurrence/settings-resolution-requirements.contract.ts
(fail) a verificação devolve os campos resolvidos e a camada de cada um (spec 246 RF12) > sem exceção, tudo vem do tipo
(fail) a verificação devolve os campos resolvidos e a camada de cada um (spec 246 RF12) > exceção do destinatário e do contratante: cada campo diz quem o decidiu
 0 pass
 2 fail
```

Depois: `requirement-modes-resolution` `11 pass, 0 fail`; `settings-resolution-requirements` `2 pass`;
`settings-resolution.contract.test.ts` `8 pass`; contrato da API inteiro `9830 pass, 25 skip, 0 fail`
(199 arquivos); `bun run typecheck` 0 erros; `bun run lint` (`--max-warnings=0`) 0; integração
`me-trip` `21 pass, 0 fail` (exceção por contratante no snapshot) e
`test/driver-trip/office-field-occurrences.contract.ts` `24 pass`. Os literais de tipo resolvido dos
contratos antigos passaram a usar `test/fixtures/field-occurrence-type.fixture.ts`.

⚠️ **A foto da exceção segue declarada.** `attachment_mode` das duas tabelas de exceção é `NOT NULL`
(spec 218) e nenhuma fase anterior o afrouxou; a resolução já trata `null`/ausente como herda, mas a
tela da Fase 5 ("Igual ao tipo" também para a foto) pede uma migration que **não** está nesta fase.

### T2.3 — O registro do motorista cobra os modos efetivos da nota (2026-10-06)

`registerDriverOccurrence` deixou de ler o `attachmentMode` do tipo e de arrastar a observação junto
com a foto. Agora:

1. `findReachableDocument` devolve, além de `tripId`, o **contratante** (emitente cadastrado) e o
   **CNPJ do destinatário da nota** (`driver-reachable-document.query.ts`, a consulta que já estreita a
   nota à viagem do motorista, movida para arquivo próprio; mesma junção do snapshot). Nada vem do
   corpo do pedido (D-b, `security.md` §3).
2. `resolveDocumentOccurrenceRequirements` lê as exceções **do tipo** numa consulta só
   (`findOccurrenceTypeOverrides`, injetada em `main.ts` nos dois pontos que montam o caso de uso: o
   app e o WhatsApp) e chama `resolveFieldOccurrenceTypeResolutions` — a mesma função do snapshot.
3. `assertDriverOccurrenceRequirements` (`occurrence-requirement-guard.policy.ts`, no lugar de
   `occurrence-photo-requirement.policy.ts`) cobra cada campo pelo próprio modo: observação `required`
   → texto; foto `required` → ao menos um anexo e `photoMinimumCount`; assinatura `required` → a
   referência. Erro estável novo em `trip.error.ts`: `TripOccurrenceSignatureRequiredError`
   (`422 TRIP_OCCURRENCE_SIGNATURE_REQUIRED`). O `if (attachmentMode === 'required')` com a nota
   embutida sumiu.
4. `signatureObjectId` entra no caso de uso (presença; a conferência contra empresa/viagem/motorista e a
   gravação são a T2.4).

Contrato primeiro (`test/trip-occurrence/requirement-modes-registration.contract.ts`, registrado em
`trip-occurrence.contract.test.ts`):

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence/requirement-modes-registration.contract.ts
SyntaxError: Export named 'TripOccurrenceSignatureRequiredError' not found in module '.../trips/domain/trip.error.ts'.
 0 pass
 1 fail
```

Depois: `10 pass, 0 fail` (observação sem foto, foto sem observação, assinatura obrigatória/opcional/
desligada, exceção do destinatário mais estrita, outro destinatário, exceção do contratante que
afrouxa, destinatário vence contratante, tipo sem exceção). Um contrato de composição prende a fiação
(`test/composition/occurrence-overrides-wiring.contract.ts`): a porta é opcional para os dublês, então
esquecê-la em `main.ts` não dá erro de tipo — os dois pontos do `registerDriverOccurrence` têm de
injetá-la. Contratos antigos que dependiam da regra fixa (`driver.contract.ts`, e
`trip-field-authorship.integration.ts`, que passou a gravar `noteMode: 'required'` no tipo) agora
declaram o dado. Contrato da API inteiro: `9843 pass, 25 skip, 0 fail`.

**Efeito declarado (RF6).** A partir daqui o servidor, no registro do motorista, cobra a exigência
**efetiva da nota**: exceção menos estrita que o tipo afrouxa e mais estrita endurece. **A ativação em
produção só depois da medição T3.0, que está PENDENTE** (pede autorização do usuário; não foi executada).

### T2.3b — A observação obrigatória sobrevive à migration, no comportamento (2026-10-06)

`test/integration/occurrence-requirement-modes-registration.integration.ts` (na lista
`test:integration` do `package.json`), no molde da T1.3: o banco descartável nasce migrado, desfaz só a
T1.2 pelo `rollback.sql`, recebe um tipo com foto `required` **sem** as colunas novas, e o migrador
reaplica o `migration.sql` lido do disco. O registro sem nota, com o upload confirmado, volta
`TRIP_OCCURRENCE_NOTE_REQUIRED`; com a nota, grava. O segundo caso do arquivo prova a exceção pelo
caminho real (contratante e destinatário lidos da nota no banco): destinatário mais estrito endurece
foto e observação, outro destinatário volta ao tipo, exceção do contratante afrouxa um tipo obrigatório,
destinatário vence contratante **campo a campo** (a observação, nula no destinatário, herda a do
contratante, não a do tipo).

Mutação 1 — tirar o `UPDATE company_occurrence_types SET note_mode = 'required'` do `migration.sql`
(restaurado em seguida):

```text
error: expect(received).toBeInstanceOf(expected)
Expected constructor: [class TripOccurrenceNoteRequiredError extends ApiError]
Received value: undefined
(fail) a observação obrigatória sobrevive à migration (spec 246 T2.3b, CA04) > tipo com foto required gravado antes das colunas novas: sem nota, NOTE_REQUIRED
 1 pass
 1 fail
```

Mutação 2 — tirar `findOccurrenceTypeOverrides` do registro do fixture (a exceção deixa de chegar):

```text
error: expect(received).toBeInstanceOf(expected)
Expected constructor: [class TripOccurrenceAttachmentRequiredError extends ApiError]
Received value: undefined
(fail) a exceção da nota vale no registro, pelo caminho real (spec 246 T2.3, CA03, RF6) > destinatário mais estrito endurece; outro destinatário volta ao tipo; contratante afrouxa
 1 pass
 1 fail
```

Verde sem mutação: `2 pass, 0 fail`. Integrações tocadas pela mudança de `findReachableDocument` e da regra,
uma por vez: `field-trip-target` 7/0 · `trip-field-authorship` 5/0 · `event-location-stamp` 23/0 ·
`whatsapp-driver-flow-actions` 4/0 · `occurrence-type-moments-registration` 2/0 ·
`street-occurrence-attachment-write` 2/0 · `street-occurrence-photo-statement` 1/0 · `me-trip` 21/0 ·
`trip-field-office` 25/0.

### T2.4 — O PUT do catálogo e das exceções aceita os modos; a assinatura é conferida e gravada (2026-10-06)

**Catálogo** (`PUT /company-settings/occurrence-types`): `noteMode` e `signatureMode` (`off | optional |
required`), **opcionais sem `default`** — ausente é "não mexa" (o `UPDATE` omite a coluna; o `INSERT` usa o
padrão da coluna: `optional` e `off`). O mapper (`save-occurrence-type-values.mapper.ts`) os repassa.
`GET` devolve os dois campos, e o `PUT` devolve o registro gravado com eles.

**Exceções** (`PUT .../occurrence-types/:id/attachment-overrides`): cada item das duas listas aceita, além
de `attachmentMode`, `noteMode`, `signatureMode`, `itemsMode` (nulo = herda), `photoMinimumCount` (1..5
ou nulo) e `itemsMinimumCount` (nulo = todos os itens). Três estados por campo, em
`occurrence-override-requirement-columns.support.ts`: **ausente** não toca a coluna; **nulo** herda do
tipo; **valor** grava. `itemsMinimumCount` não nulo sem `itemsMode = 'required'` **no mesmo item** é
`400` (a CHECK do banco, antes de virar 500). Sem `?? 'x'` no `UPDATE`.

⚠️ **Compatibilidade do painel anterior à Fase 5** (que reenvia a lista inteira, sem conhecer os campos
novos): (1) o item **ecoado** do `GET` leva os campos novos de volta e nada se perde; (2) o item que o
painel antigo **só com a foto** reenvia não apaga nenhum campo novo (ausente = não mexa); (3) a linha
**nova** sem `noteMode` (o painel antigo adicionando uma exceção) recebe a observação que **segue a
foto da exceção** — a mesma regra do `CASE` da migration T1.2 —, e não nulo: nulo herdaria a do tipo e
mudaria o que o painel antigo fazia. Nulo **explícito** continua sendo "herda".

**Assinatura** (RF9): `POST .../documents/:documentId/occurrences` aceita `signatureObjectId` (uuid ou
`null`). `registerDriverOccurrence` o confere como o anexo (RF2b da 179: existe, é desta empresa e desta
viagem) **e é do motorista** — `findConfirmedUpload` recebe o `driverId` quando o localizador é o do
motorista —, e `saveTripOccurrence` o grava em `trip_document_occurrences.signature_object_id`. **Nunca**
vira linha de `trip_document_occurrence_attachments`.

Contrato primeiro (`test/trip-occurrence/requirement-modes-write.contract.ts`):

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence/requirement-modes-write.contract.ts
(fail) o PUT do catálogo aceita os modos da observação e da assinatura (spec 246 T2.4) > aceita noteMode e signatureMode, e o mapper os repassa ao caso de uso
(fail) o PUT das exceções aceita os seis campos, nulo herda (spec 246 T2.4, D-a) > aceita os campos novos, nulos incluídos, nas duas listas
(fail) a rota do motorista aceita a assinatura (spec 246 T2.4, RF9) > signatureObjectId é um uuid; ausente e nulo valem
(fail) o caso de uso confere a assinatura e a grava na coluna própria (spec 246 T2.4, RF9) > assinatura confirmada, da viagem e do motorista: grava, sem virar anexo de foto
(fail) o caso de uso confere a assinatura e a grava na coluna própria (spec 246 T2.4, RF9) > assinatura que não é desta empresa/viagem/motorista: inalcançável, nada gravado
 6 pass
 5 fail
```

Depois: `11 pass, 0 fail`. Integração `occurrence-requirement-modes-write` (na lista `test:integration`):
`5 pass, 0 fail` — tipo grava e regrava sem os modos; exceção com os três estados; linha nova sem
`noteMode` segue a foto; assinatura na coluna e nenhuma linha de anexo. Mutação (trocar a omissão de
`noteMode` no `SET` do conflito por `noteMode: input.noteMode ?? 'optional'`, o `?? 'x'` proibido):

```text
(fail) a exceção distingue ausente, nulo e valor (spec 246 T2.4, D-a) > substituição total: o que não veio fica; nulo herda; valor grava
 4 pass
 1 fail
```

Contrato da API inteiro: `9854 pass, 25 skip, 0 fail`; `bun run typecheck` 0; `bun run lint` 0.

⚠️ **Divergência registrada.** O `PUT` de tipo de um painel anterior à 246 que passe a foto para `required`
sem mandar `noteMode` **não** arrasta mais a observação (a regra saiu do código — RF3). Só importa na janela
entre a API e o painel da Fase 5; o painel novo manda `noteMode`. Cadastro existente não muda (CA04).

### T2.4b — Produtos obrigatórios e os mínimos, cobrados pelo modo efetivo (2026-10-06)

A projeção (T2.1) e a verificação (T2.2) já trazem `itemsMode`, `photoMinimumCount` e
`itemsMinimumCount`. A **cobrança** (RF8) entra no registro do motorista, com dois erros estáveis novos em
`trip.error.ts` (`422`):

- `TRIP_OCCURRENCE_ITEMS_REQUIRED` — produtos obrigatórios e a ocorrência não aponta nenhum (nota sem
  item algum incluída: a nota inteira de uma nota vazia não cobre nada);
- `TRIP_OCCURRENCE_ITEMS_MINIMUM_NOT_MET` — "todos os itens" (mínimo nulo) recusa a seleção parcial, e o
  mínimo numérico recusa o que fica abaixo dele. O mínimo nunca passa do total da nota (dois itens
  exigidos numa nota de um item tornariam a ocorrência irregistrável).

`photoMinimumCount` já era cobrado desde a T1d.5 (`TRIP_OCCURRENCE_PHOTO_MINIMUM_NOT_MET`), agora sobre o
valor **efetivo** da nota (exceção herda ou declara). A regra: `productCode` vazio é a nota inteira (aponta
todos os itens da nota); um código aponta um.

`assertOccurrenceTypeAcceptsProducts` passou a ler o **modo efetivo** (a exceção da nota pode desligar ou
exigir produtos sobre o tipo) e, por isso, roda depois da leitura da nota e da resolução — o `422`
`OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` de um tipo `off` agora vem depois do `404` de nota inalcançável.

Contrato primeiro (`test/trip-occurrence/items-requirement.contract.ts`):

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence/items-requirement.contract.ts
SyntaxError: Export named 'TripOccurrenceItemsMinimumNotMetError' not found in module '.../trips/domain/trip.error.ts'.
 0 pass
 1 fail
```

Depois: contrato da API inteiro `9863 pass, 25 skip, 0 fail`; integração
`occurrence-requirement-modes-registration` `3 pass, 0 fail` (inclui nota sem item + produtos obrigatórios
pelo caminho real → `TRIP_OCCURRENCE_ITEMS_REQUIRED`); integrações vizinhas, uma por vez:
`occurrence-type-items-mode` 5/0 · `occurrence-type-quantity-minimums` 1/0 ·
`occurrence-type-minimum-counts` 4/0 · `trip-field-authorship` 5/0. `bun run typecheck` 0; `bun run lint` 0.
O registro do **galpão** e o lote do escritório não leem `required` de produtos nesta spec (a exigência de
rua é só da nota do motorista — spec.md "Fora do escopo").

### T2.5 — A assinatura da ocorrência não vira comprovante, nota nem foto (2026-10-06)

`test/integration/occurrence-signature-isolation.integration.ts` (na lista `test:integration`), contra
Postgres, pelo caminho real do motorista, com um tipo de assinatura `required`:

- sem assinatura → `TripOccurrenceSignatureRequiredError` (`TRIP_OCCURRENCE_SIGNATURE_REQUIRED`) e **nenhuma**
  ocorrência gravada;
- com a assinatura (upload confirmado desta viagem e deste motorista) → `signature_object_id` preenchido,
  `attachment_object_id` nulo; **nenhuma** linha em `trip_delivery_proofs` (de onde a pontualidade e a nota do
  motorista leem), `listDeliveryProofs` da nota vazio, `DrizzleDriverScoreRepository.readPenalties` igual ao
  de antes do registro, e **nenhuma** linha em `trip_document_occurrence_attachments`.

Mutação — gravar a assinatura também como linha de anexo (`mirrorStreetOccurrenceAttachment` com o
`signatureObjectId`, restaurado em seguida):

```text
Expected length: 0
Received length: 1
(fail) a assinatura da ocorrência não vira comprovante, nota nem foto (spec 246 T2.5, CA06) > sem assinatura: erro estável e nada gravado; com assinatura: só a coluna própria muda
 0 pass
 1 fail
```

Verde sem mutação: `1 pass, 0 fail`. O demonstrativo e a resposta da correção, que leem só a tabela de
anexos, já foram provados sem a assinatura na T1d.6 (CA09).

### T2.6 — WhatsApp do motorista: o canal não colhe assinatura, e o erro diz o campo que falta (2026-10-06)

O WhatsApp registra pela **mesma** `registerDriverOccurrence` do app (`main.ts`, canal `whatsapp`), com as
exceções injetadas (T2.3). Tipo com assinatura efetiva `required` volta `TripOccurrenceSignatureRequiredError`
(`422 TRIP_OCCURRENCE_SIGNATURE_REQUIRED`) — o canal não tem como mandar `signatureObjectId`. A **lista não é
filtrada por exigência** (RF13): o tipo continua oferecido, e o erro é o aviso.

Achado: o `describeDocumentError` da conversa **relançava** qualquer erro que não conhecia, então um tipo com
foto obrigatória (`TripOccurrenceAttachmentRequiredError`, desde a 179) já estourava a ação do fluxo em vez de
avisar o motorista. `driver-occurrence-refusal.service.ts` traduz as seis exigências de campo na frase do
que falta: observação (a conversa pede a observação de novo e volta ao prompt dela), assinatura, foto e
produtos (volta ao menu e manda registrar pelo aplicativo). Qualquer outro erro segue o tratamento de sempre.

Contrato primeiro (`test/whatsapp-commands/driver-flow-actions.contract.ts`, descrição "o WhatsApp não colhe
assinatura"), com o caso de uso **real** e dublês de leitura:

```text
$ bun --env-file=../../.env.test test ./test/whatsapp-commands/driver-flow-actions.contract.ts
      at assertDriverOccurrenceRequirements (.../occurrence-requirement-guard.policy.ts:43:11)
      at registerDriverOccurrence (.../register-driver-occurrence.use-case.ts:175:3)
      at async <anonymous> (.../register-driver-flow-actions.ts:509:18)
(fail) o WhatsApp não colhe assinatura: o erro diz o campo que falta (spec 246 T2.6, RF13) > a conversa diz que falta a assinatura e volta ao menu, sem gravar
(fail) o WhatsApp não colhe assinatura: o erro diz o campo que falta (spec 246 T2.6, RF13) > observação obrigatória e "Pular": a conversa pede a observação de novo
 38 pass
 2 fail
```

Depois: `40 pass, 0 fail` — o erro estável da assinatura sem gravar; a frase da assinatura e a volta ao menu; a
observação obrigatória com "Pular" volta ao prompt; tipo sem exigência segue registrando; a lista com o tipo
de assinatura obrigatória continua oferecendo o tipo.

### T2.7 (lacuna achada na 1d) — A rota do motorista aceita a lista de anexos (2026-10-06)

A T1d.5 registrou, e nenhuma task cobria: a rota do motorista levava **um** anexo (`attachmentObjectId`), então
um tipo com `photo_minimum_count > 1` ficava irregistrável. Agora `POST /me/trips/current/documents/:documentId/occurrences`
aceita `attachmentObjectIds` (1 a 5 uuids, sem repetir), **retrocompatível** com o campo único — o app antigo
segue registrando como sempre. Mandar os dois juntos, repetir um id, lista vazia ou com seis é `400`
(escolher um em silêncio gravaria o anexo que ninguém marcou).

- **Conferência.** Cada objeto é conferido como o único sempre foi (existe, confirmado, desta empresa e desta
  viagem) **e é do motorista**: `findConfirmedUpload` recebe o `driverId` quando o localizador é o dele, para
  as fotos e para a assinatura. ⚠️ Isto **aperta** o anexo único (antes só empresa/viagem); o escritório
  (`target`) continua sem filtro de motorista.
- **Mínimo.** `photo_minimum_count` efetivo da nota é conferido contra a quantidade de anexos recebidos
  (`TRIP_OCCURRENCE_PHOTO_MINIMUM_NOT_MET`, já existente).
- **Gravação.** `saveTripOccurrence` grava a coluna `attachment_object_id` com a **primeira** (escrita dupla da
  T1d.5) e as linhas 1..N de `trip_document_occurrence_attachments` (`mirrorStreetOccurrenceAttachments`,
  posições na ordem, `created_at` da ocorrência) na mesma transação. A assinatura segue só em
  `signature_object_id`.
- **Estrutura.** `register-driver-occurrence.use-case.ts` passou de 261 linhas para 85: as portas foram para
  `register-driver-occurrence.types.ts` e tudo o que se confere antes de gravar para
  `driver-occurrence-assessment.service.ts`; o comportamento é o mesmo, com os mesmos erros e a mesma ordem.

⚠️ **Defeito achado e corrigido aqui, da T2.4.** A rota aceitava `signatureObjectId` no corpo (schema) mas **não o
entregava** ao caso de uso — a assinatura era jogada fora sem erro. A T2.4 provou o schema e o caso de uso, não a
passagem da rota. O contrato novo exercita a rota de ponta a ponta (`createMeTripRoutes` com o caso de uso
capturando a entrada); sem o repasse na rota ele fica vermelho:

```text
$ git checkout -- src/trips/presentation/me-trip.routes.ts   # sem o repasse
$ bun --env-file=../../.env.test test ./test/trip-occurrence/driver-attachment-list.contract.ts
- Expected  - 5
+ Received  + 10
(fail) a rota entrega a assinatura e a lista de anexos ao caso de uso (spec 246 T2.4, T2.7) > lista de anexos e assinatura chegam ao caso de uso
 7 pass
 1 fail
```

Contrato primeiro (`test/trip-occurrence/driver-attachment-list.contract.ts`), antes da implementação:

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence/driver-attachment-list.contract.ts
(fail) a rota do motorista aceita a lista de anexos (spec 246 T2.7) > de 1 a 5 uuids distintos valem; o campo único antigo segue valendo
(fail) o caso de uso confere cada anexo e o mínimo de fotos (spec 246 T2.7) > três fotos num tipo que exige três: grava as três e a coluna antiga leva a primeira
(fail) o caso de uso confere cada anexo e o mínimo de fotos (spec 246 T2.7) > duas fotos num tipo que exige três: 422 PHOTO_MINIMUM_NOT_MET, nada gravado
(fail) o caso de uso confere cada anexo e o mínimo de fotos (spec 246 T2.7) > um anexo da lista que não é confirmado, desta viagem e deste motorista: inalcançável
(fail) o caso de uso confere cada anexo e o mínimo de fotos (spec 246 T2.7) > o app antigo, com o campo único, segue registrando
 1 pass
 5 fail
```

Depois: `8 pass, 0 fail`. Integração `driver-occurrence-attachment-list` (na lista `test:integration`):
`2 pass, 0 fail` — três fotos num tipo que exige três viram as linhas 1..3 na ordem com a hora da ocorrência e a
coluna leva a primeira; duas fotos são recusadas sem gravar; objeto de outro motorista da mesma viagem é
inalcançável. Mutação (gravar só a primeira linha, `storedObjectIds.slice(0, 1)`):

```text
- Expected  - 8
+ Received  + 0
(fail) a ocorrência de nota guarda N fotos (spec 246 T2.7) > três fotos num tipo que exige três: linhas 1..3 na ordem, coluna com a primeira
 1 pass
 1 fail
```

Contrato da API inteiro: `9876 pass, 25 skip, 0 fail`. Integrações vizinhas, uma por vez, verdes:
`trip-field-authorship` 5 · `street-occurrence-attachment-write` 2 · `street-occurrence-photo-statement` 1 ·
`event-location-stamp` 23 · `whatsapp-driver-flow-actions` 4 · `occurrence-requirement-modes-registration` 3 ·
`occurrence-requirement-modes-write` 5 · `occurrence-signature-isolation` 1 ·
`occurrence-type-moments-registration` 2 · `trip-occurrence-attachment` 6 · `stop-occurrence-photo` 8.
O app do motorista (`apps/frontend-driver`) ainda manda o campo único: **enviar a lista** é a T4.1b/T4.2.

### Gates ao fechar a Fase 2 (2026-10-06, primeiro plano)

| Gate                                                                     | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun install --frozen-lockfile`                                          | sem mudanças                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `bun run typecheck` (raiz)                                               | saída 0, quatro apps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`        | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| contrato da API (`bun --env-file=../../.env.test test --timeout 120000`) | `9876 pass, 25 skip, 0 fail` (199 arquivos); no fim da Fase 1d eram `9817 pass` — os 25 pulados são anteriores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| API: `bun run lint` (`--max-warnings=0`)                                 | saída 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| integração, um arquivo por vez com `--env-file=../../.env.test`          | novos: `occurrence-requirement-modes-registration` 3/0 · `occurrence-requirement-modes-write` 5/0 · `occurrence-signature-isolation` 1/0 · `driver-occurrence-attachment-list` 2/0; tocados: `trip-field-authorship` 5/0 · `street-occurrence-attachment-write` 2/0 · `street-occurrence-photo-statement` 1/0 · `event-location-stamp` 23/0 · `whatsapp-driver-flow-actions` 4/0 · `occurrence-type-*` (requirement-modes 1, allows-multiple-items 2, moments-registration 2, moments-backfill 1, catalog-seed 2, redelivery-policy 2, leaves-document-behind 4, items-mode 5, quantity-minimums 1, minimum-counts 4) · `me-trip` 21/0 · `trip-field-office` 25/0 · `field-trip-target` 7/0 · `driver-delivery-proof-read` 4/0 · `trip-occurrence-attachment` 6/0 · `stop-occurrence-photo` 8/0 · `trip-occurrence-correction` 8/0 — nenhum pulado, nenhum falho. A lista completa `test:integration` **não** foi rodada |
| `make migration-test`                                                    | **não rodado**: a Fase 2 não toca migration (a mutação do T2.3b editou o `migration.sql` da T1.2 e a restaurou; `git status` limpo nele)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `bun run db:generate` (API)                                              | `no_changes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `bun run build`                                                          | saída 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| painel: `bun run --cwd apps/frontend-transportada test` e lint           | `582 pass, 0 fail`; lint 0 erros (16 avisos anteriores)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| app do motorista: `bun run --cwd apps/frontend-driver test`              | `1199 pass, 0 fail` (3 arquivos)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Fase 3: o **conteúdo** de T3.1/T3.2 (o registro lê tipo + exceção do contratante + exceção do destinatário, da
nota no servidor, pelo resolvedor do snapshot) foi implementado na T2.3 por pedido, com contrato e integração
(T2.3b). As tasks T3.1–T3.3 seguem **desmarcadas** (T3.3 pede a paridade snapshot × registro na mesma
integração) e a **T3.0 segue PENDENTE** — pede autorização do usuário, não foi executada. A RF6 só ativa em
produção depois dela.

Pendente: **T1d.0** e **T3.0** (medições, pedem autorização), e a **ordem de publicação** da T1d.2.

## Fase 3 — O servidor cobra a exceção (2026-10-06)

### T3.1 e T3.2 — fechadas com a evidência da Fase 2

O conteúdo das duas foi implementado e provado na T2.3 (por pedido), e a regra é uma só: o registro resolve
a exigência da nota por **tipo + exceção de contratante + exceção de destinatário**, campo a campo, com o
**mesmo** resolvedor do snapshot (`resolveFieldOccurrenceTypeResolutions`, sobre `resolveWithOverrides`),
lendo contratante e destinatário **da nota no servidor** (`findReachableDocument`), nunca do corpo. Nenhuma
segunda implementação. Itens e mínimos efetivos (`assertOccurrenceItemsRequirement`) leem o mesmo resolvido.

- **T3.1 (contrato primeiro).** Vermelho registrado na T2.3 (`SyntaxError: Export named
'TripOccurrenceSignatureRequiredError' not found`). Verde hoje:

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence/requirement-modes-registration.contract.ts ./test/trip-occurrence/requirement-modes-resolution.contract.ts
 21 pass
 0 fail
```

- **T3.2 (implementação), pelo caminho real no banco** (`occurrence-requirement-modes-registration.integration.ts`):

```text
 3 pass
 0 fail
```

### T3.3 — Paridade snapshot × registro, no mesmo banco (CA02, CA03)

`test/integration/occurrence-effective-requirements-parity.integration.ts` (na lista `test:integration`).
Dois contratantes-destinatários, duas notas do mesmo emitente. O teste lê o tipo **dentro do snapshot**
(`findCurrentDriverTrip`) e, para cada nota e cada campo que o snapshot diz `required`, prova pelo registro
real (`registerDriverOccurrence` + Drizzle): sem o campo, o erro estável do campo; com os exigidos, grava.

- CA02: tipo `optional` no geral e `required` (foto e assinatura) por destinatário → nota 1 `required`,
  nota 2 `optional`/`off`, no snapshot **e** no registro.
- CA03: contratante afrouxa foto e observação; destinatário da nota 2 endurece só a foto; destinatário vence
  contratante vence tipo, campo a campo (a observação, nula no destinatário, herda a do contratante).

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-effective-requirements-parity.integration.ts
 2 pass
 0 fail
 11 expect() calls
```

Mutação 1 — o registro deixa de ler a exceção (`occurrenceTypeIds: []` em `registerStreetOccurrence`):

```text
error: expect(received).toBeInstanceOf(expected)
Expected constructor: [class TripOccurrenceAttachmentRequiredError extends ApiError]
Received value: undefined
(fail) ... > mesmo tipo, required numa nota e optional noutra: snapshot e registro dizem o mesmo (CA02)
(fail) ... > destinatário vence contratante vence tipo, campo a campo, nos dois lados (CA03)
 0 pass
 2 fail
```

Mutação 2 — o snapshot deixa de ler a exceção (`occurrenceTypeIds: []` em
`DrizzleCurrentDriverTripRepository`):

```text
error: expect(received).toEqual(expected)
- Expected  - 2
+ Received  + 2
(fail) ... > mesmo tipo, required numa nota e optional noutra: snapshot e registro dizem o mesmo (CA02)
(fail) ... > destinatário vence contratante vence tipo, campo a campo, nos dois lados (CA03)
 0 pass
 2 fail
```

As duas restauradas (`git status`: só o arquivo novo e o `package.json`). `bun run typecheck` da API: saída 0.
**T3.0 segue PENDENTE** (pede autorização do usuário; a RF6 só ativa em produção depois dela).

## Fase 4 — O motorista captura o que foi pedido (2026-10-06)

### T4.1 e T4.1b — O formulário cobra os quatro modos e o mínimo de fotos

Um corte só, porque o gate, a visibilidade e o formulário são o mesmo código (`occurrenceRequirements.service.ts`
resolve os modos; o hook e o formulário só leem).

- **Regra.** O app lê os modos **do tipo que já vem resolvido para a nota** (`document.occurrenceTypes` do
  snapshot) — nunca manda `contractorId`/`recipientTaxId` (`security.md` §3). Para cada campo: `off` não
  aparece, `optional` aparece sem exigir, `required` desabilita "Registrar". Observação: a caixa some em `off`
  (e o texto digitado antes de trocar de tipo não sai). Foto: `photoMode` (ou `attachmentMode` quando a API
  não mandou), e `photoMinimumCount` ≥ 2 com a foto obrigatória passa o formulário a aceitar até 5 fotos, com
  contador e "Remover a última foto". Assinatura: o `SignaturePad` só monta quando o motorista abre, e só existe
  o botão com o modo ≠ `off`. Produtos: ver a limitação abaixo.
- **Sem rede.** O gate lê só o snapshot e o que está no aparelho; nenhum caminho dele chama `fetch`
  (`occurrence-offline-gate.contract.ts`, T4.3).
- **Tolerância (app novo × API anterior).** `noteMode`, `signatureMode`, `itemsMode`, `photoMode` e
  `photoMinimumCount` ausentes leem como hoje: observação opcional, assinatura desligada, produtos opcional,
  foto pelo `attachmentMode` e mínimo 1. Valor fora do vocabulário reprova o guard, como `attachmentMode` já fazia.
  A ocorrência de **parada** segue só com a foto (D-a/D-d): nota, assinatura e produtos obrigatórios não valem lá.
- **Segunda trava.** `dispatchOccurrenceRegistration` devolve `blocked` (e não chama o handler) quando falta campo
  obrigatório, e o formulário só fecha quando registrou — rascunho incompleto nunca entra na fila nem some.

⚠️ **Limitação declarada (produtos).** O snapshot do motorista **não traz a lista de itens da nota**, e a rota de
registro aceita só `productCode` único ou vazio (= nota inteira). Por isso o app **não consegue apontar itens**:
com `itemsMode = required` ele oferece uma única marca, **"A nota inteira"**, que precisa ser marcada para
liberar o botão. A nota inteira satisfaz "todos os itens" (`itemsMinimumCount` nulo) e "ao menos N" do mesmo jeito
(o servidor soma todos os itens dela e limita o mínimo ao total), então o mínimo **não muda o gate no aparelho**.
Com `optional` o app não mostra nada (nada a escolher sem a lista) e continua mandando a nota inteira; com `off`
também não. Apontar item a item pede o snapshot trazer os itens e a rota aceitar uma lista: **não coube aqui**.

Textos novos (pt-BR, `driverTrip.locale.json` › `occurrenceRegistration`; o inglês tem as mesmas chaves, vigiado
por contrato): "O que aconteceu (obrigatório)" · "Tirar outra foto" · "Fotos: {{count}} de {{limit}}" · "Remover a
última foto" · "Produtos da nota (obrigatório)" · "Assinatura (opcional)" / "Assinatura (obrigatória)" · "Colher a
assinatura de novo" · motivos do botão desabilitado (`missing.*`): "a observação", "a foto", "mais fotos (mínimo de
{{count}})", "a marcação dos produtos", "a assinatura", compostos em "Para registrar, falta: …". O botão desabilitado
mostra o motivo em texto (`role="status"`) ligado por `aria-describedby`; os alvos de toque são os botões do design
system (≥ 44 px, `touch-target.contract.ts` verde); sem estilo inline; nada de CSS novo (as classes são as do canhoto
e dos chips).

Estrutura: `OccurrenceRegisterAction`, `OccurrenceSignatureField`, `OccurrenceProductsField` e
`OccurrencePhotoField` saíram do formulário (194 linhas), e `occurrenceDispatch.service.ts` do serviço do gate
(103 linhas). Contratos existentes que liam o código do formulário passaram a ler o componente novo
(`capture-registry`, `occurrence-preview`, `stop-occurrence-photo`, `occurrence-registration-wiring`).

Contrato primeiro (`occurrence-requirements.contract.ts` 19 testes, `occurrence-requirement-fields.contract.tsx` 9).
**Vermelho** com a árvore de `src/` do HEAD (sem a implementação):

```text
$ bun test ./test/driver-trip/occurrence-requirements.contract.ts
error: Cannot find module '../../src/modules/driver-trip/shared/occurrenceDispatch.service' ...
 0 pass
 1 fail
 1 error
$ bun test ./test/driver-trip/occurrence-requirement-fields.contract.tsx
error: Cannot find module '@/modules/driver-trip/components/OccurrenceProductsField.component' ...
 0 pass
 1 fail
 1 error
```

Mutações sobre o verde (cada uma restaurada em seguida; `bun run test` do app):

```text
M1 — o gate deixa de cobrar a assinatura (`false && requirements.signatureMode === 'required'`)
(fail) cada captura tira um motivo da lista, e o último libera o botão
(fail) falta a assinatura: o despacho recusa, nada vai ao handler e a fila segue vazia
(fail) cada campo obrigatório, tirado sozinho, bloqueia
(fail) assinatura obrigatória: falta até ser desenhada; opcional e desligada nunca seguram
 1238 pass / 4 fail

M3 — o despacho deixa de bloquear (sem `isDraftComplete`)
(fail) observação obrigatória: falta até haver texto; espaços não contam
(fail) produtos só saem com a nota inteira apontada, e o tipo que não os pede não os leva
(fail) duas fotos num tipo que pede três: nada entra na fila
 1237 pass / 5 fail

M4 — campo ausente deixa de ler como hoje (`noteMode ?? 'required'`)
(fail) sem nenhum modo novo: observação opcional, assinatura desligada, produtos opcional, mínimo 1
(fail) o tipo antigo só pede o que pedia: a foto obrigatória, e nada mais
(fail) o app novo contra a API anterior ... (saída cortada nas 8 primeiras falhas)
```

Verde restaurado: `bun run --cwd apps/frontend-driver test` → `1242 pass, 0 fail` (eram 1199: +43 testes novos).

### T4.2 — A assinatura entra no item de fila que já existe (209 D1)

Molde: a foto da ocorrência de nota (179 T303), que mora no próprio item `documentOccurrence` e sobe **dentro do
`send`**, antes do `POST`. A assinatura e as demais fotos seguem o mesmo caminho:

- O item ganhou dois campos **opcionais**: `extraPhotos` (as fotos além da primeira, que continua em `photo`) e
  `signature` (o PNG do `SignaturePad`). Item gravado antes da spec segue valendo sem migração do IndexedDB.
  `buildDocumentOccurrenceReport` (`documentOccurrenceReport.service.ts`) monta o **único** item do toque.
- `sendDocumentOccurrence` sobe fotos e assinatura pelo mesmo par `occurrence-uploads` + `confirm` (em
  paralelo, `Promise.all`), e manda `signatureObjectId` no corpo do mesmo `POST`. Uma foto sai como o campo único de
  sempre (`attachmentObjectId`); mais de uma sai como `attachmentObjectIds` na ordem, e nunca os dois juntos (a API
  recusa). Nada vai a `/proof`.
- `listReportPhotos` (`offlineQueue.service.ts`) faz fotos e assinatura contarem na cota de bytes da fila
  (`sumReportPhotoBytes`) e nos anexos do item na tela de pendentes (`attachmentCount`), como a foto já contava.
  Fila cheia recusa o toque inteiro (`reportAllOrNothing`, que a ocorrência de nota já usava) — nunca perde a
  assinatura e grava o relato.

Contrato (`occurrence-signature-queue.contract.ts`, 9 testes): um item só com fotos e assinatura dentro; a forma antiga
do item não ganha chave; cota e contagem; o corpo (`attachmentObjectId` + `signatureObjectId`, só a assinatura, só a lista
de fotos na ordem, e o item antigo exatamente como saía); nenhum pedido vai a `/proof`; formulário, hook e construtor não
usam `ProofCaptureFields` nem `attachProof`. **Vermelho** sem a implementação: `Cannot find module
'../../src/modules/driver-trip/shared/documentOccurrenceReport.service'` (0 pass, 1 fail, 1 error). Mutação sobre o
verde — o envio deixa de mandar `signatureObjectId`:

```text
(fail) o envio sobe pelo mesmo par de upload e manda signatureObjectId (T4.2, RF9) > uma foto e a assinatura: dois uploads, e o corpo leva attachmentObjectId e signatureObjectId
(fail) o envio sobe pelo mesmo par de upload e manda signatureObjectId (T4.2, RF9) > só a assinatura, sem foto: o corpo leva signatureObjectId e nenhum campo de anexo
 1240 pass / 2 fail
```

A paridade com a API é a da T2.7 (`attachmentObjectIds`, 1–5) e da T2.4 (`signatureObjectId`), com integração verde
(`driver-occurrence-attachment-list` 2/0, `occurrence-requirement-modes-write` 5/0, `occurrence-signature-isolation` 1/0).

### T4.3 — O contrato do app: CA05 e o caminho offline

`occurrence-offline-gate.contract.ts` (6 testes). `globalThis.fetch` é trocado por um que conta a chamada e rejeita
(`Failed to fetch`); todo o gate e o despacho rodam com ele e o contador termina em **0**:

- seis passos de captura (observação → produtos → foto → segunda foto → assinatura) tiram um motivo da lista por vez
  e o último libera o botão (CA05); a foto ainda sendo reduzida segura o botão mesmo com tudo capturado;
- tudo exigido capturado: o registro entra na fila (memória) como **um** item com a observação, as duas fotos e a
  assinatura;
- sem a assinatura, ou tirando cada campo obrigatório sozinho (observação, produtos, foto, segunda foto,
  assinatura): `blocked`, o handler não é chamado e a fila segue **vazia**;
- o botão é `disabled={!canRegister}` e quem chama só fecha o formulário quando registrou.

Vermelho de comportamento: as mutações M1 (gate sem a assinatura) e M3 (despacho sem bloquear) da T4.1 deixam este
arquivo vermelho (3 falhas cada — ver acima). Gates ao fechar a Fase 4 (primeiro plano, 2026-10-06):

| Gate                                                                 | Resultado                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                      | sem mudanças                                                                                                                                                                                                                                                                                                                     |
| `bun run typecheck` (raiz)                                           | saída 0, sete apps                                                                                                                                                                                                                                                                                                               |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`    | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                     |
| `bun run --cwd apps/frontend-driver test`                            | `1242 pass, 0 fail` (eram 1199)                                                                                                                                                                                                                                                                                                  |
| `bun run lint` (app como cwd) e `bun run typecheck` da app           | 0 erros, 0 avisos                                                                                                                                                                                                                                                                                                                |
| `bun run --cwd apps/frontend-driver build`                           | saída 0 (precache 14 arquivos, `dist.contract` 6 pass)                                                                                                                                                                                                                                                                           |
| contrato da API (`--env-file=../../.env.test test --timeout 120000`) | `9876 pass, 25 skip, 0 fail` (199 arquivos; os 25 pulados são anteriores)                                                                                                                                                                                                                                                        |
| integração da API, um arquivo por vez, `--env-file=../../.env.test`  | `occurrence-effective-requirements-parity` 2/0 · `occurrence-requirement-modes-registration` 3/0 · `occurrence-requirement-modes-write` 5/0 · `occurrence-signature-isolation` 1/0 · `driver-occurrence-attachment-list` 2/0 · `me-trip` 21/0 · `whatsapp-driver-flow-actions` 4/0 · `trip-field-authorship` 5/0 — nenhum pulado |

**Não coube:** apontar produto **por item** (precisa de snapshot com itens e de rota com lista — ver T4.1b); o smoke
Playwright do app não foi rodado nem estendido; a revisão visual do formulário novo (print, tema claro/escuro) fica para
a T6.1; `CLAUDE.md` e `docs/ai-context/frontend-driver.md` ficam para a T6.2.

## T5.3-api — a rota em lote das exceções (RF11c, 2026-10-06)

`GET /company-settings/occurrence-types/attachment-overrides` (`settings.manage`): `{ data: { overridesByType: [{ occurrenceTypeId, contractorOverrides, recipientOverrides }] } }`.
Cada item tem o formato da rota por tipo (`attachmentMode` obrigatório; os outros quatro campos modo-ou-nulo/contagem-ou-nulo herdam), sem o `occurrenceTypeId`.

**Contrato vermelho antes da implementação** (`bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts`):

```text
error: Cannot find module '../../src/trips/application/list-occurrence-attachment-overrides.use-case.js' from '.../test/trip-occurrence/attachment-overrides-batch-route.contract.ts'
 0 pass
 1 fail
 1 error
```

Verde depois: `480 pass, 0 fail` (4 testes novos: formato agrupado e tipo sem exceção com listas vazias; `companyId` do contexto e `?companyId=` forjado ignorado; `settings.manage`; o endereço fixo, pelo `createRouter` real, não é lido como `:occurrenceTypeId` e a rota por tipo segue servindo o seu).

**Integração** (`occurrence-attachment-overrides-batch.integration.ts`, 2 pass): duas empresas, a de A vê só os seus três tipos (um aposentado, um sem exceção) e a de B só o dela; `select` contados: **3 com 1 tipo e 3 com 4 tipos**.

**Mutação** (tirar o filtro `where company_id` de `listOccurrenceTypeIds`) deixa a integração vermelha:

```text
- Expected  - 0
+ Received  + 1
(fail) exceções de exigência em lote (spec 246 T5.3-api, RF11c) > agrupa por tipo, inclui o inativo e o tipo sem exceção, e não vaza para outra empresa
 1 pass
 1 fail
```

Revertida; volta a `2 pass, 0 fail`.

Gates (primeiro plano): `bun install --frozen-lockfile` sem mudanças · `bun run typecheck` saída 0 · contrato da API `9926 pass, 25 skip, 0 fail` (199 arquivos) · integração, um arquivo por vez: `occurrence-attachment-overrides-batch` 2/0, `occurrence-requirement-modes-write` 5/0, `occurrence-type-*` (11 arquivos) todos 0 falhas, nenhum pulado · `db:generate` = `no_changes` · `bun run build` ok. `prettier --check .`/`format:check` na raiz: só 2 arquivos do painel (`TripOccurrencesWorkspace.page.tsx`, `occurrenceTypePanelSource.helper.ts`), anteriores a este lote e fora do escopo.

## T5.3 (1ª metade) — a camada de dados do painel e a linha do tipo (2026-10-06)

Passo 0 (commit próprio, `06af4be0c`): `prettier --write` nos dois arquivos que deixavam o `format:check` da raiz
vermelho (`TripOccurrencesWorkspace.page.tsx` e `occurrenceTypePanelSource.helper.ts`); `bun run format:check` verde.

**Tolerância (ADR-0081 §9): API antiga sem os campos novos → o painel lê como hoje.**

- `OccurrenceType` e as exceções (`OccurrenceAttachmentOverrides`, mais `OccurrenceAttachmentOverridesByType`) foram
  para `shared/occurrenceType.types.ts` e são reexportados por `occurrence.constant.ts` (os importadores não mudam).
  Campos novos no tipo: `noteMode`, `signatureMode`, `photoMinimumCount`, `itemsMinimumCount`, `moments?`. Na exceção,
  os cinco campos são modo-ou-nulo e **opcionais**: ausente é "herda" e nunca é mandado de volta no `PUT`.
- `toOccurrenceType` (`tripResponse.validation.ts`): ausente vira `noteMode: 'optional'`, `signatureMode: 'off'`,
  `photoMinimumCount: 1`, `itemsMinimumCount: null`; `moments` ausente continua ausente. ⚠️ Com API anterior e foto
  `required`, a observação aparece `Opcional` aqui (o servidor antigo a exigia pela regra fixa da 179): o painel só lê
  esses campos, e `buildOccurrenceTypeUpdate` não os manda sem edição, então nenhum dado é reescrito.
- `readOccurrenceAttachmentOverrides` e o novo `readOccurrenceAttachmentOverridesBatch` moraram para
  `shared/occurrenceAttachmentOverrides.validation.ts` (o `tripClient.service.ts` tem 1570 linhas).
- `OCCURRENCE_ITEMS_WRITE_MODES` ganhou `required`. O cadastro **novo** (`OccurrenceTypeItemsModeSelect`) segue em
  Desligado/Opcional (não tem campo de mínimo); o tipo já cadastrado usa o seletor de três estados.
- Cliente: `listOccurrenceAttachmentOverridesBatch` (GET `/company-settings/occurrence-types/attachment-overrides`);
  404 (API anterior à rota) devolve `[]` sem erro. Consulta `useOccurrenceAttachmentOverridesBatchQuery`, chave
  `['trip', 'occurrence-attachment-overrides', 'batch']`, invalidada por `useReplaceOccurrenceAttachmentOverridesMutation`.
  **A consulta ainda não é lida por nenhuma tela** (a lista de exceções nova é a etapa seguinte).

**`buildOccurrenceTypeUpdate` (RF4).** `noteMode`, `signatureMode`, `photoMinimumCount` e `moments` só vão quando a
edição os muda; `redeliveryPolicy` continua indo sempre; `itemsMode` só quando o seletor Produtos o muda e `off` zera a
política. `itemsMinimumCount`: só com o tipo (já ou agora) `required`, e **sair de `required` manda `null` explícito**.

Contrato primeiro, vermelho (`bun test ./test/company-settings.contract.test.ts`, antes de implementar):

```text
error: expect(received).toHaveProperty(path)
(fail) buildOccurrenceTypeUpdate > sair de Produtos obrigatório manda itemsMinimumCount nulo explícito [0.10ms]
error: expect(received).not.toHaveProperty(path)
(fail) buildOccurrenceTypeUpdate > o mínimo de produtos só vai com o tipo (já ou agora) obrigatório [0.05ms]
 252 pass
 3 fail   (o terceiro: o contrato da 164 que lia o tipo em occurrence.constant.ts; ele passou a ler occurrenceType.types.ts)
```

Mutação pedida (arrancar o envio de `itemsMinimumCount: null` ao sair de `required`), contra a versão final:

```text
$ bun test ./test/company-settings.contract.test.ts
Expected path: "itemsMinimumCount"
(fail) buildOccurrenceTypeUpdate > sair de Produtos obrigatório manda itemsMinimumCount nulo explícito [0.17ms]
 254 pass
 1 fail
$ bun run test:hooks
(fail) linha do tipo: os mínimos (spec 246 RF1c, RF1c2) > tornar Produtos obrigatório não manda mínimo; sair de obrigatório manda o mínimo nulo [19.60ms]
 621 pass
 1 fail
```

Outras mutações, todas vermelhas e revertidas: o `404` do cliente em lote deixando de ser lista vazia
(`(fail) cliente: exceções em lote (spec 246 RF11c) > API anterior à rota (404): lista vazia, sem erro` → `2495 pass, 1 fail`);
o `TripOccurrenceTypesTab` trocado de volta pelo placeholder (`(fail) TripOccurrencesWorkspacePage tabs (T5.1) > monta o painel
de tipos na aba Tipos, só com companies.settings, sem o placeholder` → `2 pass, 1 fail`).

**Tela.** A aba Tipos de `/ocorrencias` monta `TripOccurrenceTypesTab` → `OccurrenceTypeCatalogPanel` (só com
`companies.settings`, a consulta só liga com a permissão). A linha do tipo ganhou o bloco "O que exige"
(`OccurrenceTypeRequirementFields`): Foto, Observação, Assinatura e Produtos no mesmo seletor `Select` de três estados
(`OccurrenceRequirementModeSelect`, `Tooltip dismissOnActivate` com a dica de cada campo), e os mínimos
(`OccurrenceTypeMinimums`): fotos de 1 a 5 quando Foto é Obrigatório; "Todos os itens da nota" ou "Ao menos N" quando
Produtos é Obrigatório (campo numérico que grava ao sair, 1–999, valor inválido volta ao gravado). Tipo de galpão só
mostra Produtos; API sem `itemsMode` não oferece Produtos (regras da 241 preservadas: `off` esconde reentrega e
"vários itens", e zera a política). O seletor antigo "Foto do comprovante" (Sem foto/Foto opcional/Foto obrigatória)
saiu da linha: a foto é o `attachmentMode` já existente, agora rotulada "Foto" com as três palavras comuns. A seção de
exceções antiga continua como estava (acordeão).

**Textos pt-BR novos** (`companySettings.occurrenceTypeCatalog.requirements`, en espelhado): "O que exige"; campos
"Foto", "Observação", "Assinatura", "Produtos"; modos "Desligado", "Opcional", "Obrigatório"; "Quantidade mínima de
fotos" ("Só vale quando a foto é obrigatória. De 1 a 5."); "Produtos exigidos" com "Todos os itens da nota" e "Ao menos",
"Quantidade mínima de produtos" ("Só vale quando Produtos é obrigatório. Todos os itens da nota serve à recusa total.");
a legenda "Obrigatório quer dizer: a ocorrência não é registrada sem aquilo. …" e uma dica por campo.

Testes novos: `test/trip/occurrence-requirement-catalog-client.contract.ts` (mapeamento com/sem os campos novos, lote,
404, corpo do `PUT` sem os campos quando a edição não os muda), `test/trip-hooks/occurrence-type-requirement-fields.contract.ts`
(DOM: os quatro seletores, galpão, mínimos, nulo explícito, campo numérico, aba monta o painel e não consulta sem a
permissão), casos novos em `occurrence-type-update.contract.ts`, e `test/fixtures/occurrenceRequirementDefaults.fixture.ts`.
Os testes da 241 (`occurrence-type-items-mode-panel`, `occurrence-type-row-edits`) trocaram os textos para as três
palavras comuns (Desligado/Opcional/Obrigatório; "Foto").

Gates (primeiro plano, 2026-10-06): `bun install --frozen-lockfile` sem mudanças · `bun run typecheck` (raiz) saída 0 ·
`prettier --check .` e `bun run format:check` verdes · `bun run --cwd apps/frontend-transportada test`: `6997 pass, 0 fail`
(contratos) e `622 pass, 0 fail` (lote DOM) · lint com a app como cwd: 0 erros (16 avisos anteriores) — removido o
`import` morto de `resolveTripFeedbackKey` em `CompanySettings.page.tsx` (sobra da T5.2) e limpo o contrato da T5.1 que
tinha variáveis sem uso · `bun run --cwd apps/frontend-transportada build` ok.

**Falta para a etapa seguinte:** lista de exceções à vista (sem acordeão) lendo a consulta em lote, com os quatro modos

- "Igual ao tipo" e os mínimos por exceção (RF11, RF11c, RF1f/T5.3c); seletor múltiplo de momentos (T5.3b); aviso ao
  contratante (T5.3d); busca e filtros (T5.3e); tipos recolhidos com a linha-resumo do `preview.html` (RF11); T5.4 (os
  contratos que afirmam o endereço antigo). Ordem dos campos e rótulos já seguem o `preview.html` (Foto, Observação,
  Assinatura, Produtos); diferenças conhecidas a tratar na T6.1: o protótipo mostra a assinatura como "Assinatura de quem
  recusou" e "Produtos da nota", e o mínimo de produtos como número + "Esse mínimo/Todos os itens da nota".

## T5.3 (2ª metade) e T5.3c — exceções à vista, tipos recolhidos, cliente escolhido (2026-10-06)

**Tipos recolhidos (RF11).** `OccurrenceTypeItem` envolve a linha: `OccurrenceTypeSummary` é o botão com
`aria-expanded`/`aria-controls` (nome, momentos, as exigências em forma curta — Foto, Obs, Assin, Produtos, com
"Foto ×N" quando o mínimo passa de 1 —, ✉ quando avisa, e a contagem de exceções: "N exceções", "1 exceção", "sem
exceção", "carregando exceções" ou "exceções indisponíveis"); tipo inativo ganha a etiqueta "Inativo". Aberto, o tipo
mostra a linha de antes (`OccurrenceTypeRow`) e, sem segundo nível de recolhimento, a lista de exceções.

**Exceções à vista (RF11, RF11c).** `OccurrenceTypeCatalogPanel` lê a consulta **em lote** uma vez
(`useOccurrenceAttachmentOverridesBatchQuery`) e entrega a cada tipo a sua fatia; contratantes
(`useContractorsQuery`) e clientes (`useDeliveryClientDirectoryQuery`, nova, em
`delivery-clients/queries`) também uma vez por tela. A lista (`OccurrenceTypeExceptions` → `OccurrenceExceptionItem`)
mostra, por exceção, Foto, Observação, Assinatura e Produtos em `Select` com **Igual ao tipo** (nulo herda; a Foto
não tem essa opção — coluna `NOT NULL`, nasce igual à do tipo), mais "Mínimo de fotos" (Igual ao tipo, 1–5) e
"Produtos exigidos" (Todos os itens da nota / Ao menos N). O mínimo de produtos só edita com Produtos **obrigatório na
própria exceção**; fora disso o controle fica desligado com o motivo em texto, ligado por `aria-describedby`. Toda
edição manda as duas listas inteiras pelo `PUT`
(`shared/occurrenceException.service.ts`: `editException`/`addException`/`removeException`), e **sair de `required` ou
voltar a Igual ao tipo manda `itemsMinimumCount: null` explícito**. A gravação invalida só a chave do lote. A seção antiga
(`OccurrenceTypeExceptionsSection`, acordeão, consulta por tipo ligada a `isExpanded`, CNPJ digitado) foi removida,
com o hook `useOccurrenceAttachmentOverridesQuery` (nada mais o usava); o cliente `listOccurrenceAttachmentOverrides`
fica, e o contrato dele também.

**T5.3c (RF1f).** O cliente da exceção é escolhido em `SearchableSelect` (busca por nome ou CNPJ formatado, rótulo
"Nome · 12.345.678/0001-90") entre os contratantes ou entre os clientes cadastrados ativos; quem já tem exceção neste
tipo não repete na lista; o corpo leva o CNPJ só com dígitos. Não há campo de CNPJ digitado. Consulta de clientes
falhando: o seletor e o botão ficam desligados e a mensagem diz o motivo ("Não foi possível carregar os clientes
cadastrados, …"); o mesmo para contratantes; sem cliente livre sobrando: "Não há cliente cadastrado sem exceção neste tipo."

**Contratos (primeiro plano).** `test/trip-hooks/occurrence-exceptions-panel.contract.ts` (DOM, 9 casos: contagem de
chamadas do cliente com 1 e com 3 tipos = 1; linha-resumo e inativo; lista com nome e CNPJ formatado; edição manda as
duas listas inteiras com o resto como estava; mínimo desligado com motivo; sair de obrigatório manda nulo; remover;
cliente escolhido, sem repetir e só dígitos; consulta de clientes falhando) e
`test/trip/occurrence-exception-service.contract.ts` (as edições puras). Dublê: `occurrenceTypesPanelHarness.helper.ts`
(cliente de destinatários dublado por `mock.module` **sem** `await import` no topo — a versão com
`await import` do módulo real travou o carregamento do arquivo de teste por TLA). Os contratos que liam a linha
dentro do painel (`occurrence-type-items-mode-panel`, `occurrence-type-requirement-fields`) passaram a abrir o tipo antes
(`expandAllTypes`); nenhuma asserção foi afrouxada.

Mutações (execuções vermelhas, cada uma revertida):

```text
# sair de required na exceção sem mandar o nulo explícito
(fail) exceções: cada campo editável, nulo herda (RF11, RF4) > sair de Produtos obrigatório na exceção manda itemsMinimumCount nulo explícito [56.24ms]
Received: 2
 11 pass
 1 fail

# uma consulta por tipo no lugar da consulta em lote
Expected: 1
Received: 2
(fail) exceções à vista: uma consulta por tela (RF11c) > com 1 tipo e com 3 tipos o cliente recebe uma chamada em lote só [220.16ms]
 11 pass
 1 fail
```

Também vermelho no contrato puro (`bun test ./test/trip.contract.test.ts`), com `isLeavingRequired` forçado a falso:
`(fail) exceções: edição devolve as duas listas inteiras (RF4) > sair de Produtos obrigatório manda o mínimo nulo explícito`
e `> voltar Produtos a "igual ao tipo" também zera o mínimo` (`2501 pass, 2 fail`).

**Dois contratos do design system pegaram o que escrevi, e foram corrigidos na fonte** (`7003 pass, 2 fail` na primeira
rodada): `muted-text-contrast` (um `color-mix` de `--color-slate` para pintar texto → `var(--color-slate-muted)`) e `skeleton`
(parágrafo único "carregando" → `SkeletonGroup`).

**Textos pt-BR novos** (`companySettings.occurrenceTypeCatalog`, en espelhado): `summary` ("1 exceção", "N exceções",
"sem exceção", "carregando exceções", "exceções indisponíveis", "Inativo", "Avisa o contratante", Foto/Obs/Assin/Produtos,
"Foto ×N", "{{campo}}: desligado|opcional|obrigatório"); `exceptions` ("Exceções por cliente · N", a introdução "A exceção
vence a regra geral do tipo. …", "Nenhuma exceção neste tipo.", "Quem" Destinatário/Contratante, "Cliente", "Buscar por nome ou
CNPJ…", "Nenhum cliente encontrado.", as quatro mensagens de falha/estado, "Igual ao tipo", "Mínimo de fotos",
"Produtos exigidos", "O mínimo de produtos só vale quando Produtos é Obrigatório nesta exceção.", "Sem permissão para
alterar as exceções.", "Adicionar exceção", "Remover", "Remover exceção de {{name}}") e os rótulos de momento (usados já na
linha-resumo): "Separação no galpão", "Entrega da nota", "Chegada à parada", "Escritório, pelo motorista".

**Não coube / diferenças para a T6.1:** o formulário de adicionar tem Quem, Cliente e Foto (os outros quatro campos nascem
"Igual ao tipo" e se editam na linha, não no formulário, como o protótipo mostra); a lista é de cartões, não tabela (cabe
em 375); a busca do seletor casa o rótulo formatado, então digitar o CNPJ só com dígitos não casa (digitar com a máscara,
ou o nome, casa); lista de clientes carrega até 3000 ativos (30 páginas de 100); o `preview.html` não foi aberto no
navegador embutido nesta rodada (a comparação lado a lado é da T6.1).

## T5.3b — o seletor de momentos do tipo (2026-10-06)

`OccurrenceTypeMoments` (um `MultiSelect` do design system, dentro de `Tooltip dismissOnActivate`) entra no bloco do tipo
aberto **só quando a listagem traz `moments`** (API anterior não mostra o seletor). Os rótulos são os do `preview.html`:
"Separação no galpão", "Entrega da nota", "Chegada à parada", "Escritório, pelo motorista". Embaixo, a nota da RF1h:
"Observação, assinatura, produtos e fotos valem só nos momentos de rua (Entrega da nota e Chegada à parada). Nos outros
momentos a regra é fixa."

**Recusa na tela, com o motivo à vista** (`role="alert"`; nada é gravado): conjunto vazio ("Escolha ao menos um
momento: sem nenhum o tipo não aparece para ninguém, então nada foi gravado.") e Entrega da nota + Chegada à parada
juntas ("… não podem estar juntas no mesmo tipo: o aplicativo do motorista mostraria o tipo duas vezes. Nada foi
gravado."). O seletor mostra o conjunto recusado enquanto o motivo está na tela; ao entrar um conjunto válido a edição
sai por `buildOccurrenceTypeUpdate(type, { moments })` — só `moments` vai no corpo, nenhum outro campo novo.
`readOccurrenceMomentsProblem` e `toOccurrenceMoments` (ordem canônica, descarta texto desconhecido) moram em
`shared/occurrenceMoments.service.ts`.

**As três recusas da API, cada uma com texto próprio** (`TRIP_FEEDBACK_KEY_BY_ERROR` via `resolveTripFeedbackKey`, em
`trip.feedback`; os códigos em `shared/occurrenceMoment.constant.ts`):

| Código                                         | Chave                                  | pt-BR                                                                                                                                             |
| ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OCCURRENCE_TYPE_MOMENTS_REQUIRED`             | `occurrenceTypeMomentsRequired`        | O tipo precisa de ao menos um momento: sem nenhum ele não apareceria para ninguém. Nada foi gravado.                                              |
| `OCCURRENCE_TYPE_MOMENTS_DOCUMENT_AND_STOP`    | `occurrenceTypeMomentsDocumentAndStop` | Entrega da nota e Chegada à parada não podem estar juntas no mesmo tipo: o aplicativo do motorista mostraria o tipo duas vezes. Nada foi gravado. |
| `OCCURRENCE_TYPE_MOMENTS_STAGE_CONFLICT` (409) | `occurrenceTypeMomentsStageConflict`   | Este tipo tem vários momentos e o grupo (galpão ou rua) não pode ser trocado sem eles. Ajuste os momentos e salve de novo; nada foi gravado.      |

(en espelhado; o contrato prova que cada código vira uma chave distinta de `serverRefused`, com texto nos dois idiomas
e diferentes entre si.)

Contrato primeiro, vermelho (antes da implementação):

```text
error: Cannot find module '@/modules/trip/shared/occurrenceMoment.constant' from '.../test/trip/occurrence-exception-service.contract.ts'
(fail) momentos do tipo (RF0, RF1h, T5.3b) > tirar o último momento é recusado na tela, com o motivo à vista, e nada é gravado
error: MOMENTS_NOT_FOUND
```

Mutação pedida — aceitar conjunto vazio de momentos (`readOccurrenceMomentsProblem` sem a linha do vazio):

```text
Expected length: 0
Received length: 1
(fail) momentos do tipo (RF0, RF1h, T5.3b) > tirar o último momento é recusado na tela, com o motivo à vista, e nada é gravado [37.52ms]
 11 pass
 1 fail
(fail) momentos do tipo (T5.3b, RF0) > conjunto vazio é recusado, nota e parada juntas também, o resto passa [0.15ms]
 2503 pass
 1 fail
```

**Gates das três tasks (primeiro plano, árvore final, 2026-10-06):** `bun install --frozen-lockfile` sem mudanças ·
`bun run typecheck` (raiz) saída 0 · `prettier --check .` e `bun run format:check` verdes ·
`bun run --cwd apps/frontend-transportada test`: `7005 pass, 0 fail` (contratos) e `634 pass, 0 fail` (lote DOM) ·
lint com a app como cwd: 0 erros (16 avisos anteriores) · `bun run --cwd apps/frontend-transportada build` ok.

## T5.3d, T5.3e e T5.4 — aviso ao contratante, busca e filtros, endereço antigo (2026-10-06)

O `preview.html` foi aberto no navegador embutido; por ser arquivo local o painel só o mostra como imagem estática
(`read_page`/`javascript_tool` recusam), então o desenho foi lido do próprio HTML/CSS: pílulas `aria-pressed` com marca
`+`/`✓`, cobre na ligada, rótulo mono por grupo (Momento · Exige · E ainda), busca no topo com "Limpar", e o bloco
"Notificação" com o texto do modelo escolhido numa caixa. Não houve print da tela real nesta rodada (vai para a T6.1).

### T5.3d — o aviso ao contratante no tipo aberto (RF1e)

`OccurrenceTypeNotification` (novo) reúne o interruptor `notifies`, a seleção do modelo (`Select` do design system dentro de
`Tooltip dismissOnActivate`) e a política de reentrega fica onde estava na linha, com a regra da 241/164 intacta. O modelo
mostra o conteúdo de duas formas: cada opção da lista já traz o começo do texto (`description`, 90 caracteres) e o modelo
escolhido aparece abaixo com **Assunto:** e o corpo inteiro. `buildOccurrenceEmailTemplateOptions` passou a devolver
`subject` e `body` (aditivo; `key`/`label` não mudaram) e `OccurrenceEmailTemplatesState` diz se a lista carregou, falhou
ou ainda carrega. Toda gravação sai por `buildOccurrenceTypeUpdate(type, { emailTemplateKey })` (o campo entrou no
`OccurrenceTypeEdit`), então `redeliveryPolicy` continua indo sempre (RF4).

Estados com o motivo em texto: tipo que não avisa desliga o modelo e a frase fica ligada por `aria-describedby`; modelo
legado (`emailSubject` sem chave) vem marcado "modelo próprio (legado)" com o texto antigo; chave que não está mais na lista
continua nomeada no seletor e a tela diz que ela não está ativa; lista que falhou ou carrega tem frase própria.
`OccurrenceTypeCatalogPanel` (que passou de 136 para 149 linhas) deixou de montar os grupos: `OccurrenceTypeList` os monta, e
`templateLabel` saiu de `Item`/`Row` (era só a linha de texto que o bloco novo substituiu).

Contrato primeiro, vermelho (`test/trip-hooks/occurrence-type-notification.contract.ts`, antes de o componente existir):

```text
error: TEMPLATE_SELECT_NOT_FOUND
(fail) aviso ao contratante no tipo (RF1e) > a lista de modelos já mostra o texto de cada um antes de escolher [7.68ms]
(fail) aviso ao contratante no tipo (RF1e) > escolher outro modelo grava só a chave dele, e Sem e-mail grava nulo [4.93ms]
(fail) aviso ao contratante no tipo (RF1e) > tipo que não avisa: o modelo fica desligado com o motivo ligado por aria-describedby, e sem texto [3.98ms]
 2 pass
 7 fail
```

Verde depois: `17 pass, 0 fail` junto com `occurrence-type-row-edits` (9 casos novos: texto à vista, texto na lista aberta, só a chave
vai no corpo, `Sem e-mail` grava `null`, não avisa, legado, modelo sumido, lista que falhou, Produtos desligado esconde a política e
ligado grava só ela).

Mutação pedida (`itemsMode === 'off'` sem mandar `redeliveryPolicy: 'unset'`, em `buildOccurrenceTypeUpdate`), vermelha e revertida:

```text
(fail) buildOccurrenceTypeUpdate > Produtos Desligado manda itemsMode off e zera a política [0.07ms]
(fail) buildOccurrenceTypeUpdate > sair de Produtos obrigatório manda itemsMinimumCount nulo explícito [0.06ms]
(fail) linha do tipo de ocorrência: cada controle grava a sua edição > Produtos: Desligado leva a política para unset [12.47ms]
```

O contrato de texto `occurrence-type-catalog-template-select` passou a ler também o novo componente
(`occurrenceTypePanelSource.helper.ts`): sem isso `legacyTemplate` sumia do código-fonte lido e o contrato ficava vermelho —
nenhuma asserção foi afrouxada.

**Textos pt-BR novos** (`companySettings.occurrenceTypeCatalog.notification`, en espelhado): "Notificação"; "Modelo da
notificação" (dica: "O e-mail que o contratante recebe quando este tipo é registrado. O texto se edita em Notificações; aqui só
se escolhe qual modelo vale."); "Assunto:"; "O modelo só vale quando o tipo avisa o contratante. Ligue "Avisar quando
acontecer" para escolher."; "Carregando os modelos de e-mail…"; "Não foi possível carregar os modelos de e-mail. O modelo
atual segue valendo; recarregue a página para tentar de novo."; "O modelo "{{key}}" não está mais ativo, então nenhum e-mail
sai por ele. Escolha outro modelo.".

### T5.3e — busca e filtros-pílula combináveis (RF11b)

Função pura em `shared/occurrenceTypeFilter.service.ts` (`filterOccurrenceTypes`) e estado das pílulas em
`shared/occurrenceTypeFilterChips.service.ts` (`toggleOccurrenceTypeFilterChip`, `isOccurrenceTypeFilterChipPressed`,
`countActiveOccurrenceTypeFilters`). Regras: grupos combinam por E; em Momento vale qualquer um dos escolhidos; em Exige valem
todos e "exige" é `required`; Ativos/Inativos e Avisa/Não avisa são excludentes; Tem exceção olha a consulta em lote. Tipo
sem `moments` (API anterior) lê o grupo e o fluxo. A busca casa o nome do tipo, e o nome ou o CNPJ de quem tem exceção, sem
caixa nem acento; **o CNPJ casa com e sem máscara** (a consulta que só tem dígito e máscara é normalizada; texto com número
como "ponto 12" não vira CNPJ). Sem exceções carregadas a busca por nome do tipo segue e Tem exceção nunca casa.

Tela: `OccurrenceTypeFilters` (busca "Buscar tipos", "Limpar", 3 grupos de pílulas `aria-pressed` com marca `+`/`✓`, contador
`aria-live` "N de M tipos"), `OccurrenceTypeFilterEmpty` ("Nenhum tipo corresponde" + o motivo + "Limpar filtros"),
`useOccurrenceTypeFilters` (estado de tela). A pílula Tem exceção fica desligada com a frase de motivo ligada por
`aria-describedby` enquanto as exceções não carregam. CSS mobile-first (`occurrenceTypeFilters.module.css`): a fileira rola de lado
sem quebrar linha e sem estourar a página, alvos de `--touch-target`; de `40rem` em diante quebra linha e usa a altura compacta
(o contrato `responsive` recusou a primeira versão em `max-width`, e foi corrigido na fonte).

Contratos primeiro, vermelhos (`test/trip/occurrence-type-filters.contract.ts`, antes da implementação):

```text
error: Cannot find module '@/modules/trip/shared/occurrenceTypeFilter.service' from '.../test/trip/occurrence-type-filters.contract.ts'
 0 pass
 1 fail
 1 error
```

Verdes depois: `2518 pass, 0 fail` no contrato da viagem (14 casos novos: combinações, momento derivado, CNPJ com e sem máscara,
exceções não carregadas, pílulas excludentes, contagem) e `test/trip-hooks/occurrence-type-filters-panel.contract.ts`
(DOM, 6 casos: "3 de 3 tipos", combinação e contagem, busca por CNPJ `12345678000190` e `12.345.678/0001-90` e por nome, estado vazio
com motivo e "Limpar filtros", Tem exceção desligada com motivo e busca por nome viva, CSS de rolagem lateral e toque).

Mutações pedidas, vermelhas e revertidas:

```text
# o filtro "tem exceção" invertido (`exceptionCount !== 0`)
(fail) filtros da aba Tipos (RF11b) > tem exceção: só o tipo com ao menos uma, e sem exceções carregadas nenhum casa [0.19ms]
 2517 pass
 1 fail

# busca de CNPJ sem normalizar a máscara (`? trimmed : ''`)
(fail) filtros da aba Tipos (RF11b) > busca pelo CNPJ da exceção, com e sem máscara [0.16ms]
 2517 pass
 1 fail
```

Um contrato antigo (`occurrence-exceptions-panel`) lê o primeiro `[role="status"]` da página para a mensagem de clientes; o
contador novo usa só `aria-live`, para não tomar esse lugar.

**Textos pt-BR novos** (`companySettings.occurrenceTypeCatalog.filters`, en espelhado): "Filtros dos tipos"; "Buscar tipos";
"Buscar por nome do tipo, ou por nome / CNPJ de quem tem exceção"; "Limpar"; "Limpar filtros"; "{{shown}} de {{total}} tipos";
grupos "Momento", "Exige", "E ainda"; pílulas "Separação no galpão", "Entrega da nota", "Chegada à parada", "Escritório",
"Foto", "Observação", "Assinatura", "Produtos", "Ativos", "Inativos", "Avisa contratante", "Não avisa", "Tem exceção";
"O filtro Tem exceção fica indisponível enquanto as exceções não carregam."; "Nenhum tipo corresponde"; motivos "Nenhum tipo tem
esse nome, e ninguém com exceção tem esse nome ou CNPJ: "{{query}}"." e "Há 1 filtro ligado que nenhum tipo cumpre." /
"Há {{count}} filtros ligados que nenhum tipo cumpre juntos.".

### T5.4 — o endereço antigo

Os quatro contratos já afirmavam o endereço novo (commit `ea5c3bfde`) e estavam verdes antes e depois (`company-settings.contract.test.ts`:
`255 pass, 0 fail`): `tabs.contract.ts` (`settingsTabsOf('trip')` é `['proof','location','types']`),
`occurrence-type-attachment-mode`, `occurrence-type-catalog-template-select` e `occurrence-type-catalog-panel`. Este último ainda
tinha um caso que exigia o rótulo da aba velha em Configurações (`tabs.occurrenceTypes`) e um título "Viagens → Tipos": o caso
passou a afirmar o contrário (rótulo antigo ausente nos dois idiomas, rótulo novo `occurrenceFeed.tabs.types` presente e sem
"aviso") e o título diz "Ocorrências → Tipos".

Busca por links e textos (`rtk proxy grep -rn "company-settings.*occurrenceTypes\|tab=occurrenceTypes\|/company-settings#occurrence" apps docs`):
um único achado, `test/spec-185-prints.smoke.spec.ts:276` navegando a `/company-settings?tab=occurrenceTypes` (cairia na aba
Empresa); passou a abrir `/ocorrencias`, clicar a aba Tipos e abrir o tipo "Item avariado" antes de afirmar a caixa. ⚠️ Esse
smoke (Playwright) não foi executado nesta rodada. Também saíram a chave morta `tabs.occurrenceTypes` das duas traduções de
Configurações e o comentário "movido para Configurações → Tipos de ocorrência" do painel. Varredura de textos: nenhuma tradução do
painel nem do app do motorista manda o usuário para "Configurações > Tipos de ocorrência"; `docs/ai-context/frontend-transportada.md:1149`
cita "a aba Tipos de ocorrência" como história de um defeito da 218 e foi deixado como está.

### Gates (primeiro plano, árvore final, 2026-10-06)

`bun install --frozen-lockfile` sem mudanças · `bun run typecheck` (raiz) 0 erros · `prettier --check .` e `bun run format:check` verdes ·
`bun run --cwd apps/frontend-transportada test`: `7019 pass, 0 fail` (contratos) e `649 pass, 0 fail` (lote DOM) · lint com a app como
cwd: 0 erros (16 avisos anteriores) · `bun run --cwd apps/frontend-transportada build` ok.

**Não coube:** print da tela real nas três larguras e comparação lado a lado com o `preview.html` (T6.1); o smoke Playwright da 185 não
rodou; o preview mostra Foto/Assinatura/Produtos como pílulas de Exige com "Galpão/Rua" em Momento, e a tela segue os quatro momentos
da RF0 como a tarefa pediu.

## T6.1 — Revisão de design e usabilidade da aba Tipos (CA08, 2026-10-06)

**Ambiente (método das revisões da 240 T5.1 e da 241 T3.1).** Banco descartável `transportada_246_review` (`pg_dump` do banco local de dev
dentro do mesmo Postgres, migrado só nele até a `20261006184921`; o banco compartilhado não foi tocado), API desta árvore na 53091, Vite
do binário da app (`apps/frontend-transportada/node_modules/.bin/vite`) na 53090 com `VITE_SMOKE_AUTH_BYPASS=true`, e um proxy descartável
fora do repositório na 53092 que troca o `Authorization` pelo token real de `local-user` (PKCE contra o Keycloak local, renovado a cada
200 s; senha e token: `[REDACTED]`). O MinIO não foi necessário (a aba não toca storage). Dados criados pela API: 6 tipos novos (galpão +
rua, vários momentos, inativo, nome de 60 caracteres, nome de 60 caracteres **sem espaço**), exceções de contratante e destinatário
(até 7 num tipo, com nomes de 98 a 105 caracteres e um de 60 sem espaço), mínimos de foto 2–5 e de produtos, e o modelo de e-mail de
assunto e corpo longos com URL sem quebra. O `preview.html` foi servido por `python3 -m http.server`. Medição e prints: Chromium do Playwright
da app (o navegador embutido não grava arquivo). Tudo derrubado ao fim (ver "Encerramento").

**Método da medição (texto/JS, não olho).** Em 4 larguras (320, 375, 768, 1280) × 2 temas (claro e escuro) × 21 estados — lista recolhida,
filtros todos ligados, busca de 250 caracteres, tipo aberto, dropdowns abertos (momentos, modelo de e-mail, `Select` da exceção,
`SearchableSelect` de cliente com texto digitado), nome longo, nome sem espaço, inativo, galpão misto, momentos recusados, cadastro (com
dois dropdowns), erro do lote de exceções e erro da lista de clientes (respostas 500 forçadas no navegador) — um JS no navegador varre todos
os elementos visíveis e lista: `scrollWidth` do documento contra a largura; `right > innerWidth + 1` ou `left < -1`; filho que passa do
pai (`spill`); contêiner com `overflow` e `scrollWidth > clientWidth` (`boxes`); texto cortado com reticências; interseção de irmãos
(`overlaps`); alvo de toque `< 44px` (viewport `< 768` com `hasTouch`); contraste (cor composta sobre o fundo, com a `opacity` de todos os
ancestrais) abaixo de 4,5:1 (3:1 para texto grande). Resultado final: **168 estados medidos, 0 com problema** (0 estouro de página, 0 elemento
fora da viewport, 0 spill, 0 caixa com rolagem lateral não intencional, 0 sobreposição, 0 alvo de toque < 44px, 0 contraste < 4,5:1).
O instrumento foi validado revertendo a causa: sem `grid-template-columns: minmax(0, 1fr)` na lista do painel ele acusa
`ul scrollWidth 571 / clientWidth 357`.

**Console e rede.** Só `404` de `/public/landing-logo` (asset do rodapé, ruído de ambiente) e os `500` que o próprio teste força nos dois
estados de erro; nenhum erro de script.

### Estouros e defeitos achados (todos corrigidos)

Medidas "antes" a 375px (a largura em que o usuário os vê); 768 e 1280 não foram medidos antes das correções.

| #   | Onde (seletor)                                                                                                                                                                                   | Antes (375px)                                                                 | Causa                                                                                                 | Correção                                                                                                         | Commit                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | página inteira, lista recolhida (`span.name`, `fieldset`)                                                                                                                                        | rolagem lateral: documento 689px                                              | `fieldset` nasce com `min-inline-size: min-content`; nome sem espaço não quebrava (620px)             | `.group` com `min-width: 0` (fieldset de classe própria) e `.name { overflow-wrap: anywhere }`                   | `214ffdbc0`              |
| 2   | tipo aberto: `Select` Modelo da notificação (`button._trigger`, `div._trigger` do Tooltip)                                                                                                       | documento 965px; gatilho de 896px                                             | invólucro `inline-flex` do Tooltip sem teto + descrição `nowrap` + grids de coluna `auto`             | `max-width: 100%` no Tooltip; `minmax(0, 1fr)` em `.details`, `.notification`, `.occurrenceForm`                 | `214ffdbc0`, `f61576f07` |
| 3   | estado "sem resultado" da busca (`p.reason`)                                                                                                                                                     | documento 784px                                                               | texto digitado pelo usuário sem quebra                                                                | `overflow-wrap: anywhere` em `.reason`, `.emptyTitle`; `min-width: 0` em `.empty`                                | `214ffdbc0`              |
| 4   | exceção com cliente de nome sem espaço (`div.who`, `div.fields`)                                                                                                                                 | documento 739px                                                               | `li.entry` e `ul.list` em coluna `auto`; `.who` sem quebra                                            | `minmax(0, 1fr)` em `.list`, `.entry`, `.block`; `overflow-wrap: anywhere` em `.who`                             | `214ffdbc0`              |
| 5   | pílulas de filtro (`div.chips`)                                                                                                                                                                  | fileira de 1725px que rolava de lado, pílulas fora da tela                    | decisão da T5.3e (nowrap + `overflow-x: auto`), que o preview não tem                                 | `flex-wrap: wrap`, cada grupo na sua linha (`flex: 1 1 100%`), `max-width: 100%` na pílula                       | `214ffdbc0`              |
| 6   | painéis do `Select`, `MultiSelect`, `SearchableSelect` (`div.panel`)                                                                                                                             | 8→581px, 8→392px e 8→789px (a viewport tem 375)                               | painel de largura da opção mais longa, sem teto                                                       | `max-width: calc(100vw - var(--space-4))` nos três; rótulo da opção passa a quebrar                              | `f61576f07`              |
| 7   | lista do painel (`ul._list`)                                                                                                                                                                     | `scrollWidth 571 / clientWidth 357`: detalhe da opção cortado sem reticências | `ul` em `display: grid` de coluna `auto`                                                              | `grid-template-columns: minmax(0, 1fr)`                                                                          | `99500882c`              |
| 8   | dica do `Select` de modelos (`div._layer`)                                                                                                                                                       | a dica reabria por cima das opções e as cobria                                | o foco da busca do painel (em portal) sobe pela árvore do React até o `onFocus` do Tooltip            | `onFocus` só abre quando o alvo está dentro do gatilho                                                           | `99500882c`              |
| 9   | bloco O que exige a 320px (`section._requirements`)                                                                                                                                              | filhos 17px mais largos que a seção                                           | coluna `auto`                                                                                         | `minmax(0, 1fr)` e `minmax(min(100%, 11rem), 1fr)`                                                               | `6a1d4ec74`              |
| 10  | alvos de toque: gatilho compacto 38px (14 por tela), "Limpar momentos" 28px, "Tirar momento" 42px, busca do painel 27px, opções 35px (305 linhas de cliente)                                     | < 44px                                                                        | `triggerCompact`, `clearAll`, `remove` encolhido pelo flex, `searchInput`, `option` sem piso no toque | `@media (pointer: coarse)` sobe a `var(--touch-target)`; `.remove { flex: 0 0 auto }`                            | `f61576f07`              |
| 11  | contraste: tag de momento 4,3:1; opção escolhida e em foco 4,0:1; `Select` desligado 3,0:1; "Limpar" 3,0:1; chip Tem exceção 2,3:1; "Adicionar exceção" 2,1:1; rótulo da pílula de momento 4,3:1 | < 4,5:1                                                                       | `--color-slate` em texto, véu de cobre a 16 %, e `opacity` 0,5–0,6 no desligado                       | `--color-slate-muted`; véu de 5 % na opção escolhida; desligado = borda tracejada + `slate-muted`, sem `opacity` | `214ffdbc0`, `f61576f07` |

Contratos: `test/trip/occurrence-types-layout.contract.ts` (7 casos) e `test/design-system/floating-layer-viewport.contract.ts` (9 casos).
**Limitação registrada:** o ambiente de contrato não tem motor de layout, então eles leem a causa no CSS/código-fonte (não provam geometria); a prova
de geometria é a medição no navegador acima, antes e depois. **Execução vermelha** (CSS e `select.tsx`/`OccurrenceTypeList` revertidos ao
`HEAD` anterior, `bun test ./test/trip.contract.test.ts ./test/design-system.contract.test.ts`):

```text
(fail) aba Tipos: nada passa da largura da tela (T6.1, CA08) > o grupo do cadastro é um fieldset com min-width 0 ...
(fail) aba Tipos: nada passa da largura da tela (T6.1, CA08) > o nome do tipo quebra em qualquer ponto ...
(fail) ... > detalhes, notificação, formulário e exceções usam uma coluna que encolhe
(fail) ... > as pílulas quebram em linhas, cada grupo na sua, como no preview — sem fileira que rola de lado
(fail) camadas flutuantes cabem na tela (T6.1, CA08) > os três painéis têm teto de largura na viewport
(fail) alvo de toque e contraste dos seletores (T6.1, CA08) > no toque o gatilho compacto, a opção e a busca sobem a 44px
 2930 pass
 14 fail
```

Os contratos antigos que afirmavam o contrário foram atualizados (o `mobile-first` aceitava só `display: grid` sem colunas; o de filtros exigia a
fileira rolante) — a regra nova é "uma coluna que encolhe" e "quebra em linhas". O defeito 8 (dica) **não** tem teste DOM: tentei um contrato
no `occurrence-type-notification` e ele passava também com a correção arrancada (o DOM de teste não reproduz o `focusin` vindo do portal), então
o removi em vez de deixar um teste que não prova nada; a prova é a medição (antes: `div._layer` de 352px sobre a lista; depois: nenhuma camada de dica) e uma asserção de
código-fonte em `floating-layer-viewport.contract.ts`.

### Preview × tela real (elemento → preview → tela real → veredito)

| Elemento                                  | Preview                                                                                          | Tela real                                                                                                                  | Veredito                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abas                                      | "Ocorrências" · "Tipos"                                                                          | "Feed" · "Tipos"                                                                                                           | Mantido: "Feed" é o nome que a aba tinha antes da 246; "Ocorrências" dentro da página Ocorrências repetiria o título (protótipo impreciso)                          |
| Título do painel                          | `h2` 1,1rem, bold, cor de texto                                                                  | era `h3` em classe de dica (cinza, 0,8rem); agora `h2` do painel                                                           | Defeito corrigido (`f2644581e`)                                                                                                                                     |
| Texto de apoio                            | "Cada tipo declara em que momentos … destinatário primeiro, depois contratante."                 | era o texto antigo ("Cadastre os tipos … o padrão é não avisar")                                                           | Defeito corrigido: texto do preview + a frase do aviso (pt e en)                                                                                                    |
| Busca + Limpar                            | campo largo + "Limpar"                                                                           | igual; "Limpar" desabilitado até haver filtro, agora com borda tracejada e 4,5:1                                           | Igual                                                                                                                                                               |
| Pílulas — grupos                          | Momento: Galpão, Rua · Exige: Foto, Assinatura, Produtos · E ainda: Avisa, Tem exceção, Inativos | Momento: os 4 momentos · Exige: + Observação · E ainda: Ativos, Inativos, Avisa, Não avisa, Tem exceção                    | Mantido: a RF11b lista momento, ativo/inativo, exigência, avisa/não avisa e tem exceção; o protótipo ficou incompleto                                               |
| Pílulas — quebra no celular               | quebram em linhas                                                                                | rolavam de lado (1725px); agora quebram, um grupo por linha                                                                | Defeito corrigido (`214ffdbc0`)                                                                                                                                     |
| Agrupamento "No galpão / Na rua"          | lista plana                                                                                      | `fieldset` por grupo (moldura só ≥ 40rem)                                                                                  | Mantido: com 15+ tipos o grupo ajuda a varrer; o protótipo mostrava 4. Contratos 156/218 afirmam o grupo                                                            |
| Linha do tipo recolhido                   | caret, nome, momentos, Foto/Obs/Assin/Produtos, ✉, contagem                                     | igual (+ etiqueta "Inativo"); tipo de galpão mostra só Produtos                                                            | Mantido: o preview mostra Foto/Obs/Assin em galpão, mas ali a regra é fixa (1 a 5 fotos) e não editável; mostrar estados seria afirmar uma exigência que não existe |
| Estado "desligado" da exigência (offNeed) | `color-mix(slate 55%)` — **2,77:1**                                                              | `slate-muted` + borda tracejada                                                                                            | Protótipo errado (contraste < 4,5:1)                                                                                                                                |
| Ordem dos blocos do tipo aberto           | Identificação · Momentos · O que exige · Notificação · Exceções                                  | era Notificação · Em uso · Momentos · O que exige · … · Exceções; agora na ordem do preview                                | Defeito corrigido (`f2644581e`), com contrato DOM                                                                                                                   |
| Identificação                             | Nome (campo), Situação (select), Devolução (select)                                              | Nome (campo, grava ao sair), Devolução, Registro (fluxo), "Em uso" e "Aceita vários itens" como caixas                     | Nome estava ausente (defeito, corrigido); Situação segue caixa "Em uso" (os contratos 164/166 usam a caixa)                                                         |
| Momentos                                  | gatilho de resumo + painel com 4 opções + dica                                                   | `MultiSelect` com resumo, fichas removíveis e "Limpar momentos", nota da RF1h; recusa vazio e nota+parada com `role=alert` | Mantido: componente do design system; as fichas dão o "tirar um" que o painel do preview não tem                                                                    |
| O que exige — rótulos                     | "Assinatura de quem recusou", "Produtos da nota"                                                 | "Assinatura", "Produtos"                                                                                                   | Protótipo específico de "Recusa total"; o rótulo serve a todo tipo                                                                                                  |
| O que exige — campos                      | 4 selects em grade + dica                                                                        | igual, e a marca "· regra geral" no título (`f2644581e`)                                                                   | Igual                                                                                                                                                               |
| Mínimos                                   | número de fotos sempre visível; "Produtos por ocorrência" + quantidade + total                   | seletor 1–5 só com foto obrigatória; "Produtos exigidos: Todos / Ao menos N" só com produtos obrigatório                   | Mantido: escolher de uma lista evita o campo livre e o `422`; a dica diz quando vale. "Vários/um produto" é a caixa "Aceita vários itens" na Identificação          |
| Notificação                               | select "Avisar" + select de modelo + caixa com assunto e corpo                                   | caixa "Avisar quando acontecer" + select de modelo com texto na lista + caixa com assunto e corpo                          | Igual no conteúdo; a caixa de avisar substitui o select Sim/Não                                                                                                     |
| Exceções — forma                          | tabela (6 colunas) a ≥ 680px; blocos abaixo                                                      | cartões; a ≥ 64rem vira linha (quem · campos · remover)                                                                    | Diferença registrada: tabela não cabe com os 2 mínimos por exceção, que o preview não tem; a linha larga dá a mesma leitura                                         |
| Exceções — campos por linha               | Foto, Observação, Assinatura, Produtos                                                           | + Mínimo de fotos e Produtos exigidos                                                                                      | Superconjunto (RF1c, RF1c2)                                                                                                                                         |
| Formulário de exceção                     | Quem, Cliente, 4 campos, botão (6 campos)                                                        | Quem, Cliente, Foto, botão (3 campos)                                                                                      | **Diferença não corrigida** (decisão da T5.3: os outros três nascem "Igual ao tipo" e se editam na linha); ver "Por decidir"                                        |
| Estado vazio                              | não desenhado                                                                                    | "Nenhum tipo corresponde" + motivo + "Limpar filtros"; texto digitado quebra dentro da caixa                               | Sem referência no preview; medido (defeito 3)                                                                                                                       |
| Estado de erro                            | não desenhado                                                                                    | "exceções indisponíveis" e lista de clientes falha com motivo em texto                                                     | Sem referência; medido nos dois                                                                                                                                     |
| Estado desabilitado                       | não desenhado                                                                                    | borda tracejada + motivo em texto ligado por `aria-describedby`; texto ≥ 4,5:1                                             | Corrigido (defeito 11)                                                                                                                                              |
| Cadastro de tipo novo                     | "Novo tipo" + nome + botão                                                                       | título "Novo tipo" + os controles de criação (nome, onde, aviso, produtos, devolução, fluxo, modelo) + botões lado a lado  | Controles extras são do cadastro real (a criação exige estágio e fluxo); título e botões corrigidos                                                                 |
| Espaçamento e densidade                   | `--space-*` do preview, campo compacto 2,4rem                                                    | mesmos tokens; no toque os alvos sobem a 2,75rem                                                                           | Igual; alvos maiores no toque por exigência da CA08                                                                                                                 |
| Foco                                      | contorno cobre 2px                                                                               | contorno cobre 2px em **45 de 45** paradas de Tab a 375 e 1280, ordem visual = ordem do DOM                                | Igual                                                                                                                                                               |
| O preview em si                           | —                                                                                                | —                                                                                                                          | O protótipo estoura a 375px (documento 412px; 103 elementos fora), tem 36 alvos < 44px e `offNeed` a 2,77:1: ele não é referência de estouro nem de contraste       |

**Medições (tela real).** Alvo de toque: 0 elementos interativos < 44px a 320 e 375 (antes: 14–17 por tela aberta; opções de 35px). Contraste mínimo do
texto na aba: **5,54:1 no tema escuro, 4,57:1 no claro** (o menor é o kicker "OPERAÇÕES" do cabeçalho da página, não da aba); disabled incluído. Foco:
45/45 paradas com anel de 2px (a 375 e a 1280), na ordem Limpar → pílulas → resumo do tipo → nome → devolução → registro → momentos → exigências
→ modelo → exceções.

### Prints (`prints/`, tema escuro, `NN-descricao-LARGURA.png`, 375 · 768 · 1280)

`00-preview` (protótipo, mesma largura) · `01-lista-recolhida` · `02-tipo-aberto-excecoes` · `03-dropdown-momentos` · `04-dropdown-modelo-email` ·
`05-dropdown-cliente-nome-longo` · `06-formulario-excecao-cliente-escolhido` · `07-nome-longo-sete-excecoes` (7 exceções, nomes de 98+ caracteres e um sem espaço) ·
`08-nome-sem-espaco` · `09-busca-sem-resultado` (250 caracteres) · `10-erro-excecoes-indisponiveis` — 33 arquivos. Tirados uma vez, depois das correções.

### Gates (primeiro plano, árvore final)

`bun install --frozen-lockfile` sem mudanças · `bun run typecheck` (raiz) saída 0 · `prettier --check .` e `bun run format:check` verdes ·
`bun run --cwd apps/frontend-transportada test`: `7035 pass, 0 fail` (contratos) e `652 pass, 0 fail` (lote DOM) · lint com a app como cwd: 0 erros
(16 avisos anteriores; o primeiro lint acusou 2 erros no contrato novo, corrigidos em `d5dd2647f`) · `bun run --cwd apps/frontend-transportada build` ok.

### Por decidir

1. Formulário de exceção com 3 dos 6 campos do preview (T5.3 decidiu "Igual ao tipo" + edição na linha).
2. Voltar a uma tabela real nas exceções (≥ 64rem) em vez da linha em cartões.
3. "Situação" como select Ativo/Inativo em vez da caixa "Em uso".
4. O botão do Select `compact` sobe a 44px no toque em **todo** o produto (regra do design system, `select.module.css`); vale conferir tabelas densas em tablet.
5. O `Select` desligado agora é borda tracejada sem `opacity` só neste componente; o `.ui-button:disabled` global (`opacity: 0.5`, 2,1:1) segue igual e só a aba Tipos tem o override.

### Encerramento

Vite (53090), proxy (53092), API (53091) e servidor do preview (53093) derrubados (`lsof` vazio nas quatro portas); banco `transportada_246_review` apagado.
O smoke Playwright da 185 (`spec-185-prints`) segue sem execução.

## Correções da revisão final (API) (2026-10-06)

Revisão independente (`code-reviewer`, opus) da parte API/banco. Cada achado: contrato vermelho primeiro, implementação, verde, mutação.

### M1 — a assinatura não pode ser também um anexo

Vermelho (contrato, antes da recusa; o schema deixava passar e o caso de uso não conferia):

```text
(fail) a assinatura não é também um anexo (spec 246, revisão final M1) > o schema da rota recusa o mesmo uuid na assinatura e no anexo único, com 400
(fail) a assinatura não é também um anexo (spec 246, revisão final M1) > o schema da rota recusa o uuid da assinatura dentro da lista de anexos, com 400
(fail) ... > o caso de uso recusa a assinatura repetida no anexo único, antes de gravar   (expect(received).toBeInstanceOf(expected))
(fail) ... > o caso de uso recusa a assinatura repetida na lista de anexos, antes de gravar
 2 pass
 4 fail
```

Verde: `signature-not-attachment.contract.ts` 6 pass. `refineAttachmentSelection` (`occurrence.schema.ts`) recusa com 400 a `signatureObjectId` igual a qualquer id de `attachmentObjectId`/`attachmentObjectIds`; `assessDriverOccurrence` repete a recusa no caso de uso (`TripOccurrenceSignatureIsAttachmentError`, 400, `TRIP_OCCURRENCE_SIGNATURE_IS_ATTACHMENT`), antes de qualquer conferência de mínimo de fotos — o WhatsApp e os testes chamam o caso de uso sem passar pelo schema.

Integração (`occurrence-signature-isolation`, 2 pass): com o tipo exigindo foto e assinatura, o mesmo upload nos dois campos (anexo único e lista) responde o erro, e `trip_document_occurrences` e `trip_document_occurrence_attachments` ficam com 0 linhas — logo o upload nem conta no mínimo de fotos nem aparece no demonstrativo.

Mutação (a recusa trocada por `void`): a integração fica vermelha.

```text
Expected constructor: [class TripOccurrenceSignatureIsAttachmentError extends ApiError]
Received value: undefined
(fail) a assinatura repetida como anexo é recusada e não vira foto ... > o mesmo upload como assinatura e como anexo: 400 estável, nenhuma ocorrência e nenhuma linha de anexo
 1 pass
 1 fail
```

### M2 — o PUT da exceção estourava a CHECK do par produtos (500)

Defeito: a exceção já gravada com `items_mode = 'required'` e `items_minimum_count = 3`, regravada com `itemsMode` diferente de `required` e **sem** o mínimo, deixava o mínimo antigo na linha (o `SET` do conflito só leva o que veio) e o banco recusava com `23514` — 500. E um mínimo chegando sem `required` no estado resultante (repositório chamado fora do schema da rota) também virava 500 cru.

Vermelho (`occurrence-override-minimum-shape.integration.ts`, antes da correção):

```text
PostgresError: new row for relation "company_occurrence_type_contractor_overrides" violates check constraint "occurrence_type_contractor_overrides_items_minimum_shape_check"
      errno: "23514",
 constraint: "occurrence_type_contractor_overrides_items_minimum_shape_check",
(fail) o PUT da exceção não estoura a CHECK do par produtos (spec 246, revisão final M2) > trocar o modo para outro que não required, ou para nulo, sem mínimo: o mínimo vai a nulo
(fail) ... > mínimo sem required no estado resultante: 422 estável, e a linha fica como estava
 0 pass
 2 fail
```

Correção: `toOverrideRequirementUpdate` grava `itemsMinimumCount: null` quando `itemsMode` vem diferente de `required` (modo ou nulo) e o mínimo vem ausente; `rethrowOverrideShapeViolation` traduz, pelo nome da constraint (`OCCURRENCE_OVERRIDE_ITEMS_MINIMUM_SHAPE_CHECKS`, as duas tabelas), o `23514` em `OccurrenceTypeItemsMinimumRequiresRequiredError` (422), nos dois `replace*Overrides`. O schema da rota já recusava o mínimo sem `required` declarado no mesmo item (400, `refineItemsMinimumPair`); a CHECK é a rede para quem chama fora dele.

Verde: 2 pass (modos `optional`, `off` e nulo, contratante e destinatário; quatro recusas 422 — mínimo com `off`, com o modo ausente sobre linha `optional`, com nulo, e destinatário —, linha intacta depois).

Mutações: (1) sem o zeramento do mínimo, o teste 1 fica vermelho (`23514`); (2) sem o `.catch(rethrowOverrideShapeViolation)`, o teste 2 fica vermelho (`PostgresError` cru em vez do erro de domínio).

### M5 — a porta das exceções do tipo passa a ser obrigatória

Defeito: `findOccurrenceTypeOverrides?` era opcional em `OccurrenceTypeOverridesReadPort`. Esquecê-la na composição ou num dublê não dava erro de tipo, e a exceção do contratante/destinatário deixava de valer em silêncio. O contrato de parede (`test/composition/occurrence-overrides-wiring.contract.ts`, varredura do texto de `main.ts`) tentava cobrir só a composição.

Vermelho (`overrides-port-required.contract.ts`, antes de tornar a porta obrigatória):

```text
$ bun run typecheck
test/trip-occurrence/overrides-port-required.contract.ts(42,7): error TS2578: Unused '@ts-expect-error' directive.
(fail) a porta das exceções do tipo é obrigatória (spec 246, revisão final M5) > omitir a porta não compila
 2 pass
 1 fail
```

Correção: a porta é obrigatória (`resolve-document-occurrence-requirements.service.ts`); os 16 dublês e fixtures de teste que montavam o `repository` sem ela ganharam o stub explícito (`async () => ({ contractorOverrides: [], recipientOverrides: [] })`); o contrato de parede foi apagado — o tipo vigia as duas composições de `main.ts` (app e WhatsApp), e o comportamento (a exceção da nota vale, a porta recebe empresa e tipo, nota sem contratante/destinatário não a consulta) fica no caso de uso, mais a integração `occurrence-effective-requirements-parity` pelo caminho real contra o banco.

Mutações, todas vermelhas no `bun run typecheck`:

```text
(a) esquecer a porta no ponto do WhatsApp em main.ts:
src/main.ts(1066,9): error TS2322: Type '{ findConfirmedUpload: ...
(b) voltar a porta a opcional:
src/trips/application/resolve-document-occurrence-requirements.service.ts(52,13): error TS2722: Cannot invoke an object which is possibly 'undefined'.
test/trip-occurrence/overrides-port-required.contract.ts(42,7): error TS2578: Unused '@ts-expect-error' directive.
```

Verde: `bun run typecheck` sem erros; `trip-occurrence`, `composition`, `driver-trip`, `field-trip-target` e `whatsapp-commands` (contratos) sem falha.

### B1 — o filtro `company_id` de `readOccurrenceTypeMoments` com duas empresas

Lacuna: nenhum teste prendia o `eq(companyOccurrenceTypeMoments.companyId, …)` da leitura em lote. A FK composta impede a linha de uma empresa apontar para o tipo de outra, mas não impede a leitura cruzada.

`occurrence-type-moments-tenant.integration.ts` (contra Postgres real, duas empresas, 1 pass): a empresa A lê os próprios momentos (`document`, `office`); a empresa B, perguntando pelos ids do tipo de A e do seu, recebe só o seu (`document`) e `listOccurrenceTypes` de B não traz o tipo de A.

Mutação (filtro `company_id` tirado de `occurrence-type-moments.query.ts`): vermelho.

```text
Expected: false
Received: true
(fail) os momentos do tipo respeitam a empresa (spec 246, revisão final B1) > perguntar pelo tipo de outra empresa devolve vazio; cada empresa lê só o seu
 0 pass
 1 fail
```

### B7 — strings repetidas viram constante

Sem mudança de comportamento (refactor coberto pelos contratos e integrações existentes): `'recipient'`/`'emitter'` em `driver-reachable-document.query.ts` e `drizzle-current-driver-trip.repository.ts` passam a `RECIPIENT_PARTICIPANT_ROLE` (já existia) e `EMITTER_PARTICIPANT_ROLE` (nova), e `'required'`/`'optional'` em `occurrence-override-requirement-columns.support.ts` e `occurrence-requirement-guard.policy.ts` a `REQUIRED_PROOF_FIELD_MODE` (já existia) e `OPTIONAL_PROOF_FIELD_MODE` (nova) — todas em `trips/domain/delivery-event.constant.ts`, o `.constant.ts` do escopo que já guardava as irmãs. `bun run typecheck` limpo; `trip-occurrence` + `driver-trip` (contratos) 755 pass, 0 fail.

### B11 — T1b.3: 409, não 404

`TripDocumentNotReachableError` responde **409** `TRIP_DOCUMENT_NOT_REACHABLE` (`trip.error.ts`), e o código e o teste da T1b.3 já usavam 409. O texto da task (`tasks.md` T1b.3), da CA00 (`spec.md`) e a linha da correção inicial neste arquivo diziam `404`; corrigidos. O `plan.md` não cita o status.

### B4 — o expurgo da 161 e a assinatura (conferido, sem alteração de código)

Lido: `apps/worker-transportada/src/trip-occurrence-attachment-purge/` (`drizzle-trip-occurrence-attachment-purge.repository.ts`, `trip-occurrence-attachment-purge-unit.service.ts`) e `drizzle-occurrence-upload.repository.ts` da API.

- O expurgo escolhe candidatos por `purpose in (trip_occurrence_attachment)`, `status <> 'deleted'` **e `retention_until < agora`** — nunca por falta de linha de anexo. A assinatura confirmada tem a finalidade `trip_occurrence_attachment` e `retention_until` de **cinco anos** (`resolveOccurrenceAttachmentRetentionUntil`, a mesma da foto), gravados na confirmação do upload.
- Sem linha em `trip_document_occurrence_attachments`, a unidade a trata como "objeto órfão" (`purgeOrphanObject`) — mas só **depois** de o prazo vencer. Portanto a assinatura **não é apagada antes da hora**: sai no mesmo dia da foto do mesmo registro, cinco anos depois.
- A retenção de cinco anos para a assinatura é a decisão já escrita no `plan.md` ("Segurança e tenant"); não há decisão de produto pendente nem desvio a corrigir. Fica como está.

### B5 — cabeçalho de copyright nas migrations

As migrations `…112823`, `…115725` e `…123712` ganharam o mesmo cabeçalho (`-- Copyright (c) 2026 Ada Technology. MIT License.` + `--`) que a `…131040` já tinha e que a regra 17 do `code-standart` pede de todo arquivo-fonte. Só o `migration.sql` mudou (comentário): `bun run db:generate` → `{"status":"no_changes","dialect":"postgresql"}` e o snapshot ficou intocado; `database-migration.contract` 92 pass.

### M4 — rebase sobre `origin/staging` e as quatro migrations refeitas

`git fetch` + `git rebase origin/staging` (22 commits da staging, entre eles a migration `20261006144825_cargo_arrival_check_null_holes`, filha do mesmo pai `20261006033752` da 241). Conflitos só em `apps/api-transportada/package.json` (listas de teste de uma linha, resolvidas por mescla de três vias token a token: `test` 199 e `test:integration` 194 arquivos, JSON válido, sem duplicados, todos existem) e em `test/database-migration/static-migration.contract.ts` (a lista ordenada das migrations). Nenhum conflito de código.

O rebase bifurcou a cadeia de snapshots (`…144825` e `…112823` com o mesmo `prevIds`). As quatro migrations da 246 foram **apagadas e regeradas em ordem**, por cima da última da staging, com o schema de cada passo (o `src/database` do commit original de cada uma) e `db:generate`; o SQL e os `rollback.sql` foram reaplicados idênticos (só o nome muda: comentários e o `DELETE` do journal):

| antes                                                               | depois                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| `20261006112823_occurrence_type_requirement_modes`                  | `20261006184835_occurrence_type_requirement_modes`     |
| `20261006115725_occurrence_type_moments`                            | `20261006184901_occurrence_type_moments`               |
| `20261006123712_occurrence_type_quantity_minimums`                  | `20261006184909_occurrence_type_quantity_minimums`     |
| `20261006131040_street_occurrence_attachment_backfill` (`--custom`) | `20261006184921_street_occurrence_attachment_backfill` |

Comparação com as de antes: `migration.sql` e `rollback.sql` idênticos linha a linha (0 diferenças depois de mapear os nomes). Os quatro `snapshot.json` diferem do anterior só em `id`, `prevIds` e nas três CHECKs que a `…144825` da staging corrige (`cargo_arrivals`, `cargo_arrival_documents`, `cargo_arrival_events`) — herança legítima, não alteração nossa. Nenhum arquivo da 241 nem de outras specs foi alterado (`git diff origin/staging HEAD` só toca arquivos da 246).

Nomes atualizados em `static-migration.contract.ts`, nos cinco testes de integração que leem o `migration.sql` pelo caminho, no `plan.md` e neste arquivo (as menções antigas acima, nos relatos das fases, passam a citar o nome novo).

Prova: `bun run db:generate` → `{"status":"no_changes","dialect":"postgresql"}`; `bun run db:check` → `Everything's fine`.

## Gates finais da correção da revisão (API) (2026-10-06, depois do rebase)

- `bun install --frozen-lockfile`: sem mudanças. `bun run typecheck` (sete apps): limpo.
- `./node_modules/.bin/prettier --check .` e `bun run format:check`: limpos.
- Contrato da API (`bun --env-file=../../.env.test test --timeout 120000`): 9948 pass, 25 skip, 0 fail, 199 arquivos. Os skips são os testes de banco descartável, que o `db:test` exercita abaixo.
- Migration (`DRIZZLE_TEST_DATABASE_URL=… bun run db:test`, o que o `make migration-test` roda): 134 pass, 0 skip, 0 fail.
- Integração, um arquivo por vez, `--env-file=../../.env.test`, todos 0 fail e sem skip: os 16 da 246 (`occurrence-type-requirement-modes` 1, `occurrence-type-moments-registration` 2, `occurrence-type-moments-backfill` 1, `occurrence-type-quantity-minimums` 1, `occurrence-type-minimum-counts` 4, `occurrence-type-allows-multiple-items` 2, `street-occurrence-attachment-read` 3, `street-occurrence-attachment-backfill` 1, `street-occurrence-attachment-write` 2, `street-occurrence-photo-statement` 1, `occurrence-requirement-modes-registration` 3, `occurrence-requirement-modes-write` 5, `occurrence-effective-requirements-parity` 2, `occurrence-signature-isolation` 2, `driver-occurrence-attachment-list` 2, `occurrence-attachment-overrides-batch` 2); os três novos desta rodada (`occurrence-override-minimum-shape` 2, `occurrence-type-moments-tenant` 1, mais a `occurrence-signature-isolation` ampliada); os da 241 (`occurrence-type-items-mode` 5, `occurrence-type-leaves-document-behind` 4, `occurrence-type-redelivery-policy` 2, `occurrence-type-catalog-seed` 2, `trip-occurrence-type-items-read` 4, `trip-occurrence-attachment` 6); e os que receberam o stub da porta (M5): `event-location-stamp` 23, `trip-field-authorship` 5, `whatsapp-driver-flow-actions` 4, `me-trip` 21, `field-trip-target` 7.
- `bun run build`: exit 0. `bun run --cwd apps/frontend-transportada test`: 702 pass, 0 fail. `bun run --cwd apps/frontend-driver test`: 1242 pass, 0 fail.

## Correções da revisão final (painel) (2026-10-06)

Revisão independente (`code-reviewer`, opus) da parte painel/app/design. Cada achado: contrato primeiro e vermelho, depois o código, um
commit por achado (os SHAs estão na tabela do fim). O relato do usuário de "elementos fora dos limites" virou a varredura de geometria da
seção seguinte.

| achado | contrato (vermelho antes do código)                                                                                                                                                                                                 | mutação                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A4     | `design-system/tooltip.contract` "o gatilho só estica o filho com o modificador fill": `Expected: true / Received: false` (2 fail)                                                                                                  | —                                                             |
| A1     | `trip/occurrence-exception-service.contract` "adicionar nasce herdando tudo menos a foto": `Expected - 5 / Received + 0` (as cinco chaves `null` faltavam); DOM: `toHaveProperty("itemsMode")` `Unable to find property`            | tirar `noteMode: null`: os dois ficam vermelhos               |
| A2, M2 | `occurrence-type-moment-scope.contract`: `{separation, document}` sem a lista de exceções e sem a nota "As exigências abaixo valem só nos momentos de rua"; `{stop}` ainda mostrava Observação, Assinatura e Produtos               | `occurrence-requirement-scope.contract` (6 casos)             |
| M3     | mesmo arquivo: a legenda ainda dizia "ao menos um item da nota marcado" e não havia o aviso do app                                                                                                                                  | —                                                             |
| M5     | `occurrence-requirement-catalog-client.contract` passou a exigir "ausente continua ausente" (vermelho contra o `toOccurrenceType` que preenchia padrões); DOM: sem `noteMode`/`signatureMode`/`photoMinimumCount` o PUT não os leva | —                                                             |
| M1     | `occurrence-exceptions-panel.contract`: cada toque gravava (`saved` com 1 item antes do Aplicar), o seletor fechava, e o tipo recolhia quando a gravação o mudava de grupo                                                          | —                                                             |
| M4     | `occurrence-type-create-form.contract` (5 casos): o cadastro tinha "Foto do comprovante", "Fluxo de registro" e "Onde acontece" e não tinha Observação/Assinatura/momentos                                                          | —                                                             |
| M7     | `occurrence-exceptions-panel.contract` "diretórios" (2): `clientListCalls` já era > 0 ao abrir a aba, e o corte em 3000 não avisava; `occurrence-requirement-catalog-client.contract`: `GET /contractors` parava na página 1        | —                                                             |
| M8     | `occurrences-workspace-tabs.contract` (DOM, com e sem permissão; substitui a leitura de texto de fonte)                                                                                                                             | `listTripOccurrencesTabs` devolvendo sempre as duas: vermelho |
| A3     | `settings-resolution-panel.contract`: 2 fail (a tela renderizava só nome e `attachmentMode`)                                                                                                                                        | tirar `sources` do montador: vermelho                         |
| B1     | `design-system/select.contract`: o valor e o placeholder do `Select` cortavam com reticências                                                                                                                                       | —                                                             |

Trecho vermelho do A2/M2/M5 (rodada contra o código anterior, antes de a lista de exceções, o escopo e os controles ausentes existirem):

```
(fail) tipo de galpão e rua: as exigências da rua continuam à vista (A2) > {separation, document} mostra Foto, Observação, Assinatura e Produtos, a nota dos momentos de rua e a lista de exceções
(fail) tipo de galpão e rua: as exigências da rua continuam à vista (A2) > tipo só de galpão continua só com Produtos e sem lista de exceções
(fail) tipo só de parada: só a Foto vale (M2) > {stop} mostra só a Foto, sem mínimo de fotos, e a nota diz por quê; a exceção também declara só a foto
(fail) API anterior aos campos: o painel não oferece o que ela recusaria (M5) > sem noteMode, signatureMode e photoMinimumCount, esses controles não aparecem e o PUT não os leva
```

Decisões e limites, declarados:

- **Escopo pelo conjunto de momentos** (`readOccurrenceRequirementScope`): `document` cobra os quatro campos e o mínimo de fotos; `stop` (sem
  `document`) cobra só a Foto; Produtos vale em `document`, em `separation` e em tipo sem `stop`; as exceções existem em todo tipo com
  `document`, `stop` ou `office`. O `stage` deixou de decidir qualquer coisa na tela. O tipo só de escritório mostra Produtos e nada mais
  (o escritório manda só o `kind`, 218).
- **M3, o que o app faz:** a tela diz, à vista, que o app do motorista só marca "A nota inteira" e que "Ao menos N" ainda não muda o que ele
  cobra (limitação do §T4 acima, intocada).
- **M5:** `noteMode`, `signatureMode`, `photoMinimumCount` e `itemsMinimumCount` voltaram a ser opcionais no tipo. A listagem de uma API
  anterior (que recusa a chave com `.strict()`) não ganha mais controle para eles, e o cadastro novo e o `PUT` não os mandam.
- **M1:** a abertura do tipo mora na lista, por id; os momentos são rascunho (Aplicar/Desfazer). O tipo muda de grupo uma vez, no Aplicar.
- **M4:** o cadastro grava `stage` e `flow` derivados dos momentos (`deriveOccurrenceStage`/`deriveOccurrenceFlow`); com API sem `moments` o
  seletor de momentos não aparece e o corpo não leva a chave.
- **M7:** os dois diretórios só carregam quando algum tipo é aberto ou há busca digitada; contratantes seguem o cursor (até 30 páginas); a
  tela avisa "pode estar incompleta" quando uma lista bate no teto de 3000.
- **B6:** as traduções da aba **continuam** no namespace `companySettings` (mover as ~120 chaves tocaria as duas apps e todos os contratos de
  locale; risco sem ganho). Os comentários que prometiam a "Fase 5" foram corrigidos.
- **B8/B10** não estavam na lista desta rodada; **B2** (nome acessível da linha-resumo: o estado de cada campo vai em texto só-leitor, sem
  abreviações), **B3** (`Tirar momento <rótulo>`), **B4** (foto limpa após adicionar; o motivo do botão desligado à vista), **B5** ("Ao
  menos N itens"), **B7** (`OccurrenceTypeCreateForm` 168 linhas, `occurrenceTypeItem.module.css` 177 + dois arquivos novos,
  `useOccurrenceRegistrationForm.hook.ts` 169) e **B9/B11** (preview e `tasks.md`) estão feitos.
- **B3, seletores da exceção com o cliente no nome acessível: não coube** (renomear `aria-label` quebraria os ~30 contratos que localizam
  `button[aria-label="Observação"]`; o nome do cliente já encabeça a linha e o botão "Remover exceção de <cliente>" o repete). Fica registrado.

## Varredura de regressão visual contra a staging (2026-10-06)

**Ambiente.** Banco descartável `transportada_246_pano` (`pg_dump` do banco local de dev dentro do Postgres local 55432, migrado só nele com
as migrations desta árvore; o banco compartilhado não foi tocado), API desta árvore na 53091, proxy descartável fora do repositório (53093)
que troca o `Authorization` pelo token real de `local-user` (PKCE contra o Keycloak local; senha e token `[REDACTED]`), Vite do binário da
app (`apps/frontend-transportada/node_modules/.bin/vite`, nunca `bunx vite`) com `VITE_SMOKE_AUTH_BYPASS=true`: a branch em 53095 (e uma
cópia congelada do HEAD anterior em 53090), a **`origin/staging`** num worktree descartável (`git worktree add --detach … origin/staging`) em
53092, e o commit anterior à correção do Tooltip em 53094. Os dois lados falam com o mesmo proxy e a mesma API. Dados extras criados pela API:
cinco tipos novos (nome de 60 caracteres, nome de 60 sem espaço, inativo, galpão+rua, só parada) e exceções com sete clientes e um contratante.

**Método.** Playwright (Chromium) em 320, 375, 768 e 1280 (e 768 também com `pointer: coarse`), tema escuro e claro (troca de
`data-theme` no mesmo carregamento), 33 telas — `/`, `/freight`, `/cte-batches`, `/trips` e quatro `/trips/:id` (viagem em rota, concluída,
planejada, rascunho; com linha do tempo, pino de posição, paradas e documentos), `/mdfe-manifests`, `/billing`, `/nfse-invoices`,
`/operations`, `/ocorrencias`, `/recebimento`, `/company-settings`, `/usuarios`, `/papeis`, `/cte-profiles`, `/fleet`, `/pendencias`,
`/clientes`, `/repasses`, `/ressarcimentos`, `/resultados`, `/notificacoes` — **com todas as abas clicadas** e até 3 `Select`/`MultiSelect`/
`SearchableSelect` abertos por tela. Para cada estado um JS no navegador mede: `scrollWidth` do documento contra a largura; elementos com
`right > innerWidth + 1` ou `left < -1` fora de contêiner fixo ou rolável; texto cortado (`scrollWidth > clientWidth` com overflow
escondido); caixa com rolagem lateral; sobreposição de irmãos em flex/grid; largura e altura de todo controle (botão, link, campo, aba,
gatilho de tooltip), pareado entre os lados por nome acessível e ancestrais; painel aberto fora da viewport. (O instrumento acusa o defeito
que a correção do Tooltip tira: `pino de posição 303x14` no commit anterior.) ⚠️ Medi só depois de a tela assentar (sem skeleton, sem
`aria-busy`): a primeira rodada, sem isso, media telas ainda carregando e deu falsas diferenças.

### Tooltip (A4)

| tela                          | largura     | elemento (pino de posição, `TripTimelineLocation`) | staging | antes da correção | depois |
| ----------------------------- | ----------- | -------------------------------------------------- | ------- | ----------------- | ------ |
| `/trips/:id` (viagem em rota) | 375 (toque) | `button` do pino                                   | 14×14   | **303×14**        | 14×14  |
| `/trips/:id`                  | 1280        | `button` do pino                                   | 14×19   | 14×19             | 14×19  |

(O relato fala em 344px; medido a 375, o botão ia a 303px, com o ícone no meio da linha e a linha inteira clicável.) O
`Tooltip` só estica o filho com `fill`, e só os três seletores da aba Tipos pedem.

### Diferenças de geometria, staging × branch (a tabela antes/depois)

| tela                      | largura             | elemento                                                                                                                                                 | staging                                               | branch                                       | motivo / correção                                                                                                                                      |
| ------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/trips/:id` (3 viagens)  | 320, 375            | página                                                                                                                                                   | **rola até 422**                                      | 320 / 375                                    | a placa Mercosul (faixa de identidade do veículo) começava em x=262 numa grade `auto minmax(0,1fr)`; agora uma coluna só                               |
| `/trips/:id`              | 320                 | `fieldset` dos motoristas, e-mail longo                                                                                                                  | 318 (escondido sob os 422)                            | cabe (o `fieldset` encolhe, o e-mail quebra) | `min-width: 0` no `fieldset`, `overflow-wrap: anywhere` no contato                                                                                     |
| `/trips/:id`              | 320, 375            | cabeçalho do documento da parada (toggle)                                                                                                                | 334 / 554                                             | 239 / 459                                    | consequência: a página deixou de ser alargada a 422, o cartão volta à largura da tela                                                                  |
| `/fleet`                  | 320, 375, 768, 1280 | página                                                                                                                                                   | **rola até 886 (Regiões 1438)**                       | 320 … 1280                                   | o texto só-leitor "Sem ordenação" de cabeçalho dentro da tabela rolável nascia na posição estática; `left: 0`                                          |
| `/recebimento`            | 320                 | página; cartão do cabeçalho                                                                                                                              | 323; título 290 em caixa de 272                       | 320                                          | `grid-template-columns: minmax(0, 1fr)` no cartão do cabeçalho da aplicação                                                                            |
| `/ressarcimentos`         | 320                 | página; formulário em lote; 3 `Select`; painéis                                                                                                          | **369**; 326 em tela de 320; painéis fora da viewport | 320; painéis dentro                          | coluna que encolhe na casca, no painel, no formulário e no campo; `h1` global de 56px em caixa alta → 1,75rem; nome da tela no cabeçalho com `clamp()` |
| `/company-settings`       | 320, 375, 768       | `Select` "Código do banco"                                                                                                                               | 254×38                                                | 254×**54** (320) · ×44 (375/768, toque)      | o placeholder "Buscar banco por nome ou código" quebra linha em vez de cortar (B1) e o alvo sobe a 44px no toque                                       |
| `/mdfe-manifests`         | 320                 | `Select` "Tipo de emitente"                                                                                                                              | 246×48                                                | 246×**64**                                   | "Prestador de serviço de transporte" quebra linha (B1)                                                                                                 |
| todas com `Select`, toque | 320, 375, 768t      | gatilho compacto (`Prazo de vencimento`, `Período`, `Registros por página`, `CT-es por página`, `Notas por página`, `Situação`, 6 filtros de `/freight`) | 38–39 px de altura                                    | 44                                           | desejado (T6.1): alvo de toque de 44px em `pointer: coarse`                                                                                            |
| `/ocorrencias`            | 320, 375, 768t      | `LIMPAR FILTROS`                                                                                                                                         | 116×28                                                | 116×44                                       | desejado (T6.1): alvo de toque de 44px                                                                                                                 |

Sem nenhuma outra diferença de largura ou altura de controle nas 33 telas; **0 controle esticado ou encolhido sem motivo**, **0 painel de
`Select` aberto fora da viewport** (a staging tem 4, em `/recebimento` e `/ressarcimentos` a 320), **0 sobreposição de irmãos**.

### Estado final (branch), 4 larguras × 2 temas × todas as abas

- **0** página que rola na horizontal, **0** elemento fora da viewport, **0** texto cortado com reticências (fora o `srOnly` e o campo de
  texto, que cortam por desenho), **0** painel aberto fora da tela, em todas as telas acima. Na staging: `/fleet` (5 larguras), `/recebimento`,
  `/ressarcimentos` e três `/trips/:id` a 320/375.
- **Aba Tipos**, com os dados de estresse (7 exceções, nomes de 60 caracteres com e sem espaço, inativo, galpão+rua, só parada), tipos
  recolhidos e **todos abertos**, a 320/375/768/1280, claro e escuro, mais 14 painéis de seletor abertos: página = largura da tela, 0 elemento
  fora, 0 sobreposição, 0 painel fora da viewport.
- Achados **além do Tooltip**: (1) a faixa de identidade do veículo no detalhe da viagem (422px a 375); (2) o texto só-leitor das tabelas da
  frota (886/1438px); (3) o cartão do cabeçalho da aplicação em `/recebimento`; (4) a casca, o `h1` e o nome da tela em `/ressarcimentos`;
  (5) o `fieldset` dos motoristas da viagem; (6) texto de `Select` cortado só com `title` (B1: "Admite reentrega: Indefinido (não abre
  tr…", "Buscar por nome ou CNPJ…", "Todos os itens da nota"); (7) a tela de verificação, que com um nome de tipo sem espaço passava de 517px
  — reescrita pela A3, que já quebra o nome.
- Limitação: o ambiente de teste (`bun test`) não tem layout; a geometria foi provada por este navegador, e os contratos de CSS (`.triggerFill`,
  `.identityBand`, `.srOnly`, `.shell`/`.panel`/`.batchForm`/`.field`, `.application-wordmark`, `.driverChecklist`) travam a causa.

## Gates da correção da revisão (painel) (2026-10-06, primeiro plano)

- `bun install --frozen-lockfile`: sem mudanças. `bun run typecheck` (sete apps): limpo.
- `./node_modules/.bin/prettier --check .` e `bun run format:check`: limpos.
- `bun run --cwd apps/frontend-transportada test`: 7063 pass, 0 fail (contratos) e 724 pass, 0 fail (`test:hooks`, DOM). Lint da app: 0 erros.
  `bun run --cwd apps/frontend-transportada build`: exit 0.
- `bun run --cwd apps/frontend-driver test`: 1242 pass, 0 fail; lint 0 erros; `build`: exit 0.
- Tudo que subiu foi derrubado ao fim (ver "Encerramento da varredura").

### SHAs por achado

| achado                                              | commit                   |
| --------------------------------------------------- | ------------------------ |
| A4 (Tooltip só estica com `fill`)                   | `4b6d625da`              |
| A1 (exceção nova herda por nulo explícito)          | `aa70294ea`              |
| A2, M2, M3, M5, B2 (escopo por momentos, `Summary`) | `0e6ba5036`              |
| M1, B3 (momentos em rascunho, abertura por id)      | `be029fdb2`              |
| M4 (cadastro do tipo novo)                          | `53849bf7b`              |
| frota/viagem (placa, texto só-leitor)               | `7afda6cd9`              |
| B1 (texto do `Select` quebra linha)                 | `c197f1367`              |
| M7, B4 (diretórios, foto limpa, motivo do botão)    | `198b9bc20`              |
| M8 (aba Tipos por permissão e na URL)               | `172b3020d`              |
| A3 (verificação com os seis campos e a camada)      | `d7daae984`              |
| B5, B6, B7 (rótulo, comentários, css em três)       | `63fe4992e`              |
| B7 (motorista), B9, B11                             | `99b0db355`, `54962cf4a` |
| `/recebimento` e `/ressarcimentos` a 320px          | `e0068d46e`              |
| motoristas da viagem a 320px, lint                  | `6af7f475a`              |
| prettier                                            | `12a40c39b`              |

### Encerramento da varredura

Vite (53090, 53092, 53094, 53095), proxy (53093) e API (53091) derrubados (`lsof` vazio nas seis portas); banco `transportada_246_pano`
apagado; os worktrees descartáveis (`origin/staging`, HEAD anterior, commit anterior ao Tooltip) removidos.

## Correções da terceira revisão (2026-10-06)

Revisor: code-reviewer (opus), terceira rodada. Corrigidos A-1, M-1, M-2, M-3, M-4, B-2 e B-3; **B-1, B-4 e B-5 ficam como estão**
(registrados). Um commit por achado (SHAs no fim).

### A-1 — rebase sobre a staging e as quatro migrations refeitas

A staging ganhou 7 commits (spec 237 T3.2), entre eles a `20261006180700_cargo_arrival_receiving_occurrence`, com o **mesmo pai**
(`d59e8b1f`) da primeira migration da 246: duas folhas, `drizzle-kit check` em conflito. `git rebase origin/staging` (98 commits;
backup em `backup/pre-rebase-246`). Conflitos de texto resolvidos: as listas de teste do `package.json` da API (mescla de três vias,
token a token; conferido por script: **199** arquivos em `test`, **197** em `test:integration`, 0 ausentes, 0 duplicados, todo
`*.contract.test.ts`/`*.integration.ts` do disco está na lista), `delivery-proof-read.support.ts` (imports; `listOccurrenceTypes`
já combinava o `inArray(stage, TRIP_BOUND_OCCURRENCE_STAGES)` da 237 com o `withOccurrenceTypeMoments` da 246),
`database-migration.contract.test.ts`, `static-migration.contract.ts` e `docs/ai-context/api-transportada.md` (as duas seções).
Nenhum conflito de código sem saída.

As quatro foram apagadas e regeradas **uma a uma, na ordem**, com `db:generate` e o esquema do commit que a introduziu, e o SQL
**idêntico** reaplicado (os `.sql` copiados byte a byte das versões anteriores; `rollback.sql` com o nome novo no `DELETE` do journal):

| antes                                                  | depois                                                 |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `20261006184835_occurrence_type_requirement_modes`     | `20261006205139_occurrence_type_requirement_modes`     |
| `20261006184901_occurrence_type_moments`               | `20261006205158_occurrence_type_moments`               |
| `20261006184909_occurrence_type_quantity_minimums`     | `20261006205209_occurrence_type_quantity_minimums`     |
| `20261006184921_street_occurrence_attachment_backfill` | `20261006205232_street_occurrence_attachment_backfill` |

(a quarta com `drizzle-kit generate --custom`). Os nomes foram atualizados em `static-migration.contract.ts`, nos cinco testes de
integração que leem o `migration.sql`/`rollback.sql` pelo caminho e no `plan.md`; as menções acima neste `evidence.md` falam das
migrations pelos nomes do tempo em que foram escritas.

```text
bun run db:generate  -> {"status":"no_changes","dialect":"postgresql"}
bun run db:check     -> Everything's fine
DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL bun run db:test -> 138 pass, 0 fail (8 arquivos, 2075 expect)
```

### A-1 (3) — o tipo `receiving` não tem momento de rua

`deriveOccurrenceMomentsFromStageAndFlow` tratava todo `stage` que não era `separation` como rua: o tipo de recebimento da 237, sem
linha de momento, era lido como `['document','office']`. Vazamento **real** (integração contra Postgres, derivação antiga):

```text
fica fora da lista do motorista e do cadastro, e o motorista e o escritório não o registram
- { "code": "TRIP_DOCUMENT_NOT_REACHABLE", "status": 409 }
+ "ACCEPTED"
contrato: (fail) tipo de recebimento não tem momento de rua > nenhum par stage receiving deriva momento ...
          (fail) ... > sem linha de momento a leitura tolerante continua vazia, e nenhuma guarda o aceita
```

Correção: a derivação devolve `[]` para `receiving` (uma linha em `occurrence-moment.policy.ts`). Verde: contrato `trip-occurrence`
(494 pass), integração nova `occurrence-type-receiving-moments` (2 pass): o tipo fica fora das duas listas, o motorista recebe
`409 TRIP_DOCUMENT_NOT_REACHABLE`, o escritório `422 OCCURRENCE_TYPE_NOT_FIELD`, nenhuma ocorrência gravada. Mutação (voltar à
derivação antiga): integração 1 fail (o trecho acima) e contrato 2 fail; restaurada.

- **Escrita por momentos:** `PUT` com `moments` sobre um tipo `receiving` já era recusado — o `UPDATE` é restrito às etapas da
  viagem (`TRIP_BOUND_OCCURRENCE_STAGES`, spec 237) e a transação aborta antes de `replaceOccurrenceTypeMoments`: **404
  `TRIP_DOCUMENT_NOT_FOUND`**, sem linha de momento, `stage` intacto (provado no mesmo arquivo). Mantido o 404 da 237 em vez de um
  erro novo (o cadastro "não converte tipo de recebimento em tipo de viagem"). `deriveStageAndFlowFromMoments` nunca devolve
  `receiving`, e o corpo do `POST`/`PUT` só aceita `delivery|separation` (`z.enum`).
- **Backfill:** a migration de momentos filtra `stage = 'separation'` e `stage = 'delivery'` explicitamente: não gera linha para
  `receiving`. Preso em `occurrence-type-moments-backfill` com uma semente `receiving` (0 linhas), 1 pass.
- **Onde mais a 246 decide por `stage`:** `occurrence.policy.ts` (permissão por `separation`), `attach-occurrence-photo` e
  `dispatch-readiness` (leem a ocorrência, não o tipo). As guardas de tipo (`occurrenceTypeAcceptsMoment`: motorista, WhatsApp,
  escritório, parada, lista de campo) decidem pelo conjunto, agora vazio. No painel, a lista do cadastro vem filtrada pela API; o
  tipo `TripOccurrenceStage` do painel só conhece `delivery|separation` e `resolveOccurrenceMoments` é só o recuo para API sem
  `moments`. Sem mudança no painel.

### M-3 — o contrato do `Tooltip` prende o `className`, não o texto do CSS

`test/trip-hooks/tooltip-fill.contract.ts` (lote DOM) renderiza `<Tooltip>` com e sem `fill` e afirma a classe do invólucro (o bun
não gera nomes para CSS module: `mock.module` com espelho de identidade). Mutação, `className={styles.triggerFill}` fixo em
`tooltip.tsx` — o contrato de texto antigo segue verde (425 pass) e o novo reprova:

```text
Expected to not contain: "triggerFill"
Received: "triggerFill"
(fail) Tooltip: a classe do invólucro segue o modificador fill > sem fill o invólucro encolhe ao conteúdo; com fill ele estica o filho
```

### M-1 e M-2 — o cabeçalho e o título voltam à identidade da staging

Medido no navegador (Chromium do painel; `h1` em `Impact`), Vite da branch em 53090 e da `origin/staging` num worktree descartável em
53092, navegação do SPA entre as duas rotas, 320/375/768/1280, sem API (o `h1` e o nome da tela não dependem dela; autenticação por
`VITE_SMOKE_AUTH_BYPASS`). Corpo do `h1` / largura da caixa / rolagem do documento:

| rota, largura           | staging                                           | branch antes (3ª revisão)              | branch depois                                                                                                   |
| ----------------------- | ------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/ressarcimentos` 320   | 56px, texto 369px em caixa de 360, **página 369** | 28px, peso 800, sem caixa alta         | **41,6px**, caixa alta, 288/288, página 320                                                                     |
| `/ressarcimentos` 375   | 56,25px, texto 370 em caixa de 362 (vaza)         | 28px                                   | **48,75px**, 343/343, página 375                                                                                |
| `/ressarcimentos` 768   | 115,2px, caixa 741                                | 28px                                   | **115,2px, caixa 741** (= staging)                                                                              |
| `/ressarcimentos` 1280  | 140,8px, caixa 906                                | 28px                                   | **140,8px, caixa 906** (= staging)                                                                              |
| `/repasses` 320 / 375   | 56px / 56,25px, caixa 288 / 343                   | 28px                                   | **56px / 56,25px, 288 / 343** (= staging)                                                                       |
| `/repasses` 768 / 1280  | 115,2px / 140,8px, caixa 709 / 906                | 28px                                   | **= staging**                                                                                                   |
| nome da tela 320 / 375  | 32px (`Ressarcimentos`, 241px na caixa de 170)    | 20,8px / 24,4px, **em todas as telas** | **32px**; "Ressarcimentos" quebra em duas linhas (64px de altura), as outras telas ficam em uma, página 320/375 |
| nome da tela 768 / 1280 | 32px                                              | 32px                                   | 32px                                                                                                            |

(O primeiro retrato depois da correção do `h1` por `max-width` teve 144px a 1280 contra 140,8px da staging: o `index.css` tem um
`h1 { font-size: clamp(5rem, 11vw, 9rem) }` a partir de `64rem` que o espelho não repetia; corrigido e remedido.) Mudança: `.application-wordmark`
volta a `2rem` com `overflow-wrap: anywhere` e `min-width: 0` no contêiner; o `h1` do módulo só difere do global abaixo de `40rem` e
só na página de ressarcimentos (`.longTitle`, nos dois `<header>` dela); de `40rem` em diante repete o global nos dois pontos em que
ele muda, e o contrato lê os valores do `index.css`. O projeto só aceita `min-width` e três pontos (`responsive.contract.ts`), por
isso a faixa estreita é a base e a staging volta por `min-width`. Vite (53090, 53092) derrubados por PID (`lsof` vazio), worktree
descartável removido; nenhum banco nem API foi criado (nada a apagar).

### M-4 e B-2

M-4: o antes/depois do CSS global do `Select` (desligado sem `opacity`, véu da opção ativa de 16% para 10%, valor que quebra linha,
gatilho e busca de 44px no toque, painel com teto de largura) e o motivo (contraste 4,5:1 e alvo de toque) estão em
`docs/ai-context/frontend-transportada.md` § "Spec 246 — terceira revisão (painel)" e na varredura acima. B-2: o texto de apoio da
verificação lista foto, observação, assinatura, produtos e os mínimos, pt-BR e en; contrato reprovou antes (`Expected to contain: "observação"`,
`"note"`) e passa depois (5 pass).

### B-3

`drizzle-occurrence-attachment-overrides.repository.ts`: as duas `.transaction(...).catch(rethrowOverrideShapeViolation)` viraram
`try { await ... } catch (error: unknown) { rethrowOverrideShapeViolation(error) }`; `occurrence-override-minimum-shape` 2 pass.

### Gates (primeiro plano, depois do rebase)

- `bun install --frozen-lockfile` sem mudanças; `bun run typecheck` (7 apps) limpo; `prettier --check .` e `bun run format:check` limpos
  (um `api-transportada.md` da mescla foi formatado).
- Contrato da API: **10034 pass, 25 skip, 0 fail** (199 arquivos). Os 25 `skip` são `testWithPostgres` guardados por
  `API_TEST_DATABASE_URL` dentro dos arquivos de integração que as suítes de contrato importam; eles rodam na lista de integração abaixo.
- Integração, um arquivo por vez com `--env-file=../../.env.test`, 0 fail e 0 skip em todos: os 18 da 246 (`occurrence-type-requirement-modes`,
  `-moments-registration`, `-moments-backfill`, `-moments-tenant`, `-quantity-minimums`, `-minimum-counts`, `-allows-multiple-items`,
  `street-occurrence-attachment-read|backfill|write`, `street-occurrence-photo-statement`, `occurrence-requirement-modes-registration|write`,
  `occurrence-effective-requirements-parity`, `occurrence-signature-isolation`, `occurrence-override-minimum-shape`,
  `driver-occurrence-attachment-list`, `occurrence-attachment-overrides-batch`) mais `occurrence-type-receiving-moments`, os da 241
  (`items-mode`, `leaves-document-behind`, `redelivery-policy`, `catalog-seed`, `trip-occurrence-type-items-read`, `pending-items`) e os
  8 `cargo-arrival*` da 237. `db:test` 138 pass; `db:generate` `no_changes`; `db:check` limpo; `bun run build` ok.
- Painel: `bun run --cwd apps/frontend-transportada test` **7064 pass** (contrato, 34 arquivos) + **727 pass** (lote DOM); lint com a app como cwd
  **0 erros** (16 avisos antigos); typecheck e build ok. `bun run --cwd apps/frontend-driver test`: **1242 pass**, 0 fail.

### Commits

| achado                                    | SHA                      |
| ----------------------------------------- | ------------------------ |
| A-1 (rebase + quatro migrations refeitas) | `dacb06250`              |
| A-1 (3) (`receiving` sem momento de rua)  | `3dfd8cb38`              |
| M-3 (Tooltip no DOM)                      | `e969e3666`              |
| M-1, M-2 (cabeçalho e título)             | `828e40b60`, `d089e5fe0` |
| B-2, M-4 (hint, decisão do Select)        | `4683ffd8c`              |
| B-3 (try/catch)                           | `e5a822ed0`              |

## T6.3 — Gates finais e conferência dos oito commits da terceira revisão (2026-10-06)

Rodado em `work/spec-239` depois de `git fetch` e `git rebase origin/staging` (a staging avançou 3 commits, spec 237 T3.2b, **sem migration**:
`0c7339576`, `83ddb4ce7`, `0e31a602b`). O rebase só conflitou em `apps/api-transportada/package.json` (as duas listas de teste de uma linha, mescladas
token a token) e em `docs/ai-context/api-transportada.md` (as duas seções ficam). Depois dele: `test` 201 e `test:integration` 199 arquivos, sem
duplicado, nenhum que a staging ou o backup `backup/pre-rebase-246` tivesse deixa de estar na lista, e todo `test/integration/*.integration.ts`
do disco está nela. Todos os gates abaixo rodaram em primeiro plano, na árvore final (HEAD `2b943d116` mais esta evidência).

### Gates

| comando                                                                                                                                                                    | resultado                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                                                                                                            | sem mudanças                                                                                                                                                               |
| `bun run typecheck` (sete apps)                                                                                                                                            | pass                                                                                                                                                                       |
| `./node_modules/.bin/prettier --check .` e `bun run format:check`                                                                                                          | pass                                                                                                                                                                       |
| `bun run lint` (raiz) e `bun run lint` com cada uma das sete apps como cwd                                                                                                 | pass, 0 erros (16 avisos antigos de `exhaustive-deps` no painel)                                                                                                           |
| `bun run build` (todas as apps)                                                                                                                                            | pass                                                                                                                                                                       |
| contrato da API (`cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000`)                                                                       | **10042 pass, 25 skip, 0 fail** (199 arquivos) — os 25 skips são `testWithPostgres` que as suítes de contrato importam e que rodam nas listas de integração e do `db:test` |
| integração da API completa, lista inteira do `test:integration`, **199 arquivos em 10 blocos contíguos**, um bloco por vez, sem concorrência, `--env-file=../../.env.test` | **1073 pass, 8 skip, 0 fail** (detalhe abaixo)                                                                                                                             |
| `DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL bun run db:test` (o que o `make migration-test` roda, sem o `postgres-up`)                                                        | **138 pass, 0 skip, 0 fail** (8 arquivos)                                                                                                                                  |
| `bun run db:generate`                                                                                                                                                      | `{"status":"no_changes","dialect":"postgresql"}`                                                                                                                           |
| `bun run db:check`                                                                                                                                                         | Everything's fine                                                                                                                                                          |
| `bun run --cwd apps/frontend-transportada test`                                                                                                                            | **7064 pass** (contrato, 34 arquivos) + **727 pass** (lote DOM), 0 fail                                                                                                    |
| `bun run --cwd apps/frontend-driver test`                                                                                                                                  | 1242 pass, 0 fail                                                                                                                                                          |
| `bun run --cwd apps/worker-transportada test`                                                                                                                              | 1640 pass, 0 fail (96 arquivos)                                                                                                                                            |
| `bun run --cwd apps/cron-transportada test`                                                                                                                                | 101 pass, 0 fail (8 arquivos)                                                                                                                                              |
| `make check` (alvo inteiro, 4 min 19 s)                                                                                                                                    | **pass** (format, lint, typecheck, `bun run test` de cada app — a da API sem `--env-file`: 10033 pass, 34 skip, 0 fail —, build)                                           |

`make migration-test` **não rodou como alvo** (ele sobe o Postgres do Docker por `postgres-up`); rodou o comando que ele executa, `db:test`, no Postgres de teste
127.0.0.1:65432 com `DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL` do `.env.test`.

### Integração, bloco a bloco (ordem do `package.json`)

| bloco | do arquivo → ao arquivo                                                          | arquivos | pass | skip  | fail |
| ----- | -------------------------------------------------------------------------------- | -------- | ---- | ----- | ---- |
| 00    | `server` → `identity-subject-relink`                                             | 20       | 77   | 0     | 0    |
| 01    | `invitation-status-join` → `trip-field-office-review`                            | 20       | 201  | 0     | 0    |
| 02    | `trip-field-office-router` → `contractor-mail-settings-repository`               | 20       | 134  | 0     | 0    |
| 03    | `location-retention-settings` → `contractor-contact-channels`                    | 20       | 72   | 0     | 0    |
| 04    | `occurrence-conversation-schema` → `migration-completeness`                      | 20       | 160  | **7** | 0    |
| 05    | `fiscal-schema.contract.test` → `address-correction-repository`                  | 20       | 88   | 0     | 0    |
| 06    | `address-correction-mail-repository` → `package-box-unit-estimate`               | 20       | 114  | 0     | 0    |
| 07    | `trip-occurrence-attachment` → `occurrence-type-leaves-document-behind`          | 20       | 78   | **1** | 0    |
| 08    | `occurrence-type-redelivery-policy` → `local-fleet-seed-crew`                    | 20       | 110  | 0     | 0    |
| 09    | `occurrence-type-requirement-modes` → `occurrence-effective-requirements-parity` | 19       | 39   | 0     | 0    |

**O que pulou e por quê (pulado não é verde):**

- Bloco 04, 7 skips, achados rodando cada arquivo sozinho: `migration-completeness.integration.ts` (3) e `database-migration.contract.test.ts` (4), os dois guardados por
  `DRIZZLE_TEST_DATABASE_URL`, que o `.env.test` não define. **Rodados de novo com a variável:** `migration-completeness` 3 pass, 0 skip; o contrato de migration
  roda inteiro dentro do `db:test` (138 pass, 0 skip).
- Bloco 07, 1 skip: `trip-occurrence-upload-confirm.integration.ts`, o `testWithStorage` (MinIO inalcançável nesta máquina; a imagem é privada no GHCR e a CI também não a sobe).
  **Não foi exercitado aqui.** O arquivo não é da 246 (`git diff origin/staging` vazio).

### Conferência dos oito commits sem revisão independente

Lidos por `git show`, procurando regressão (hashes de antes do rebase `dacb06250`, `3dfd8cb38`, `e969e3666`, `828e40b60`, `d089e5fe0`, `4683ffd8c`, `e5a822ed0`, `000da603f`;
depois do rebase `b046107f2`, `0eb4a8655`, `d12a13f73`, `826e93330`, `89444abef`, `2f939d0cf`, `c71b0b130`, `2de9b6d8b`). **Nenhuma regressão achada.**

- `b046107f2` (migrations): ver a próxima subseção.
- `0eb4a8655` (`receiving`): uma linha de guarda em `deriveOccurrenceMomentsFromStageAndFlow`; o resto é teste. A semente `receiving` do backfill espera 0 linhas e o
  `expect` de contagem agora filtra `moments.length > 0`, sem afrouxar os outros tipos (cada um segue comparado ao conjunto esperado, `?? []` só para o tipo vazio).
- `d12a13f73` (Tooltip): só teste novo, com `mock.module` do CSS por espelho de identidade; entrou na lista do lote DOM (`trip-hooks.contract.test.ts`).
- `826e93330` e `89444abef` (cabeçalho): `.application-wordmark` volta a `2rem` (identidade da staging) com `min-width: 0` no contêiner; o `h1` só muda em `.longTitle`
  (nos dois `<header>` de ressarcimentos), base abaixo de `40rem` e a staging de volta por `min-width`. `/repasses` não usa a classe. O contrato lê os valores do `index.css`.
- `2f939d0cf` (hint da verificação): só locale pt/en, contrato por palavra.
- `c71b0b130` (try/catch): `rethrowOverrideShapeViolation` devolve `never` e **sempre** lança (a CHECK conhecida vira 422, qualquer outra propaga), então o `catch` não engole erro;
  a transação é a mesma. `occurrence-override-minimum-shape` verde no bloco 09.
- `2de9b6d8b`: evidência, contexto da API e um ajuste de lint no contrato do Tooltip.

### Migrations: cadeia linear e SQL idêntico

Cadeia de `prevIds` lida dos `snapshot.json`: `20261006180700` (237, `ed7fba64`) → `…205139` (`1bd14adf`, prev `ed7fba64`) → `…205158` (`03ada616`, prev `1bd14adf`) →
`…205209` (`f738435d`, prev `03ada616`) → `…205232` (`4aafa5e2`, prev `f738435d`). Uma folha só; `db:check` limpo.

SQL contra `backup/pre-rebase-246` (nomes antigos `…184835/184901/184909/184921`, mapeados para os novos):

| migration                                       | `migration.sql`                | `rollback.sql`                   |
| ----------------------------------------------- | ------------------------------ | -------------------------------- |
| `…205139_occurrence_type_requirement_modes`     | idêntico                       | só o nome no `DELETE` do journal |
| `…205158_occurrence_type_moments`               | idêntico                       | só o nome no `DELETE` do journal |
| `…205209_occurrence_type_quantity_minimums`     | idêntico                       | só o nome no `DELETE` do journal |
| `…205232_street_occurrence_attachment_backfill` | só o nome citado no comentário | só o nome no `DELETE` do journal |

O backfill de momentos (`…205158`) tem cinco `INSERT` e todos filtram por `stage = 'separation'` ou `stage = 'delivery'`: **não gera linha para `stage = 'receiving'`**
(preso por `occurrence-type-moments-backfill`, com semente `receiving` esperando 0 linhas).

### Duas mutações minhas (restauradas; `git status` limpo depois)

**1. `deriveOccurrenceMomentsFromStageAndFlow` volta a tratar `receiving` como rua** (apaguei a linha `if (params.stage === TRIP_OCCURRENCE_STAGE.receiving) return []`).
Integração `occurrence-type-receiving-moments`:

```text
error: expect(received).toEqual(expected)
- {
-   "code": "TRIP_DOCUMENT_NOT_REACHABLE",
-   "status": 409,
- }
+ "ACCEPTED"
- Expected  - 4
+ Received  + 1
(fail) o tipo de recebimento não é de rua (spec 246 A-1, spec 237) > fica fora da lista do motorista e do cadastro, e o motorista e o escritório não o registram [1809.61ms]
 1 pass
 1 fail
Ran 2 tests across 1 file. [3.82s]
```

Contrato `trip-occurrence.contract.test.ts`:

```text
- Expected  - 1
+ Received  + 4
(fail) tipo de recebimento não tem momento de rua (spec 246, terceira revisão A-1; spec 237) > nenhum par stage receiving deriva momento, com flow de nota ou de parada [0.14ms]
- Expected  - 1
+ Received  + 4
(fail) tipo de recebimento não tem momento de rua (spec 246, terceira revisão A-1; spec 237) > sem linha de momento a leitura tolerante continua vazia, e nenhuma guarda o aceita [0.05ms]
 492 pass
 2 fail
```

**2. Tirar o `UPDATE ... SET "note_mode" = 'required'` de `…205139_occurrence_type_requirement_modes/migration.sql`** (linha 19):

```text
### occurrence-type-requirement-modes
error: expect(received).toEqual(expected)
- Expected  - 1
+ Received  + 1
(fail) a exigência vira dado sem mudar o que já está gravado (spec 246 T1.3) > tipo e exceções antigos saem com observação e assinatura conforme a regra da 179 [1599.10ms]
 0 pass
 1 fail
### occurrence-requirement-modes-registration
error: expect(received).toBeInstanceOf(expected)
Expected constructor: [class TripOccurrenceNoteRequiredError extends ApiError]
Received value: undefined
(fail) a observação obrigatória sobrevive à migration (spec 246 T2.3b, CA04) > tipo com foto required gravado antes das colunas novas: sem nota, NOTE_REQUIRED [1681.25ms]
 2 pass
 1 fail
```

Restaurados byte a byte (`cp` do backup e `git status` sem diferença): `occurrence-moment.policy.ts` e `migration.sql`.

## T6.2 — Contexto vivo (2026-10-06)

Commit `2b943d116`. Núcleo normativo (um bloco por arquivo, no tamanho dos vizinhos, uma pegadinha por parágrafo): `CLAUDE.md` da raiz, `apps/api-transportada/CLAUDE.md`,
`apps/frontend-transportada/CLAUDE.md` e `apps/frontend-driver/CLAUDE.md` — a exceção nula que herda campo a campo; o momento como conjunto com a permissão fixa por caso de uso; o servidor aplicando a exceção
por nota; a assinatura em `signature_object_id`, nunca como anexo; a foto de rua só de nota, com escrita dupla; a aba Tipos em `/ocorrencias`; `receiving` sem momento de rua; a publicação em etapas.
Histórico e formatos de resposta: `docs/ai-context/api-transportada.md`, `frontend-transportada.md` e `frontend-driver.md` (seções "Spec 246 — …"). `apps/worker-transportada` e `apps/cron-transportada`
não mudaram. Numeração: a 241 citava a exigência como "239" em `spec.md`, `plan.md`, `tasks.md` e `evidence.md`; passou a "246" (a `239-o-expurgo-se-liga-na-tela` continua 239; o `evidence.md` da 241 manteve
a linha 404, que cita o título literal de um commit, e a 677, que é a do expurgo). Sem marcador de conflito em nenhum arquivo tocado; `prettier --check .` limpo.

## Fechamento (T6.4)

### Veredito das passadas de revisão independente (T6.1b)

`code-reviewer` em `opus`, numa passada separada da autoria, três vezes; cada uma reprovou e exigiu correção, e a seguinte conferiu.

| passada                     | escopo                | veredito e o que exigiu                                                                                                                                                                                                                                                                                                                                                                                                     | onde está                                                              |
| --------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1ª — revisão final (API)    | API e banco           | **Reprovada**: M1 (assinatura repetida como anexo), M2 (`PUT` da exceção estourava a CHECK do par produtos, 500), M5 (porta das exceções opcional), B1 (filtro de empresa dos momentos sem teste com duas empresas), B4 (expurgo × assinatura, conferido), B5, B7, B11, M3 (pré-requisitos de produção à vista) e M4 (rebase). Tudo corrigido, com contrato vermelho e mutação                                              | "Correções da revisão final (API)"                                     |
| 2ª — revisão final (painel) | painel, app e design  | **Reprovada**: A1 (exceção nova herdava por padrão), A2 (escopo por momentos), A3 (verificação com os seis campos), A4 (Tooltip esticava o filho), M1–M8, B1–B11; mais o relato de elementos fora dos limites, que virou a varredura de geometria contra a staging (33 telas × 4 larguras × 2 temas). Tudo corrigido, **exceto** o B3 dos seletores da exceção com o cliente no nome acessível, registrado como "não coube" | "Correções da revisão final (painel)", "Varredura de regressão visual" |
| 3ª — terceira revisão       | o que sobrou das duas | **Reprovada**: A-1 (a staging ganhou a `20261006180700`, com o mesmo pai da primeira migration; e `receiving` vazava para a rua), M-1/M-2 (cabeçalho e título regrediam a staging), M-3 (Tooltip no DOM), M-4 e B-2 (decisão do `Select` global e hint da verificação), B-3 (`.catch` → `try/catch`). **B-1, B-4 e B-5 ficam como estão** (o texto desses três achados não foi guardado no repositório; só o veredito)      | "Correções da terceira revisão"                                        |

⚠️ Os oito commits da 3ª passada (`b046107f2` … `2de9b6d8b`) **não tiveram quarta passada independente**: a conferência da seção "T6.3" é do autor (leitura por `git show`, as migrations comparadas ao backup,
o gate completo e duas mutações) e não substitui uma revisão separada.

### Decisões do usuário (fechadas; não reabrir)

- **2026-10-02:** conjunto de exigências (foto, observação, assinatura, produtos); o momento de galpão continua com a regra da 161.
- **D-a** (2026-10-06): as colunas novas das duas tabelas de exceção são nulas e sem default; nulo herda do tipo, campo a campo.
- **D-b**: o servidor cobra a exigência efetiva da nota (tipo + exceção de contratante + exceção de destinatário, lidos da nota no servidor, nunca do payload nem da URL).
- **D-c**: `separation + stop` vira `stop` no backfill de momentos (preserva todo leitor; fechar o furo é outra spec).
- **D-d**: só a ocorrência de nota (`document`) guarda N fotos; a assinatura mora em `signature_object_id`, nunca como linha de anexo; o demonstrativo ao cliente mostra a foto de rua e a resposta da correção.

### Decisões dos executores que o usuário pode vetar

- RF13: o WhatsApp do motorista **não filtra** a lista por exigência; tipo com assinatura `required` volta o erro estável e a conversa o traduz na frase do que falta.
- O par `items_mode` + `items_minimum_count` vai junto na exceção (nulo em `items_mode` herda o par); sem CHECK `off ⇒ unset` nas exceções.
- `signature_object_id` também em `trip_stop_occurrences`, **sem escritor nem leitor**, para não exigir segunda migration.
- `findConfirmedUpload` passou a exigir que o upload (foto e assinatura) seja **do motorista**: aperta o anexo único, que antes só conferia empresa e viagem; o escritório segue sem esse filtro.
- `photoMode` é cópia de `attachmentMode` por um ciclo; a rota do motorista aceita `attachmentObjectIds` (1–5) retrocompatível com o campo único.
- O `PUT` de tipo de um painel anterior à 246 que passe a foto para `required` sem mandar `noteMode` **não arrasta mais a observação** (a regra saiu do código); só vale na janela entre API e painel.
- Escopo dos campos pelo conjunto de momentos na tela: `stop` só pede a foto, `office` só Produtos; conjunto vazio e `document + stop` juntos são recusados.
- `PUT` com `moments` sobre tipo `receiving` segue 404 (a da 237), sem erro novo.
- A assinatura tem a mesma retenção de cinco anos da foto; o expurgo da 161 só a apaga no prazo.
- Aparência global que mudou: `Select` (desligado sem `opacity`, opção ativa a 10%, texto que quebra, alvo de 44 px no toque) e `Tooltip` só estica o filho com `fill`; "Por decidir" da T6.1 segue aberto (5 itens).

### O que ficou fora

- **B-1, B-4, B-5** da terceira revisão (texto não guardado) e o **B3** da revisão do painel.
- `trip_stop_occurrences.signature_object_id`: coluna sem uso.
- **"Ao menos N"** produtos não muda o que o app do motorista cobra: o snapshot não traz os itens, e o app só marca "A nota inteira" (o servidor cobra o N).
- **Lacuna do app com produtos item a item**: apontar itens da nota no app exige o snapshot trazer a lista.
- **Fase 3 por nota só no servidor**: o app não manda `contractorId`/`recipientTaxId` (security.md §3); lê o resolvido do snapshot.
- **WhatsApp sem assinatura nem foto**; **fila offline do app antigo** com item gravado sob tipo que depois endurece recebe 422 permanente.
- Exigência no momento de galpão e na parada, fechar o furo `separation + stop`, fundir os dois "Avaria", nome e documento de quem deu a negativa, retroatividade, o comprovante de entrega, a rota do escritório e
  o tipo `flow: stop` recusado na rota de nota (todos em `spec.md` § "Fora do escopo").
- O smoke Playwright da 185 (`spec-185-prints`) segue sem execução; `make migration-test` como alvo não rodou (rodou o `db:test`); `trip-occurrence-upload-confirm` pulou (sem MinIO).
- **T1d.0 e T3.0**: pendentes do usuário.

### Contagens finais (árvore final, seção "T6.3")

Contrato da API 10042 pass / 25 skip / 0 fail (199 arquivos) · integração da API 1073 pass / 8 skip / 0 fail (199 arquivos em 10 blocos; os 8 skips explicados: 7 cobertos pelo re-run com `DRIZZLE_TEST_DATABASE_URL` e pelo `db:test`, 1 não exercitado por falta de MinIO) · `db:test` 138 pass ·
`db:generate` `no_changes` · `db:check` limpo · painel 7064 + 727 pass · app do motorista 1242 pass · worker 1640 pass · cron 101 pass · `make check` pass · lint 0 erros nas sete apps · build ok.

### Prompt de execução restante

**Nenhuma task de código sobra.** `[ ]` ficam só **T1d.0** e **T3.0** (medições em produção e staging, do usuário). O que resta não é execução da spec: é a **publicação em etapas**
(seção "Ordem de publicação em etapas", a cargo do orquestrador, com gates por etapa) e, antes do PR `staging` → `main`, as duas medições registradas aqui. Não há prompt de autopilot a rodar; pare e pergunte
antes de: deploy, migration em produção, a etapa 3 (T1d.0), e qualquer ativação da etapa 2 em produção (T3.0).

## Etapa 1 — publicada em staging

Branch `publish/246-etapa1`, a partir de `origin/staging`, sem migration e sem nenhum arquivo de `apps/api-transportada`, `apps/worker-transportada` ou `apps/cron-transportada` (`git diff --stat origin/staging..HEAD` nessas pastas é vazio). SHA do push: registrado depois, pelo orquestrador.

Montagem: um commit por caminho com `specs/246` inteira e `specs/241` (renumeração), 48 cherry-picks `-x` só de painel e app do motorista (o trailer `cherry picked from` traz o SHA de origem), e um commit de prettier em dois arquivos de tipos. Ficam para a etapa 2: `CLAUDE.md` da raiz e das apps e `docs/ai-context/api-transportada.md`/`frontend-*.md` do commit `2b943d116`. Commits da etapa (em ordem):

- `f6b9dc1b7` docs(246): a spec 246 inteira na versão final e a renumeração d...
- `b1b6ba7b3` fix(trip): o catálogo de tipos do painel tolera os momentos ant...
- `d78da0915` fix(trip): o catálogo de tipos do painel tolera os mínimos ante...
- `351634522` fix(trip): o painel tolera os modos resolvidos do tipo antes de...
- `577e11227` test(driver-trip): o app tolera os modos resolvidos do tipo ant...
- `c73bf4d49` feat(driver-trip): o formulário da ocorrência cobra os quatro m...
- `2452b9e83` feat(driver-trip): a assinatura da ocorrência entra no item de ...
- `1e769bccc` test(driver-trip): o botão da ocorrência habilita sem rede e o ...
- `27ec46a70` feat(occurrence): adicionar aba Tipos em TripOccurrencesWorkspa...
- `9b96319f5` refactor(occurrence): mover painel de tipos de configurações pa...
- `5eb8b75a9` fix: atualizar helper de leitura de source após mover painel de...
- `e55e46640` test(occurrence): adicionar contrato para abas de TripOccurrenc...
- `8d1861e81` fix(test): contratos do painel de tipos passam a importar do mó...
- `383c1ead3` style(frontend-transportada): prettier nos dois arquivos que de...
- `39858ab79` feat(occurrence): o painel lê os campos de exigência do tipo e ...
- `b6dc48856` feat(occurrence): a linha do tipo ganha Foto, Observação, Assin...
- `b251d0d63` feat(occurrence): tipos recolhidos com linha-resumo, exceções à...
- `fcacc08d1` feat(occurrence): seletor múltiplo de momentos do tipo, que rec...
- `5d9016540` feat(occurrence): o aviso ao contratante entra no tipo aberto, ...
- `9f7c073b5` feat(occurrence): busca e filtros-pílula combináveis na aba Tip...
- `c79b1ee13` test(occurrence): o endereço antigo do catálogo sai dos contrat...
- `acae12929` fix(occurrence): a aba Tipos deixa de passar da largura da tela...
- `43f33980c` fix(design-system): painéis de seleção cabem na tela, alvos de ...
- `25b8ecf2f` fix(occurrence): o tipo aberto segue a ordem do preview, ganha ...
- `5eca49db4` fix(occurrence): o bloco O que exige cabe em 320px (T6.1)
- `ed60ede44` fix(design-system): a dica do seletor não reabre por cima das o...
- `7be80bd07` test(occurrence): o contrato da identificação passa no lint (T6.1)
- `0fd890352` fix(design-system): o Tooltip só estica o filho com o modificad...
- `8ba764e1f` fix(occurrence): a exceção nova herda a observação, a assinatur...
- `b2a01c528` fix(occurrence): as exigências e as exceções do tipo seguem o c...
- `b62ee49ef` fix(occurrence): os momentos do tipo viram rascunho com Aplicar...
- `c08442994` fix(occurrence): o cadastro do tipo novo fala o vocabulário da ...
- `68813db27` fix(frota): a placa e o texto oculto de cabeçalho não alargam m...
- `ccd77ddb6` fix(design-system): o valor escolhido e o placeholder do Select...
- `b65dd7511` fix(occurrence): clientes e contratantes só carregam quando um ...
- `08c46dc13` fix(occurrence): a aba Tipos só existe para quem gere as config...
- `321b8294f` feat(verificação): a tela mostra, por tipo, os seis campos efet...
- `2853c0d16` refactor(occurrence): o rótulo de Ao menos diz N itens, os come...
- `ef8ae3d8c` refactor(motorista): o hook do formulário de ocorrência cai par...
- `ccc851f37` fix(painel): Recebimento e Ressarcimentos não passam da largura...
- `a5f59457d` fix(viagem): os motoristas da viagem encolhem e o contato longo...
- `cdb63a50d` style(occurrence): prettier nos dois seletores com fill (spec 246)
- `1e00acf30` refactor(motorista): imports órfãos do hook e contratos que lia...
- `6782dddf7` test(design-system): o className do invólucro do Tooltip segue ...
- `fc68545e5` fix(painel): o nome da tela volta a 2rem e o título de /ressarc...
- `f088f3389` fix(painel): o título que quebra no celular é só o de ressarcim...
- `f1f3f12da` fix(verificação): o texto de apoio diz os seis campos que a tel...
- `fb7e89183` docs(246): evidência da terceira revisão, contexto da API e lin...
- `c433c2c5a` fix(painel): Repasses, Ressarcimentos e o financeiro da viagem ...
- `417bf5281` style(246): prettier nos dois arquivos de tipos que a staging d...

Gates: `bun install --frozen-lockfile` ok; `bun run typecheck` 0 erros nas sete apps; `prettier --check .` e `bun run format:check` limpos; `bun run lint` 0 erros (16 avisos de exhaustive-deps já existentes); painel `test` 7065 + 727 (0 falhas); app do motorista `test` 1242 (0 falhas); build das duas apps ok. Tolerância à API anterior provada pelos contratos `occurrence-type-tolerance`, `occurrence-requirement-modes-tolerance`, `occurrence-items-mode-tolerance`, `occurrence-requirement-catalog-client` e os da Fase 2 do app (`occurrence-requirements`, `occurrence-requirement-fields`, `occurrence-signature-queue`).
