# Tasks

> Pré-condição: a spec 241 publicada e aplicada (painel e API). A coluna `items_mode` é dela; nenhuma
> task desta spec a cria.

Uma task por vez, na ordem. Cada uma fecha com typecheck, teste e commit isolado, e registra a
evidência em `evidence.md`.

## Fase 1 — O dado passa a carregar a exigência

> 🤖 Modelo: `sonnet` (T1.2 é 🧠 — o backfill é o ponto onde se perde comportamento calado)

- [ ] **T1.1** Três modos no schema: `note_mode` e `signature_mode` em `companyOccurrenceTypes` e
      nas duas tabelas de exceção; `signature_object_id` nas duas tabelas de ocorrência —
      `apps/api-transportada/src/database/trip.schema.ts` — `db:generate` gera a migration.
- [ ] **T1.2** 🧠 Migration com o `UPDATE` que copia `attachment_mode = 'required'` para
      `note_mode`, nas três tabelas, mais `rollback.sql` — `make migration-test` verde.
- [ ] **T1.3** Teste de integração que semeia um tipo com foto `required` **antes** das colunas
      novas, roda a migration e prova que a observação continua exigida (CA04) —
      `test/integration/*.integration.ts`, rodado com `--env-file=../../.env.test`.
- [ ] **T1.4** Mutação: arrancar o `UPDATE` da T1.2 deixa a T1.3 vermelha. Evidência da execução
      vermelha em `evidence.md`, não só a afirmação.

## Fase 1b — O momento vira conjunto

> 🤖 Modelo: `sonnet` (T1b.2 é 🧠 — é onde um papel pode ganhar momento que não é dele)

- [ ] **T1b.1** Tabela `company_occurrence_type_moments` com `UNIQUE (occurrence_type_id, moment)` e
      CHECK do vocabulário fechado; backfill de um momento por tipo a partir de `stage`/`flow`;
      `rollback.sql`. `stage` e `flow` permanecem gravadas.
- [ ] **T1b.2** 🧠 A permissão passa a ser do **momento do registro**, nunca "o tipo tem algum
      momento que o papel cobre". Validar o desenho com `architect` antes de implementar.
- [ ] **T1b.3** Integração da CA00: tipo com `separation` + `document` aparece nas duas listas com
      o mesmo id, e registrar no momento que o papel não cobre volta 403.
- [ ] **T1b.4** Integração da CA00b sobre dado semeado antes da tabela nova: nenhuma lista muda de
      conteúdo depois da migration.
- [ ] **T1b.5** Mutação: trocar a checagem da T1b.2 pela versão "algum momento" deixa a T1b.3
      vermelha. Execução vermelha registrada em `evidence.md`.
- [ ] **T1b.6** Rejeitar tipo sem nenhum momento, na API e na tela.

## Fase 1c — Produtos e quantidade mínima viram dado (RF1, RF1b, RF1c, RF1c2)

> 🤖 Modelo: `sonnet` (T1c.1 é mecânica sobre o molde da Fase 1; aceite por `make migration-test`)

- [ ] **T1c.0** Confirmar a pré-condição: a 241 está em `origin/staging` (código, não só a spec) e
      `items_mode` (`DEFAULT 'optional'`, CHECK de vocabulário, `company_occurrence_types_items_off_shape_check`)
      existe no schema e na migration publicada. Ausente: parar e avisar — a ordem foi invertida.
      Registrar em `evidence.md`.
- [ ] **T1c.1** Colunas aditivas: `photo_minimum_count` (1–5, CHECK) e `items_minimum_count` (nulo =
      todos os itens da nota; CHECK ≥ 1 **e** CHECK `items_minimum_count IS NULL OR items_mode =
'required'`) em `companyOccurrenceTypes`; as mesmas duas mais `items_mode` (`DEFAULT 'optional'`)
      nas duas tabelas de exceção — `trip.schema.ts`, `db:generate`, `rollback.sql` que **não** derruba
      `items_mode` do tipo. Foto/produtos só leem a quantidade quando o modo é `required`.
- [ ] **T1c.2** Backfill sem mudar comportamento: `photo_minimum_count = 1` onde a foto é `required`.
      `items_mode` do tipo **não é tocado** (a 241 já o deixou `optional`, e `off` só na segunda via);
      as linhas de exceção existentes entram `optional`. `make migration-test` roda com a 241 no
      histórico.
- [ ] **T1c.3** `allows_multiple_items` entra no `PUT`/`GET` do catálogo (RF1b) — a coluna já existe.
- [ ] **T1c.4** A escrita do catálogo (`save-occurrence-type.use-case.ts`, `occurrence.schema.ts`)
      passa a aceitar `itemsMode = 'required'` (a 241 devolve `400`), recusa `items_minimum_count`
      sem `required`, e mantém a recusa `off` + política ≠ `unset` da 241 — contrato primeiro.

## Fase 1d — A foto da rua guarda N anexos (RF1d)

> 🤖 Modelo: `sonnet` (T1d.2 é 🧠 — backfill que copia dado de produção e leitura unificada)

- [ ] **T1d.1** Contrato primeiro: a leitura da ocorrência de rua devolve as fotos de
      `trip_document_occurrence_attachments` e, na ausência, a `attachment_object_id` antiga.
- [ ] **T1d.2** 🧠 Migration de backfill: cada `attachment_object_id` de ocorrência de rua vira uma
      linha na tabela de anexos (posição 1, mesmo `retention_until`), idempotente, mais
      `rollback.sql`. Validar com `architect` antes de implementar. `attachment_object_id`
      **permanece** gravada (rede do rollback).
- [ ] **T1d.3** Integração sobre dado semeado **antes** do backfill: nenhuma ocorrência perde foto.
- [ ] **T1d.4** Mutação: arrancar o backfill da T1d.2 deixa a T1d.3 vermelha. Execução vermelha
      registrada em `evidence.md`.
- [ ] **T1d.5** A escrita da ocorrência de rua grava nas duas tabelas até a leitura nova estar em
      produção; `photo_minimum_count` é conferido contra a quantidade de anexos (RF8).

## Fase 2 — A API resolve e cobra os três campos

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato primeiro: `listFieldOccurrenceTypes` devolve os três modos resolvidos em
      três camadas, campo a campo, por `resolveWithOverrides` — teste antes da implementação.
- [ ] **T2.2** Implementar a projeção e a leitura de `read-settings-resolution.use-case.ts` (RF12).
- [ ] **T2.3** `register-driver-occurrence.use-case.ts`: a exigência vira leitura dos três modos
      efetivos; sai o `if (attachmentMode === 'required')` com a nota embutida. Erro estável da
      assinatura em `trip.error.ts`.
- [ ] **T2.4** `PUT` do catálogo e das exceções aceita os três modos; `signatureObjectId` aceito e
      conferido contra empresa/viagem/motorista (RF2b da 179).
- [ ] **T2.4b** A projeção, a cobrança (RF8) e a verificação (RF12) incluem `itemsMode`,
      `photoMinimumCount` e `itemsMinimumCount`; erro estável por campo em `trip.error.ts`.
      `itemsMode = required` recusa registro sem produto, e "todos os itens" recusa seleção parcial.
- [ ] **T2.5** Prova de que a assinatura da ocorrência não aparece em `trip_delivery_proofs`, na
      pontualidade nem na nota do motorista (CA06, regra da 209).

## Fase 3 — A exceção chega na rua

> 🤖 Modelo: `sonnet` (T3.1 é 🧠 — a chave do cache errada serve exigência de outra nota)

- [ ] **T3.1** 🧠 `contractorId` e `recipientTaxId` por nota no snapshot
      (`find-current-driver-trip.use-case.ts`), e o cache de tipos do app chaveado por nota —
      `occurrenceTypesCache.service.ts`. Validar o desenho da chave com `architect` antes.
- [ ] **T3.2** `driverTripClient.service.ts` envia os dois parâmetros na consulta de tipos (RF6).
- [ ] **T3.3** Integração provando CA02: mesmo tipo, `required` numa nota e `optional` noutra.

## Fase 4 — O motorista captura o que foi pedido

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** `DriverOccurrenceRegistrationForm`: botão desabilitado enquanto faltar campo
      `required`; `SignaturePad` montado só quando a assinatura é pedida. Sem rede no caminho.
- [ ] **T4.1b** O formulário também bloqueia por `itemsMode` (produtos marcados, ou todos os itens
      da nota) e por `photoMinimumCount` (fotos capturadas ≥ mínimo) — RF7, RF1c, RF1c2.
- [ ] **T4.2** A assinatura entra no item de fila que já existe, nunca num item novo (209 D1).
- [ ] **T4.3** Contrato do app cobrindo CA05, e o caminho offline.

## Fase 5 — O cadastro muda de endereço

> 🤖 Modelo: `haiku` para a mudança mecânica, `sonnet` para T5.3

- [ ] **T5.1** `<Tabs>` em `TripOccurrencesWorkspace.page.tsx`, no molde de `TripWorkspace`.
- [ ] **T5.2** Reler a árvore (a 241 pode ter renomeado ou quebrado o painel em subcomponentes) e mover,
      sem reescrever, o painel que a 241 já alterou, a seção de exceções, o hook, as consultas e as traduções de
      `modules/company-settings` para `modules/trip`; atualizar `SETTINGS_PANEL_PLACEMENT`,
      `SETTINGS_PANEL_MODULES` e `COMPANY_SETTINGS_TAB_IDS`.
- [ ] **T5.3** Exceções à vista (RF11, RF11c): contagem e lista sem acordeão, **uma consulta em
      lote por tela**. Os quatro modos e as quantidades mínimas editáveis por exceção.
- [ ] **T5.3b** Seletor múltiplo de momentos por tipo (`MultiSelect`), recusando o conjunto vazio
      (T1b.6), com a nota de que os campos valem só nos momentos de rua (RF1h).
- [ ] **T5.3c** Destinatário da exceção escolhido em `SearchableSelect` por nome ou CNPJ entre os
      clientes cadastrados, nunca digitado (RF1f).
- [ ] **T5.3d** Aviso ao contratante na aba: `notifies`, seleção do modelo de e-mail com o conteúdo
      visível, `redeliveryPolicy` (RF1e).
- [ ] **T5.3e** Busca (tipo, nome ou CNPJ de exceção) e filtros-pílula combináveis: momento,
      ativo/inativo, exigência, avisa/não avisa, tem exceção — no molde de
      `TripOccurrenceFilters` (RF11b). Desenho em `preview.html`.
- [ ] **T5.4** Atualizar os quatro contratos que afirmam o endereço antigo:
      `test/company-settings/tabs.contract.ts`, `occurrence-type-catalog-panel.contract.ts`,
      `occurrence-type-attachment-mode.contract.ts`,
      `occurrence-type-catalog-template-select.contract.ts`.
      ⚠️ Arquivo de teste novo não roda se não entrar na lista do `package.json` da app.

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet`; revisão final com `code-reviewer` em `opus`

- [ ] **T6.1** Revisão de design e usabilidade da aba nova, com print nas três larguras (CA08).
      **Comparar o `preview.html` com a tela real, lado a lado**, em 375, 768 e 1280: abrir o
      protótipo e a tela implementada com os mesmos dados, e registrar em `evidence.md` uma tabela
      "elemento → preview → tela real → veredito" (rótulos, ordem dos campos, estados vazio, erro e
      desabilitado, espaçamento, contraste, foco). Toda diferença é defeito da implementação, a
      menos que o `evidence.md` registre por que o protótipo estava errado; corrigir e refazer o
      print. Verificação por texto primeiro (`read_page`, geometria, contraste); print só como prova.
- [ ] **T6.1b** Revisão independente de funcionalidade, usabilidade e design por `code-reviewer`
      (`opus`), numa passada separada da autoria: fluxo ponta a ponta no navegador (criar tipo,
      exceção por CNPJ, registrar na rua com a exigência, ver o que a conferência mostra), mais a
      leitura do código. Achados por severidade; reprovado se houver bloqueante ou alto, e então
      corrige e repete a passada. O veredito entra em `evidence.md`.
- [ ] **T6.2** Atualizar `CLAUDE.md` da raiz e `apps/*/CLAUDE.md` tocados, e
      `docs/ai-context/` das apps afetadas.
- [ ] **T6.3** Gates completos: `bun run typecheck`, `make check`, `make migration-test`, e a
      integração da API em primeiro plano com `--env-file=../../.env.test` (contrato e integração
      são dois comandos; nenhum cobre o outro).
- [ ] **T6.4** `evidence.md` consolidado.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/246-a-exigencia-da-ocorrencia-chega-na-rua/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Pré-condição: a spec 241 publicada e aplicada (painel e API, código em origin/staging, coluna
items_mode existente). A T1c.0 confere isso; se faltar, pare e avise — nenhuma task cria items_mode.
Modelos: Fases 1, 1b, 1c, 1d, 2, 3, 4 e 6 → executor model=sonnet · Fase 5 → executor model=haiku,
exceto T5.3* → sonnet · T1.2, T1b.2, T1d.2 e T3.1 🧠 → opus, validadas com architect antes de
implementar · revisão final → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Ordem de publicação (ADR-0081 §9): painel tolerante antes de API/banco; a migration só depois do
painel que lê os campos novos como opcionais.
Gates de cada task: typecheck + teste + commit isolado, evidência em evidence.md. Na API, contrato
e integração são dois comandos e nenhum cobre o outro; a integração exige --env-file=../../.env.test.
Ao fechar a spec: make check, make migration-test (há migration com rollback.sql) e, depois de
git fetch + rebase + bun install --frozen-lockfile, db:generate = no_changes.
T1.4, T1b.5, T1d.4 e as demais tasks de mutação só fecham com a execução vermelha registrada.
Antes de fechar (T6.1): compare o preview.html com a tela real, lado a lado, em 375, 768 e 1280, e
registre a tabela de diferenças em evidence.md; corrija o que divergir. Depois (T6.1b): passada
independente de funcionalidade, usabilidade e design com code-reviewer model=opus, fluxo ponta a
ponta no navegador; reprovou, corrige e repete. Só então T6.2–T6.4.
Rode TODAS as tasks, das Fases 1 a 6, sem parar entre fases; só interrompa nas condições abaixo.
Pare e pergunte antes de: deploy, migration destrutiva, produção, qualquer [NEEDS CLARIFICATION].
```
