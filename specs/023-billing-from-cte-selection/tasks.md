# Tasks

Feature 023 — Faturar a partir da seleção de CT-es e refazer a tela de faturamento.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato/aceite **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); **teste de isolamento de tenant obrigatório
sempre que a task mexer em query**; task só fecha com evidência em `evidence.md` (comando, saída, o que
prova). Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal em teste,
fixture, log ou evidência — fixture nova é derivação anonimizada.

Verificação padrão de toda task de API: `bun run --cwd apps/api-transportada test` + `bun run lint` +
`bun run typecheck` na raiz. De toda task de frontend: `bun run --cwd apps/frontend-transportada test` +
`lint` + `typecheck` + `build`.

Modelo: as fases recomendam `sonnet`. O usuário autorizou expressamente seguir com o modelo da sessão
("depois eu verifico manualmente as implementações totais pode seguir") — registrado aqui para não
repetir a pergunta a cada fase.

## Fase A — Preview de faturamento na API

> 🤖 Modelo: `sonnet` (T002 é 🧠 — query nova com isolamento de tenant)

- [x] T001 Contrato **falhando** de `POST /billing/invoices/preview`:
      `parseBillingInvoicePreviewRequest` aceita de 1 a 100 uuids e rejeita lista vazia, id repetido, id
      fora do formato e chave extra no corpo; a aplicação devolve grupos por `customerDocument` com
      contagem e soma decimal em string, ordem estável, e bloqueados com motivo em
      `not_found` · `not_authorized` · `already_invoiced` · `missing_customer`; id de outra empresa cai
      em `not_found`. Dependências: nenhuma. Sucesso: teste vermelho por função inexistente.

- [x] T002 🧠 Implementar a rota (policy `billing.create`), `previewInvoice` no use-case e
      `findBillingPreviewByIds` no `drizzle-billing.repository.ts`. **Mexe em query → estender
      `test/billing-schema/tenant-safety.contract.ts` provando que o preview não enxerga CT-e de outra
      empresa.** Dependências: T001. Sucesso: T001 verde + tenant safety verde + gates de API.

## Fase B — Gerar fatura a partir da seleção de CT-es

> 🤖 Modelo: `sonnet`

- [x] T003 Contrato **falhando** do preparo da seleção: o mapa acumulado por item passa a guardar
      `fiscalDocumentId` e `status`; `collectBillableCtes` separa ids faturáveis de bloqueados locais
      (sem documento fiscal ou status ≠ `authorized`) usando o mapa, inclusive para item de página já
      descartada; `canBillSelection` exige `billing.create` e ao menos um faturável. Dependências: T002.

- [x] T004 Implementar `cteBatchBilling.service.ts`, o snapshot estendido em
      `cteBatchItemSelection.service.ts` e a ação **Gerar fatura** na `CteItemSelectionBar`, com rótulo
      contando os faturáveis e locales pt/en. Dependências: T003. Sucesso: T003 verde + gates de
      frontend.

- [x] T005 Contrato **falhando** do modal: `useCteBillingDialog` abre com a seleção, consulta o preview,
      exige vencimento, confirma criando **uma requisição por grupo** com `Idempotency-Key` distinta,
      preserva os grupos que deram certo quando um falha, expõe erro por código e invalida a listagem de
      CT-es e a de faturas ao fim. Dependências: T004.

- [x] T006 Implementar `CteBillingDialog.component.tsx`, o hook e o `previewInvoice` no
      `billingClient.service.ts`, com bloqueados agrupados por motivo e resultado por grupo.
      Dependências: T005. Sucesso: T005 verde + gates + verificação no navegador real.

## Fase C — Tela de faturamento no padrão da tela de Notas

> 🤖 Modelo: `sonnet` (T010 é 🧠 — máquina de estado da tabela)

- [x] T007 Contrato **falhando** dos filtros novos de `GET /billing/eligible-ctes`: `cteNumberIn`,
      `batchIdIn` e `customerName` (contém, mínimo 2 caracteres); rejeita chave fora da allowlist, chave
      repetida, lista vazia, lista acima do teto e `In` combinado com o campo exato do mesmo domínio.
      Dependências: nenhuma.

- [x] T008 Implementar os filtros no schema e no `drizzle-billing.repository.ts` (`inArray`, `ilike`),
      preservando os filtros atuais. **Mexe em query → teste de isolamento de tenant obrigatório.**
      Dependências: T007.

- [x] T008A A coluna "lote" precisa de nome, não de UUID: `GET /billing/eligible-ctes` passa a devolver
      `batchName` junto de `batchId`, com o join do lote preso ao mesmo `companyId`. Contrato **falhando**
      antes da implementação. **Mexe em query → teste de isolamento de tenant obrigatório.**
      Dependências: T008. Sucesso: contrato verde + integração verde + gates de API.

- [x] T008B O fim do período precisa incluir o dia inteiro: `issuedTo` de `GET /billing/eligible-ctes`
      hoje vira meia-noite e descarta todo CT-e autorizado no último dia escolhido. Contrato **falhando**
      antes da implementação. **Mexe em query → teste de isolamento de tenant obrigatório.**
      Dependências: T008A. Sucesso: integração verde + gates de API.

- [x] T009 Contrato **falhando** do serviço puro da tabela de elegíveis: colunas e ordem default,
      sanitização e persistência sob `billing.eligible.columns.v1` (SSR-safe, tolerante a valor
      corrompido), reordenação pura e no-op nas bordas, estado de ordenação `asc → desc → neutro`,
      serialização de filtros sem chave vazia, contagem de filtros ativos, avaliação do filtro avançado
      com grupos E/OU aninhados e neutralidade. Dependências: T008.

- [x] T010 🧠 Implementar `billingEligibleTable.service.ts` e `useBillingEligibleTable.hook.ts` —
      paginação por cursor com pilha de volta, reset em toda troca de filtro/ordenação, mapa acumulado
      da seleção com `sumScaledAmounts`. Dependências: T009.

- [x] T011 Contrato **falhando** da tela: a aba "Gerar fatura" renderiza as seis colunas (CT-e, tomador,
      documento do tomador, lote, autorização, valor) com zebra, seleção em massa, contador de
      resultados e paginação; filtros e colunas ficam em controles recolhidos com `aria-expanded` e
      pastilha de contagem; período usa `DateRangePicker`; nenhum `<select>` nativo; container em
      `--layout-width` e campos nos tokens de altura. Dependências: T010.

- [x] T012 Implementar `BillingEligibleTable.component.tsx`, `BillingEligibleFilters.component.tsx`, o
      `styles/billingEligibleTable.module.css` e a nova aba "Gerar fatura" (tabela + rodapé de criação
      com vencimento), removendo o grid de `input type=text` e os campos de data soltos. Locales pt/en.
      Dependências: T011. Sucesso: T011 verde + gates + navegador real.

## Fase D — Detalhe da fatura no lugar da caixa de UUID

> 🤖 Modelo: `sonnet`

- [x] T013 Contrato **falhando** do detalhe: selecionar uma linha na aba "Faturas geradas" expõe a
      fatura, seus documentos e o cancelamento; cancelar exige `billing.cancel` e motivo com ao menos 3
      caracteres; limpar a seleção fecha o painel; nenhuma tela lê id de fatura de campo digitado.
      Dependências: T012.

- [x] T014 Implementar `BillingInvoiceDetail.component.tsx`, ligar o hook da tabela de faturas ao painel
      e remover da `BillingWorkspace.page.tsx` a caixa de UUID, o painel solto de cancelamento e o painel
      solto de documentos. Dependências: T013. Sucesso: T013 verde + gates + navegador real.

## Fase E — Defeito: preview e criação de fatura quebram com valor de frete de 4 casas

> 🤖 Modelo: `sonnet`

Sintoma reportado no navegador: `POST /billing/invoices/preview` responde 409
`BILLING_INVOICE_INVALID_STATE` e o modal mostra "Nao foi possivel conferir a selecao". Causa
confirmada no banco local: `freight_calculations.total_amount` é `numeric(19,4)` e todos os CT-e reais
têm 3ª/4ª casas diferentes de zero (`43.1316`, `67.3506`, `32.3708`, `49.0928`, `36.0486`), enquanto
`parseMoney` em `billing.use-case.ts` só aceita valor cujas 3ª/4ª casas sejam `00` — as tabelas de
faturamento são `numeric(14,2)`. A mesma função é usada em `create`, então emitir fatura também falha.

- [x] T015 Contrato **falhando** de aplicação: `preview` agrupa e soma CT-e com valor de 4 casas
      arredondando cada item para centavos (meio para cima) e `create` grava item e total da fatura já
      arredondados, com o total igual à soma dos itens arredondados. Dependências: T014.

- [x] T016 Implementar o arredondamento comercial em `parseMoney` (`billing.use-case.ts`), preservando a
      rejeição de valor fora do formato `numeric`. Dependências: T015. Sucesso: T015 verde + gates.

## Fase F — Feriados nacionais marcados em todos os calendários

> 🤖 Modelo: `sonnet`

- [x] T017 Contrato **falhando** do serviço puro `src/components/ui/brazilianHoliday.service.ts`:
      `listBrazilianHolidays(year)` devolve os feriados nacionais fixos e os móveis derivados da Páscoa
      (Carnaval, Sexta-feira Santa, Corpus Christi) ordenados por data, e `findBrazilianHoliday(iso)`
      devolve o nome do feriado ou `undefined`. Dependências: T016.

- [x] T018 Implementar o serviço e marcar o dia feriado no `DateRangePicker` (classe própria, `title`
      com o nome e nome visível no rodapé do calendário). Dependências: T017. Sucesso: T017 verde + gates.

## Fase G — Campo de vencimento: data única + prazo em dias

> 🤖 Modelo: `sonnet`

- [x] T019 Contrato **falhando** do `DueDateField`: o vencimento deixa de usar o seletor de período e
      passa a ter (a) um seletor de **uma** data e (b) um select de prazo com 5, 10, 15, 20 e 30 dias que
      calcula a data a partir de hoje; nenhum `<select>` nativo; campos nos tokens de altura.
      Dependências: T018.

- [x] T020 Implementar `DatePicker` (data única, reaproveitando o calendário com feriados) e o
      `DueDateField` na aba "Gerar fatura", removendo o `DateRangePicker` com `to=""`. Locales pt/en.
      Dependências: T019. Sucesso: T019 verde + gates + navegador real.

## Fase H — A fatura precisa parecer uma fatura

> 🤖 Modelo: `sonnet`

Diagnóstico verificado no banco: as 5 faturas geradas têm **1 item cada** porque os 5 CT-es
selecionados eram de 5 tomadores diferentes — a regra "uma fatura por tomador" está correta, mas a
tabela não mostra nenhum vínculo, então ela é indistinguível de uma listagem de CT-e. Além disso
`due_date` é gravado como `2026-08-20 00:00:00+00` e a tela renderiza `19/08/2026, 21:00:00`
(um dia a menos por fuso, com hora que não existe no domínio).

- [x] T021 Contrato **falhando** do vencimento como data pura: `formatDueDate` devolve `20/08/2026`
      para `2026-08-20T00:00:00.000Z` em qualquer fuso, sem hora; tabela de faturas e detalhe usam essa
      função no vencimento e continuam usando data+hora em emissão/criação. Dependências: nenhuma.

- [x] T022 Implementar o formatador e aplicá-lo. Dependências: T021. Sucesso: T021 verde + gates.

- [x] T023 Contrato **falhando** do vínculo visível: a API devolve os itens da fatura (número do CT-e,
      chave, descrição e valor) no `GET /v1/billing/invoices/:id`; teste de isolamento de tenant para a
      query nova. Dependências: nenhuma.

- [x] T024 Implementar os itens no repositório, no use-case e no serializer. Dependências: T023.
      Sucesso: T023 verde + gates.

- [x] T025 Contrato **falhando** do frontend: a tabela ganha coluna com a quantidade de CT-es e o
      detalhe lista os CT-es vinculados; clicar no número abre o detalhe. Dependências: T024.

- [x] T026 Implementar a coluna e a lista de CT-es no detalhe. Locales pt/en. Dependências: T025.
      Sucesso: T025 verde + gates.

- [x] T027 Contrato **falhando** da edição da fatura: `PATCH /v1/billing/invoices/:id` aceita
      `observations`, `discountAmount` e `surchargeAmount`, recalcula
      `total = subtotal - desconto + acréscimo`, recusa desconto maior que o subtotal (422) e recusa
      fatura cancelada (409); migration aditiva de `billing_invoices.observations` com rollback ao lado;
      teste de isolamento de tenant. Dependências: T024.

- [x] T028 Implementar a migration, o use-case e a rota. Dependências: T027. Sucesso: T027 verde +
      gates + `make migration-test`.

- [x] T029 Contrato **falhando** do painel de edição no detalhe da fatura (observações, desconto,
      acréscimo, total recalculado na tela). Dependências: T028.

- [x] T030 Implementar o painel editável. Locales pt/en. Dependências: T029. Sucesso: T029 verde +
      gates + navegador real.

## Fase I — Faturar o lote inteiro, com progresso visível

> 🤖 Modelo: `sonnet` (T031 é 🧠 — fatiamento por tomador contra o teto da API)

Decisão registrada com o usuário: a criação da fatura **continua na API**. O que muda é a tela — o
modal passa a executar grupo a grupo com barra de progresso animada e porcentagem, e o resultado de
cada tomador aparece conforme chega. Execução durável no worker (`billing_runs` + trilha
`billing-run.v1`) fica para uma feature própria, com ADR, porque exige decidir onde passa a morar a
numeração da fatura — hoje ela vive em `drizzle-billing.repository.ts`
(`coalesce(max(invoice_number), 0) + 1` dentro da transação) e o worker não pode importar código da
API.

Limites reais da API que a fase precisa respeitar: `POST /billing/invoices/preview` e
`POST /billing/invoices` aceitam no máximo **100 `cteIds`** por requisição, e `GET /billing/eligible-ctes`
devolve no máximo **100 itens por página** (cursor).

- [x] T031 🧠 Contrato **falhando** de `billingBatchSelection.service.ts`: `serializeBillingBatchCteQuery`
      monta `batchIdIn` + `limit` + `cursor`; `groupEligibleCtesByCustomer` agrupa por
      `customerDocument` em ordem estável, soma o valor com `sumScaledAmounts` e **fatia todo grupo
      acima de 100 CT-es em partes numeradas** (`part` de `partCount`), porque uma fatura não aceita
      mais que isso; `BILLING_BATCH_CTE_CEILING` limita a varredura e devolve `truncated` quando o lote
      passa do teto — nada de corte silencioso. Dependências: nenhuma.

- [x] T032 Implementar o serviço e `listBillableCtesForBatches` no `billingClient.service.ts`, seguindo
      o cursor até o fim ou o teto. Dependências: T031. Sucesso: T031 verde + gates de frontend.

- [x] T033 Contrato **falhando** do progresso: `submitBillingGroups` ganha `onProgress` e concorrência
      limitada (nada de 40 requisições simultâneas), reportando `{completed, total}` a cada grupo
      concluído sem perder o resultado dos demais quando um falha; `resolveBillingProgress` devolve
      `percent` inteiro de 0 a 100, `isComplete` e a contagem de sucesso/erro. Dependências: T032.

- [x] T034 Implementar o progresso no serviço. Dependências: T033. Sucesso: T033 verde + gates.

- [x] T035 Contrato **falhando** da tela: `canBillBatch` libera a ação só com `billing.create` e lote já
      transmitido; a ação existe na linha do lote e na barra de seleção de lotes; o modal em modo lote
      resolve os elegíveis, lista os grupos por tomador e mostra a barra com `role="progressbar"`,
      `aria-valuenow/min/max`, porcentagem em texto e resultado por tomador aparecendo conforme chega;
      a animação respeita `prefers-reduced-motion`; nenhum `<select>` nativo e nenhum hexadecimal novo.
      Dependências: T034.

- [x] T036 Implementar a ação no lote, o modo lote do modal e a barra de progresso. Locales pt/en.
      Dependências: T035. Sucesso: T035 verde + gates + navegador real.

- [x] T037 Contrato **falhando** do progresso da transmissão: a barra de seleção de lotes reporta
      `X de Y lotes enfileirados` com a mesma barra, mantém o erro por lote e não dispara as
      requisições todas de uma vez. Dependências: T034.

- [x] T038 Implementar o progresso na transmissão de lotes selecionados. Locales pt/en.
      Dependências: T037. Sucesso: T037 verde + gates + navegador real.

## Fase J — Defeito: a lista de faturas não carrega e não há como filtrar CT-e já faturado

- [x] T039 Contrato **falhando** da listagem de faturas: a linha de lista que a API produz
      (`mapInvoiceListRecord`) carrega `itemCount` e `observations`, a contagem de itens é buscada em
      uma única query escopada por empresa e pelos ids da página, e o adaptador do frontend aceita uma
      linha de lista **sem** `items` (o detalhamento por CT-e só existe no detalhe), devolvendo
      `items: []` e o `itemCount` que veio da API. Dependências: nenhuma.

- [x] T040 Implementar a contagem de itens e as observações na listagem e afrouxar o guard do
      frontend para a linha de lista. Dependências: T039. Sucesso: T039 verde + gates de API e
      frontend + navegador real.

- [x] T041 Contrato **falhando** do CT-e faturado: a listagem de itens de lote devolve
      `billingStatus` (`invoiced` quando existe item de fatura para o CT-e, `pending` caso contrário)
      escopado por empresa, aceita o filtro `billingStatusIn` e a tabela do frontend expõe a coluna e
      o filtro correspondentes. Dependências: nenhuma.

- [x] T042 Implementar o `billingStatus` na query de itens de lote, o filtro na rota/schema e a coluna + filtro na tabela de CT-es. Locales pt/en. Dependências: T041. Sucesso: T041 verde + gates +
      navegador real.
