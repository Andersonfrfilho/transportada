# Feature 325 — Contas fixas e variáveis da transportadora

> Pedido do dono (Anderson), 2026-11-13: "registrar o módulo e a página de adicionar contas fixas e variáveis".
> Status: **rascunho para aprovação**. Nada implementado. Quatro dúvidas abertas no fim (as respostas podem ser "usa o padrão").

## Specs do mesmo assunto (lidas)

| Spec     | O que já decidiu e esta spec **usa sem refazer**                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 061, 169 | A viagem lança gasto/receita avulso. Espécie é cadastro da empresa (`company_entry_kinds`, lado `expense`/`revenue`). **Conta fixa/variável não é lançamento de viagem**: é despesa da empresa, sem viagem obrigatória. |
| 009      | Faturamento (recebível). Esta spec é o lado **a pagar**; não mexe em fatura.                                                                                                                                            |
| 232, 259 | Lucro por nota/viagem usa só gasto de viagem. Rateio de conta fixa na viagem fica **fora** (ver Fora do escopo).                                                                                                        |

Não existe hoje módulo de despesa da empresa: confirmado em `apps/api-transportada/src` (sem `expenses`/`payables`) e no menu do painel (`workspaceNavigation.constant.ts`).

## Problema e resultado

A transportadora paga aluguel, contador, seguro, internet, folha (fixas) e manutenção, multa, pneu, combustível de pátio (variáveis), e **nada disso está no sistema**. O dono não vê o custo da empresa, só o da viagem.

**Resultado:** módulo **Contas** (API + painel, permissão própria, item no menu) para cadastrar e listar as contas da empresa:

- **Conta fixa**: recorrente, com periodicidade e dia de vencimento; o sistema gera a ocorrência de cada período.
- **Conta variável**: lançada avulsa, com valor e vencimento próprios.
- **Pagamento de motorista ou agregado** (pedido do Anderson, 2026-11-13): a conta pode apontar para um motorista/agregado do cadastro da frota (`fleet_drivers`) e entra na mesma lista, com a mesma baixa. Motorista da casa (`payment_model = fixed`) e agregado (`route_table`) são o mesmo cadastro; o painel mostra qual dos dois é.
- Cada ocorrência tem estado (`open`, `paid`, `canceled`), com baixa manual (valor pago, data, observação).

## Fora do escopo

- Pagamento real, integração bancária, conciliação, boleto/OCR de conta.
- Recalcular ou alterar o custo da viagem: ele continua sendo calculado pela 143. Este módulo só **lê** a parcela do motorista (`trip_financial_parcels`, `kind = 'driver'`) e **não a soma de novo** em nenhum total de despesa de viagem (sem DRE, não há dupla contagem).
- Rateio de conta fixa por viagem/veículo e DRE (seguem para spec própria depois que houver dado).
- Anexo do comprovante (candidato a v2).
- Notificação de vencimento (v2, pelo módulo de notificação).

## Histórias priorizadas

### P1 — Cadastrar conta fixa

**Given** usuário com `expenses.manage` **When** cadastra "Aluguel do galpão", categoria, valor previsto, mensal, dia 5 **Then** a conta aparece na lista e a ocorrência do mês corrente existe com vencimento dia 5.

### P2 — Lançar conta variável

**Given** a mesma permissão **When** lança "Troca de pneus" com valor e vencimento **Then** aparece na lista como variável, em aberto.

### P3 — Dar baixa

**Given** ocorrência em aberto **When** o operador informa valor pago e data **Then** vira `paid` com autor e hora; a diferença para o previsto fica visível.

### P3b — Pagar motorista ou agregado

**Given** um agregado cadastrado **When** o operador lança "Pagamento de motorista/agregado", escolhe o agregado e o valor **Then** a conta aparece com o nome dele e o rótulo "Agregado"; ao dar baixa, o pago fica no total dele no mês.

### P3c — Pagar o período pelas viagens feitas

**Given** um motorista com viagens concluídas na quinzena **When** o operador abre o pagamento dele e inclui as viagens **Then** vê cada viagem com "R$ 200,00 × 3 dias", o total vira o valor previsto, e as viagens não aparecem em outro pagamento.

### P4 — Ver o que vence

**Given** a lista **When** filtra por mês, tipo, categoria ou estado **Then** vê total previsto × pago e as vencidas destacadas.

## Requisitos funcionais

- **RF1** Tabela `company_expenses` (a conta): `company_id`, nome, `kind` (`fixed`|`variable`), categoria (FK para cadastro da empresa, ver RF2), valor previsto (`numeric`), `active`, e para fixa: `recurrence` (`monthly`|`bimonthly`|`quarterly`|`yearly`) e `due_day` (1–31, mês curto cai no último dia).
- **RF1b** Pagamento de motorista/agregado: a conta ganha `payee_driver_id` (FK opcional para `fleet_drivers`, da mesma empresa). A categoria semeada "Pagamento de motorista/agregado" **exige** o motorista; as demais categorias não aceitam. A lista mostra o nome do motorista e o rótulo "Motorista" ou "Agregado", derivado de `payment_model` na hora da leitura (nunca copiado). Ao escolher o motorista, o formulário sugere a recorrência pelo `payment_period` dele (`fortnightly`/`monthly`) e o valor pela diária cadastrada; tudo editável. Recorrência nova: `fortnightly` (quinzenal; vencimento nos dias 15 e último).
- **RF1d** Viagens do pagamento (pedido do Anderson, 2026-11-13): na ocorrência de pagamento de motorista/agregado, o operador pode **incluir as viagens realizadas** (`completed`, do motorista da conta, cuja data de conclusão cai no período e que ainda não entraram em outro pagamento dele). Cada viagem entra com o valor da parcela `driver` já calculada na viagem (diária × dias, 143), copiado em `company_expense_occurrence_trips` (ocorrência, viagem, valor, dias, `unique(trip_id)`: uma viagem paga uma vez só). O valor previsto da ocorrência passa a ser a soma das viagens incluídas (editável; a diferença fica visível). Viagem sem parcela `driver` calculada (lacuna) não entra e aparece como pendência. Remover a viagem da ocorrência aberta a devolve ao conjunto disponível; ocorrência paga é imutável.
- **RF1c** Filtro "Motorista/agregado" na lista, e total pago por pessoa no mês.
- **RF2** Categorias são cadastro da empresa, como as espécies da 169: tabela `company_expense_categories` (nome único por empresa, ativa, ordem). Semente: Aluguel, Folha, Impostos, Seguro, Manutenção, Combustível, Pagamento de motorista/agregado, Outros.
- **RF3** Tabela `company_expense_occurrences` (o que vence): conta, competência (`yyyy-mm`), vencimento, valor previsto, `status`, valor pago, data do pagamento, observação, autor da baixa. Única por (conta, competência). Conta variável tem exatamente uma ocorrência.
- **RF4** Ocorrências da conta fixa são geradas por rotina agendada no `cron-transportada` (idempotente, 3 meses à frente) e também ao cadastrar. Nunca gera para conta inativa.
- **RF5** Alterar valor/dia da conta fixa vale **dali para frente**: ocorrência já gerada não é reescrita; ocorrência paga é imutável.
- **RF6** Conta com ocorrência não é apagada: é desativada (padrão 169 RF6). Ocorrência aberta pode ser cancelada com motivo.
- **RF7** Permissões novas `expenses.read` e `expenses.manage`; `companyId` só do contexto autenticado. Papéis que recebem: a definir (dúvida 4).
- **RF8** Painel: página `/contas` (item "Contas" no menu), com lista (filtros e totais), formulário "Nova conta" (fixa/variável), diálogo de baixa, e aba/painel de categorias em Configurações (`SETTINGS_PANELS`). Só componentes do design system.
- **RF9** Auditoria: criação, edição, baixa e cancelamento entram na trilha de operações (010).

## Requisitos não funcionais

- Dinheiro `numeric`/`bigint` em string na API; nunca float. Arredondamento igual ao do restante do painel.
- Migration aditiva + rollback (`make migration-test`). Sem migration destrutiva.
- Fuso: vencimento é data civil de `America/Sao_Paulo`, sem hora.
- Teste de contrato antes da implementação; lista explícita no `package.json` da app.
- Tema claro/escuro, desktop/celular, com prints comparados a outra tela (regra de padrão visual).

## Casos extremos e falhas

- Dia 31 em fevereiro → último dia do mês. Competência duplicada por corrida do cron → unique + `ON CONFLICT DO NOTHING`.
- Baixa duas vezes → `409`. Baixa com valor ≤ 0 → `400`. Baixa de ocorrência cancelada → `409`.
- Usuário de outra empresa lendo conta → `404`, não `403` (sem revelar existência).

## Critérios de aceite

- CA01 Cadastro de fixa gera a ocorrência do mês e as dos 3 seguintes, uma só vez mesmo com o cron rodando duas vezes.
- CA02 Editar o valor da fixa não muda ocorrência paga nem já gerada.
- CA03 Sem `expenses.read` a rota e o item do menu não aparecem.
- CA04 Isolamento por empresa coberto por contrato negativo.
- CA05c Viagem entra em no máximo uma ocorrência; viagem de outro motorista, não concluída ou sem parcela `driver` → `409`.
- CA05b Conta da categoria de motorista sem motorista → `400`; motorista de outra empresa → `404`.
- CA05 Totais previsto × pago da lista batem com a soma das ocorrências filtradas.

## Dúvidas

1. **[NEEDS CLARIFICATION]** Recorrência: basta quinzenal/mensal/bimestral/trimestral/anual com dia de vencimento? (Padrão adotado: sim.)
2. **[NEEDS CLARIFICATION]** Vínculo opcional com **veículo** (ex.: seguro, IPVA, pneu do caminhão X) já na v1, ou só categoria? (Padrão: veículo opcional na conta, sem rateio.)
3. **[NEEDS CLARIFICATION]** Vínculo com **viagem** nas variáveis (ex.: multa)? (Padrão: não; gasto de viagem continua na 061/169.)
4. **[NEEDS CLARIFICATION]** Quem enxerga/edita: só dono/administrador, ou também o financeiro/escritório? (Padrão: `expenses.*` só para o papel administrador.)
