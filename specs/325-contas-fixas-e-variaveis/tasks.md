# Tasks — 325 Contas fixas e variáveis

Uma task por vez, PR para staging, merge com CI verde. Contrato: `bun --env-file=../../.env.test test --timeout 120000`;
integração: `bun --env-file=../../.env.test run test:integration` (de dentro de `apps/api-transportada`). Task só fecha com
evidência em `evidence.md`. Telas: componentes padrão do design system, prints claro/escuro e desktop/celular antes do PR.

## Fase 0 — Decisões

- [x] **T0.1** Anderson responde as 4 dúvidas (ou aceita os padrões); spec atualizada.
      Feita em 2026-11-13: padrões aceitos ("certo pode criar"); spec com a seção "Dúvidas" fechada.
  > 🤖 Modelo: `opus`
- [x] **T0.2** ADR curta: despesa da empresa como módulo próprio, separado do lançamento de viagem (061/169). Aceite: ADR aceita.
      Feita: [ADR-0115](../../docs/adr/0115-a-conta-da-empresa-e-modulo-proprio.md), aceita (inclui o pagamento de motorista/agregado lido das viagens, sem somar de novo).
  > 🤖 Modelo: `opus`

## Fase 1 — API

- [x] **T1.1** Contratos vermelhos: motorista obrigatório na categoria de motorista, motorista de outra empresa, isolamento por empresa, baixa idempotente, geração única de ocorrência, dia 31, permissões.
      Feita: 22 contratos em `apps/api-transportada/test/expenses/` (entrypoint `test/expenses/red-entrypoint.ts`), todos vermelhos; `tsc` e `eslint` limpos.
      ⚠️ **Fora da lista `test` do `package.json` de propósito**, para o CI de staging não ficar vermelho: **a T1.4 (e a T1.3, para `permissions.contract.ts`) move o entrypoint para `test/expenses.contract.test.ts` e o registra na lista (o guard `test-registry` só vê `test/*.contract.test.ts`, por isso o parking em `test/expenses/`)** quando o contrato ficar verde. Esqueleto em `src/expenses/` (portas, erros, casos de uso que lançam "not implemented").
  > 🤖 Modelo: `sonnet`
- [x] **T1.2** Schema (inclui `payee_driver_id`) + migration aditiva + rollback; categorias semeadas (`make migration-test`).
      Feita: `company_expense_categories`, `company_expenses` (com `payee_driver_id` e `vehicle_id` opcionais, recorrência `fortnightly`) e `company_expense_occurrences`, migration `20261113175316_company_expenses` + rollback (recusa com conta/ocorrência gravada). **Chave da ocorrência: `unique(expense_id, competence, slot)`**, `slot` 1/2 (quinzenal: dia 15 = 1, último dia = 2; as demais usam 1). Semente das 8 categorias para as empresas existentes; **empresa nova precisa da semente na T1.4** (garantir categorias ao primeiro uso). O `insertIfAbsent` da T1.4 passa a receber `slot`.
  > 🤖 Modelo: `sonnet`
- [x] **T1.3** Permissões `expenses.read`/`expenses.manage` em `authorization.policy.ts` + papéis.
      Feita: as duas no catálogo, só no `company-admin`, concedíveis por grupo, sem herança de `trip.financials`/`billing.*`. Painel aceita as duas no `/auth/me` e a matriz de grupos as mostra no grupo "Contas". `permissions.contract.ts` saiu do entrypoint vermelho e roda por **`test/expenses.contract.test.ts`, já registrado no `package.json`**: a T1.4 só acrescenta os imports ali. Notas para a T1.4 em `evidence.md` § T1.3.
  > 🤖 Modelo: `opus` (decide quem acessa)
- [x] **T1.4** Casos de uso e rotas: contas, categorias, ocorrências, baixa, cancelamento, listagem com totais; auditoria.
      Feita: casos de uso em `src/expenses/application/`, rotas em `presentation/expense.routes.ts` (`GET|POST /expenses`, `PATCH /expenses/:id`, `GET /expense-occurrences` com totais, `POST …/:id/settlement` e `…/cancellation`, `GET|POST|PATCH /expense-categories`), portas Drizzle em `infrastructure/`. Leitura `expenses.read`, escrita `expenses.manage`. Categorias semeadas no primeiro uso; `insertIfAbsent` recebe `slot`. Os 4 contratos vermelhos da T1.1 passaram para `test/expenses.contract.test.ts` e `red-entrypoint.ts` foi apagado. Notas e provas em `evidence.md` § T1.4. **Não inclui** a T1.4c (ajudante e chave `unique(trip_id, parcel_kind)`, PR #741): a porta de ocorrência não assume nada da viagem, então ela entra sem mexer aqui.
  > 🤖 Modelo: `sonnet`
- [x] **T1.4b** Viagens do pagamento: tabela `company_expense_occurrence_trips` (migration aditiva), listar viagens disponíveis do motorista no período, incluir/remover, total vira o previsto; contratos do CA05c.
      Feita: migration `20261113201600_company_expense_occurrence_trips` + rollback (recusa com viagem incluída). Rotas `GET|POST /expense-occurrences/:id/trips`, `DELETE …/trips/:tripId` e `GET …/available-trips` (`?from&to` opcional). A linha da pessoa vem da valoração em lote da lista de viagens (`buildValuationFromContext`), copiada e arredondada ao centavo; incluir/remover travam a ocorrência aberta e recalculam o previsto pela soma (sem viagem, volta ao valor da conta). Provas em `evidence.md` § T1.4b. **Chave já pronta para a T1.4c:** `unique(trip_id, parcel_kind, driver_id)` com `parcel_kind in ('driver','helper')`.
  > 🤖 Modelo: `opus` (leitura cruzada com a parcela da viagem, sem somar de novo)
- [x] **T1.4c** Ajudante (RF1e): parcela `helper` para o ajudante e rótulo "Ajudante"; contratos.
      Feita (sem migration): `PAYABLE_TRIP_PARCEL_KINDS = ['driver', 'helper']`; a parcela `helper` da valoração (149 D7) ganhou `basis: { of: 'helper', days, crew[] }`, uma linha por ajudante com diária (`Σ subtotal = amount`, exato), e `trip-person-parcel.gateway.ts` copia a linha da pessoa da parcela do papel que ela teve na viagem. Ajudante sem diária vai para `pending` (`HELPER_DAILY_RATE_MISSING`). A lista de ocorrências leva `payeeProfile` (`driver` | `aggregate` | `helper`, lido de `can_drive`/`payment_model` na hora); o texto "Motorista/Agregado/Ajudante" é da tela (T2.1). Provas em `evidence.md` § T1.4c.
  > 🤖 Modelo: `opus` (leitura cruzada com as parcelas da viagem, sem somar de novo)
- [x] **T1.5** Rotina no `cron-transportada` que gera as ocorrências das fixas (idempotente).
      Feita: o `cron-transportada` só dá a batida (publica `job-run.v1`); a rotina `company-expense.occurrence.generate` é uma entrada do catálogo (nas quatro cópias, 1 dia) executada no **worker** (`src/company-expense-occurrence/`), com a política de calendário e o SQL espelhados da API e contratos de paridade. Migration aditiva `20261113201500_company_expense_occurrence_job` (CHECK de `job` + linha do relógio **pausada**). Detalhe em `evidence.md` § T1.5 e runbook § 5.33.
  > 🤖 Modelo: `sonnet`

## Fase 2 — Painel

- [x] **T2.1** Módulo `expenses` no frontend: cliente, validação de resposta, hooks, locales pt/en.
      Feita: `apps/frontend-transportada/src/modules/expenses/` com tipos (vocabulário copiado da API e conferido por contrato), `expensesClient.service.ts` (as 13 rotas), `expensesResponse.validation.ts` (guard manual, dinheiro sempre texto), hooks TanStack com a chave raiz `expenses` e locales pt/en registrados em `i18n.service.ts`. Contrato `test/expenses.contract.test.ts` na lista do `package.json`. Sem tela: a página é a T2.2. Notas em `evidence.md` § T2.1.
  > 🤖 Modelo: `sonnet`
- [x] **T2.2** Página `/contas` (lista, filtros, totais), formulário nova conta fixa/variável (com seletor de motorista/agregado) e diálogo de baixa; item no menu (`workspaceNavigation.constant.ts`) com guarda de permissão.
      Feita: página `/contas` (grupo Fiscal do menu, `expenses.read`), filtros (mês, tipo, categoria, estado, pessoa), totais (previsto, pago, em aberto, vencidas), diálogos "Nova conta" e "Dar baixa", tabela que vira cartão no celular. Prints em `prints/contas-*`. Notas em `evidence.md` § T2.2.
      Da T1.4c (depois da T2.1): a ocorrência passou a trazer `payeeProfile` (`driver` → "Motorista", `aggregate` → "Agregado", `helper` → "Ajudante", `null` sem favorecido); o leitor da T2.1 ignora a chave até ela entrar no tipo e no guard. Cada viagem do pagamento já traz `parcelKind` (`driver` | `helper`). Seletor e filtro: "Motorista, agregado ou ajudante".
  > 🤖 Modelo: `sonnet`
- [x] **T2.2b** Diálogo "Viagens do pagamento" (lista de viagens com diária × dias, incluir/remover, total).
      Feita: `ExpenseTripsDialog` (incluídas com diária × dias e total, "Adicionar viagens" com as disponíveis e as que ficam de fora com o motivo). Sem botão "usar como valor previsto": a API já recalcula o previsto a cada inclusão/remoção. Notas em `evidence.md` § T2.2b.
  > 🤖 Modelo: `sonnet`
- [x] **T2.3** Painel "Categorias de contas" em Configurações (`SETTINGS_PANELS`).
      Feita: aba `expenseCategories` em Configurações (`ExpenseCategoriesPanel`, autocontido): lista, cadastro e desativar/reativar, só com `expenses.read` (ver) e `expenses.manage` (escrever). Prints em `prints/categorias-*`. Notas em `evidence.md` § T2.3.
  > 🤖 Modelo: `sonnet`
- [x] **T2.4** Prints claro/escuro × desktop/celular comparados a outra tela do painel; evidência.
      Feita em 2026-11-13: prints das três telas da Fase 2 (lista, Nova conta, Dar baixa, Viagens do pagamento, Categorias) regerados em claro/escuro × desktop 1440/celular 375 e conferidos contra Vendedores e os previews aprovados. Um desvio achado e corrigido: no celular, a linha do favorecido ("Carlos Lima · Motorista") e o papel da viagem caíam sob a coluna do rótulo. Notas em `evidence.md` § T2.4.
  > 🤖 Modelo: `sonnet`

## Fase 3 — Publicação

- [ ] **T3.1** Staging: migration + deploy; conferir a rotina do cron e a baixa de ponta a ponta. Produção só na próxima promoção (não é bug crítico).
  > 🤖 Modelo: `sonnet`

## Fase 4 — Rateio (extensão, aguarda aprovação dos previews)

- [x] **T4.0** Anderson aprova os previews (`325-contas/prints/resultado-*`, `veiculo-*`, `rateio-*`) e as dúvidas 5 a 7 (ou aceita os padrões).
      Feita em 2026-11-13: Anderson aprovou os previews (resultado, veículo/cliente, rateio, lembretes e resposta "paguei") e os padrões das dúvidas 5 a 8 ("aprovado pode seguir").
  > 🤖 Modelo: `opus`
- [x] **T4.1** ADR-0116: o rateio é calculado na leitura, por grupo de custo, e o motorista não é somado de novo.
      Feita em 2026-11-13: [ADR-0116](../../docs/adr/0116-o-rateio-das-contas-e-calculado-na-leitura.md) aceita, com os pesos de cada critério, quem participa, o excedente do pagamento do motorista, o mês recalculado, a conta sem veículo e a soma que fecha. **Para a T4.5:** a data de conclusão da viagem é a mesma do pagamento (`payable-trip.query.ts`, T1.4b), nunca só `trips.closed_at`, que a conclusão pelo relatório do motorista não grava (ADR-0116 §3). Detalhe em `evidence.md` § T4.1.
  > 🤖 Modelo: `opus`
- [x] **T4.2** Contratos vermelhos: CA06 a CA10 (soma fecha, motorista não duplica, critério muda divisão e não total, veículo, isolamento).
      Feita: 34 contratos vermelhos em `apps/api-transportada/test/expenses/` (`allocation.contract.ts`, `result.contract.ts`, `result-routes.contract.ts`, entrypoint `allocation-red-entrypoint.ts`), com esqueleto que lança "not implemented" (`expense-allocation.policy.ts`, `expense-result.port.ts`/`.use-case.ts`, `expense-result.routes.ts`) e fixture `expense-result-in-memory.fixture.ts`. ⚠️ **Fora da lista `test` do `package.json` de propósito** (CI de staging não fica vermelho): a T4.4 move `allocation.contract.ts` e a T4.5 move `result*.contract.ts` para `test/expenses.contract.test.ts` quando ficarem verdes. Detalhe em `evidence.md` § T4.2.
  > 🤖 Modelo: `sonnet`
- [x] **T4.3** Schema: `cost_group` na categoria + `company_expense_allocation_settings` + semente; migration aditiva e rollback (`make migration-test`).
      Feita: migration `20261113215631_company_expense_allocation` + rollback (recusa com critério ou grupo personalizado). `company_expense_categories.cost_group` (padrão `administrative`, CHECK nos 4 grupos) e `company_expense_allocation_settings` (uma linha por empresa e grupo rateável, `unique(company_id, cost_group)`; o limite do alerta da T6.3 entra como coluna aditiva). Semente: as 8 categorias classificadas (RF10) e o critério padrão (RF11) para as empresas existentes; empresa nova usa `ensureSeeded` (já grava o grupo) e o padrão sem linha. Notas em `evidence.md` § T4.3.
  > 🤖 Modelo: `sonnet`
- [x] **T4.4** Serviço de rateio (puro, sem banco) com os quatro critérios e o arredondamento por linha; contrato de tabela.
      Feita: `allocateExpenses` em `src/expenses/domain/expense-allocation.policy.ts` (pesos `per_km`/`per_trip_day`/`per_revenue`/`equal`, conta com veículo só nas viagens dele, sem veículo e excedente do pagamento no rateio geral, `in_trip` só pelo excedente, peso zero e veículo sem viagem em não rateado). A divisão usa o **mesmo** `distribute` da 232, extraído para `src/shared/proportional-split.policy.ts` (`distributeByWeight`), que o rateio por nota passou a importar. `allocation.contract.ts` (18 da T4.2 + 7 de borda) saiu do entrypoint vermelho e roda por `test/expenses.contract.test.ts`. **Para a T4.5:** a política não lê data de banco; quem monta `AllocationTrip.completedOn` é a consulta da T4.5, com `completedOnSql` de `payable-trip.query.ts` (ainda não exportado; o contrato de `result-routes` cobra). Valor de conta com 4 casas só é aceito com o centavo exato (`'10.5000'`); senão lança. Provas em `evidence.md` § T4.4.
  > 🤖 Modelo: `opus` (dinheiro e regra que não pode duplicar)
- [x] **T4.5** Casos de uso e rotas de leitura: resultado do mês, margem por viagem/veículo/cliente, custo por km por veículo e geral (RF17); configuração de rateio.
      Feita: `GET /expense-result?from&to` (lucro, margens por viagem/veículo/cliente, não rateado, excedentes e pagamentos sem viagem, critério usado e hora do cálculo), `GET /expense-unit-costs?from&to` (custo por km por veículo e geral, RF17) e `GET|PUT /expense-allocation-settings` (PUT com `expenses.manage`, auditado). As viagens do período usam `completedOnSql` exportado de `payable-trip.query.ts` (`allocation-trip.query.ts`); faturamento e custo vêm de `buildValuationFromContext`. `costGroup` sai na API de categorias (só leitura; trocar o grupo de uma categoria fica para a T5.3). `result*.contract.ts` saíram do entrypoint vermelho para `test/expenses.contract.test.ts` (já na lista do `package.json`) e a integração entrou em `test:integration`. Notas em `evidence.md` § T4.5.
  > 🤖 Modelo: `sonnet`
- [x] **T4.6** Filtros no caso de uso do resultado e exportação PDF/CSV pelo mesmo cálculo (RF18 a RF20, CA11); auditoria da exportação.
      Feita: `GET /expense-result` aceita `vehicleId`, `customerId`, `categoryId` e `payeeDriverId` (motorista, agregado ou ajudante); os filtros só escolhem o que aparece e soma, o rateio segue sobre o período inteiro (ADR-0116 §4). `GET /expense-result/export?format=pdf|csv` (`expenses.read`) lê o **mesmo** `computeExpenseResult`, grava `expense_result.export` no diário (formato, período, filtros) e devolve o arquivo. CSV com BOM, `;` e vírgula decimal; PDF por `pdfkit`. A regra do cliente da viagem com notas de vários clientes (nota de maior frete) ficou isolada em `expense-trip-customer.policy.ts`, ainda **pendente de confirmação** do Anderson. Notas em `evidence.md` § T4.6. A tela (botões e filtros) é a T5.2b.
  > 🤖 Modelo: `sonnet`

## Fase 5 — Painel de resultado

- [x] **T5.1** Módulo no frontend: cliente, validação, hooks, locales pt/en para o resultado e o rateio.
  > 🤖 Modelo: `sonnet`
      Feita: no módulo `expenses` (mesma chave raiz da T2.1): `expensesResult.types.ts`, `expensesResult.validation.ts` (guard manual, dinheiro sempre texto, margem e lucro com sinal), 5 métodos novos em `expensesClient.service.ts` (resultado, custo por km, ler e trocar o rateio, exportar PDF/CSV com os mesmos filtros), hooks `useExpenseResult.hook.ts` e locales pt/en (`result`, `allocation`). Contrato `test/expenses/result.contract.ts` na lista do `package.json`. Sem tela: a página é a T5.2, os filtros e botões a T5.2b e o painel de rateio a T5.3. Notas em `evidence.md` § T5.1.
- [ ] **T5.2** Página `/contas/resultado`: indicadores, últimos meses, abas por viagem/veículo/cliente.
  > 🤖 Modelo: `sonnet`
- [ ] **T5.2b** Filtros (período, veículo, cliente, categoria, motorista/agregado) e botões Exportar PDF/CSV na página de resultado (RF18).
  > 🤖 Modelo: `sonnet`
- [ ] **T5.3** Painel "Rateio das contas" em Configurações (`SETTINGS_PANELS`).
  > 🤖 Modelo: `sonnet`
- [ ] **T5.4** Prints claro/escuro × desktop/celular comparados a outra tela; evidência; staging (produção na próxima promoção).
  > 🤖 Modelo: `sonnet`

## Fase 6 — Previsões (etapa final)

- [ ] **T6.1** Contratos vermelhos: CA12 e CA13 (histórico curto, faixa, limite de fora do padrão).
  > 🤖 Modelo: `sonnet`
- [ ] **T6.2** Serviço puro de previsão (média por dia útil, faixa, limite configurável) e alerta de fora do padrão; contrato de tabela com casos de borda (mês sem viagem, veículo novo).
  > 🤖 Modelo: `opus` (regra de estimativa que o dono vai usar para decidir)
- [ ] **T6.3** Caso de uso e rota de leitura da previsão e dos alertas; limite em `company_expense_allocation_settings`.
  > 🤖 Modelo: `sonnet`
- [ ] **T6.4** Cartão "Previsão" e lista "Fora do padrão" na página de resultado, com o aviso de poucos dados; prints claro/escuro × desktop/celular; evidência.
  > 🤖 Modelo: `sonnet`

## Fase 7 — Lembretes de vencimento

- [ ] **T7.1** Contratos vermelhos: CA14 e CA15 (idempotência, paga/cancelada, sem responsável, canal desligado, "paguei" de quem não é o responsável).
  > 🤖 Modelo: `sonnet`
- [ ] **T7.2** Schema: `responsible_user_id` na conta, configuração de dias e resumo, registro de avisos enviados (única por ocorrência, responsável, dia e tipo), canal e autor da baixa por resposta; migration aditiva e rollback.
  > 🤖 Modelo: `sonnet`
- [ ] **T7.3** Modelo de e-mail "Aviso de conta a vencer" (HTML versionado, publicado pelo script de modelos) e regra de quem avisar, por qual canal e quando.
  > 🤖 Modelo: `opus` (decide quem recebe aviso de dinheiro)
- [ ] **T7.4** Rotina no `cron-transportada`: avisos e resumo diário, idempotente.
  > 🤖 Modelo: `sonnet`
- [ ] **T7.4b** Resposta "paguei": ler a resposta do WhatsApp (spec 281) e o link assinado do e-mail, validar o responsável e dar a baixa por resposta, com desfazer em 24 h (RF29 a RF31, CA15).
  > 🤖 Modelo: `opus` (baixa de dinheiro por mensagem; identidade do remetente)
- [ ] **T7.5** Painel: campo Responsável e avisos na conta, botão de desfazer baixa e painel "Lembretes de vencimento" em Configurações; prints claro/escuro × desktop/celular; evidência.
  > 🤖 Modelo: `sonnet`

## Trabalho futuro (sem task)

- Tela de cotação de frete usando o custo por km (RF17). Spec própria.
