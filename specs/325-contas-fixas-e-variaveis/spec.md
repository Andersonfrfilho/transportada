# Feature 325 — Contas fixas e variáveis da transportadora

> Pedido do dono (Anderson), 2026-11-13: "registrar o módulo e a página de adicionar contas fixas e variáveis".
> Status: **aprovada** (2026-11-13). As quatro dúvidas foram fechadas (seção "Dúvidas"); implementação em andamento, uma task por vez.

## Specs do mesmo assunto (lidas)

| Spec     | O que já decidiu e esta spec **usa sem refazer**                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 061, 169 | A viagem lança gasto/receita avulso. Espécie é cadastro da empresa (`company_entry_kinds`, lado `expense`/`revenue`). **Conta fixa/variável não é lançamento de viagem**: é despesa da empresa, sem viagem obrigatória. |
| 009      | Faturamento (recebível). Esta spec é o lado **a pagar**; não mexe em fatura.                                                                                                                                            |
| 232, 259 | Lucro por nota/viagem usa só gasto de viagem. Rateio de conta fixa na viagem entra na extensão desta spec (RF10 a RF17).                                                                                                |

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
- Rateio de conta por viagem/veículo e o painel de resultado: entram como **extensão desta spec** (seção "Extensão: rateio e resultado do mês", fases 4 e 5 do tasks.md), depois da tela de Contas.
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
- **RF1d** Viagens do pagamento (pedido do Anderson, 2026-11-13): na ocorrência de pagamento de motorista/agregado, o operador pode **incluir as viagens realizadas** (`completed`, do motorista da conta, cuja data de conclusão cai no período e que ainda não entraram em outro pagamento dele). Cada viagem entra com o valor da parcela `driver` já calculada na viagem (diária × dias, 143), copiado em `company_expense_occurrence_trips` (ocorrência, viagem, pessoa, valor, diária, dias, `unique(trip_id, parcel_kind, driver_id)`: a parte de uma pessoa numa parcela da viagem é paga uma vez só; motorista e ajudante da mesma viagem são duas parcelas, cada uma paga à sua pessoa, e dois condutores da mesma viagem são duas partes da parcela `driver`, uma linha cada na valoração da 143). A viagem entra pela data de conclusão (última transição para `completed`, dia de São Paulo); o período padrão é o da ocorrência (o mês; na quinzenal, a quinzena do vencimento) e a lista aceita outro período de até 93 dias, para a viagem que ficou para trás. O valor previsto da ocorrência passa a ser a soma das viagens incluídas (editável; a diferença fica visível). Viagem sem parcela `driver` calculada (lacuna) não entra e aparece como pendência. Remover a viagem da ocorrência aberta a devolve ao conjunto disponível; ocorrência paga é imutável.
- **RF1e** **Ajudante** (pedido do Anderson, 2026-11-13): o ajudante é um perfil de `fleet_drivers` (`can_act_as_helper`, spec 149 e ADR-0093), então a conta de pagamento também aceita o ajudante como favorecido, com o mesmo cadastro e a mesma baixa. O rótulo da lista é "Motorista", "Agregado" ou "Ajudante" (lido do cadastro na hora). Para o ajudante, as viagens do pagamento são aquelas em que ele foi o ajudante, e o valor vem da parcela `helper` da viagem (diária do ajudante × dias, 149), não da `driver`. Uma pessoa que dirige numa viagem e ajuda noutra aparece com as duas. O seletor e o filtro passam a se chamar "Motorista, agregado ou ajudante".
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

## Dúvidas (fechadas em 2026-11-13, T0.1)

Anderson aprovou os padrões listados pelo coordenador no chat do projeto ("certo pode criar", 2026-11-13). Depois pediu o pagamento de motorista/agregado e aprovou a ligação com as viagens realizadas ("certo pode fazer").

1. **Recorrência** → mensal, bimestral, trimestral e anual com dia de vencimento; **quinzenal** acrescentada depois (RF1b). Resolvida.
2. **Veículo** → opcional na conta (seguro, IPVA, pneu do caminhão X), sem rateio. Resolvida. _Entra na T1.2 (coluna `vehicle_id`, FK opcional para `fleet_vehicles`)._
3. **Viagem nas variáveis** → não; a conta variável fica sem vínculo com viagem, e o gasto de viagem continua na 061/169. Resolvida.
4. **Quem vê e edita** → só o administrador (`expenses.read`/`expenses.manage` apenas no papel `company-admin`). Resolvida.

Nenhum `[NEEDS CLARIFICATION]` aberto.

## Extensão: rateio e resultado do mês (pedido do Anderson, 2026-11-13)

> Pedido: ratear as contas entre as viagens para ver o custo real de cada uma, e um painel do mês com quanto faturamos, quanto gastamos e o lucro. Previews em `/mnt/project-files/325-contas/prints/` (`resultado-*`, `veiculo-*`, `rateio-*`, claro e escuro, desktop e celular). **Aguardando aprovação dos previews antes de implementar.**

### Modelo de custo (como as grandes transportadoras fazem; base da ANTT)

Três grupos de custo, e cada categoria de conta cai em um deles:

| Grupo               | Exemplos                                | Como entra na viagem                              |
| ------------------- | --------------------------------------- | ------------------------------------------------- |
| **Fixo do veículo** | parcela, seguro, IPVA, rastreador       | dividido pelos km rodados no mês pelo veículo     |
| **Variável por km** | combustível, pneus, manutenção, pedágio | pelo custo por km do veículo, ou direto na viagem |
| **Administrativo**  | aluguel, contador, sistemas, impostos   | pelo faturamento da viagem                        |

A categoria "Pagamento de motorista/agregado" não é rateada: o custo dele **já está na viagem** (143) e não é somado de novo.

### Requisitos funcionais

- **RF10** Cada categoria de conta (`company_expense_categories`) ganha `cost_group` (`vehicle_fixed` | `per_km` | `administrative` | `in_trip`). A semente classifica: Aluguel, Impostos, Folha, Outros → `administrative`; Seguro → `vehicle_fixed`; Manutenção, Combustível → `per_km`; Pagamento de motorista/agregado → `in_trip`.
- **RF11** Critério de rateio **configurável por empresa e por grupo** (`company_expense_allocation_settings`): `per_km`, `per_trip_day`, `per_revenue` ou `equal`. Padrão (recomendado): fixo do veículo por km; variável pelo custo por km do veículo; administrativo pelo faturamento. Conta com `vehicle_id` vai só para as viagens daquele veículo; sem veículo segue o critério do grupo.
- **RF12** Cálculo **na leitura** (sem gravar o rateio na viagem) sobre o período: valor considerado da conta = pago, se baixada; senão previsto. Viagem entra pela data de conclusão. Sem viagens no período, o rateio do grupo não se distribui e aparece como "não rateado".
- **RF13** O pagamento de motorista/agregado **nunca é somado de novo**: as parcelas `driver` e `helper` das viagens incluídas (RF1d, RF1e) contam só no custo da viagem. Se o valor pago passar da soma das viagens incluídas, a diferença entra como conta da empresa (decisão a confirmar, dúvida 5).
- **RF14** Painel `/contas/resultado` ("Resultado do mês"): faturamento de fretes, custo das viagens, contas da empresa, lucro, margem, custo por km, receita por km e margem por km, com a variação sobre o mês comparado e a lista dos últimos meses.
- **RF15** Margem por **viagem**, por **veículo** e por **cliente**, com rateio do veículo e rateio geral em colunas separadas; todas fecham com o total do painel (contrato de soma).
- **RF16** Painel "Rateio das contas" em Configurações: grupo de cada categoria e critério de cada grupo (permissão `expenses.manage`; leitura do painel em `expenses.read`).
- **RF18** Filtros do painel de resultado: **período** (intervalo de datas, não só mês), **veículo**, **cliente**, **categoria da conta** e **motorista, agregado ou ajudante**, além de "comparar com" e critério de rateio. Valem para indicadores, tabelas e exportação; filtro de veículo/cliente restringe viagens e as contas ligadas ao veículo; categoria e motorista restringem as contas.
- **RF19** **Exportar PDF** (para imprimir ou enviar ao contador): cabeçalho com empresa, período e filtros aplicados, indicadores e as tabelas visíveis. Gerado no servidor, com os mesmos números da tela (um só cálculo).
- **RF20** **Exportar planilha (CSV)**: uma linha por viagem com frete, custo, rateio do veículo, rateio geral e margem, mais um bloco de totais; separador `;`, decimal com vírgula e UTF-8 com BOM para abrir no Excel. Permissão `expenses.read`; exportação auditada (010).
- **RF21** **Previsão do próximo mês** (pedido do Anderson, 2026-11-13): faturamento, custo total e lucro previstos, com **faixa** (mínimo e máximo). Cálculo: contas recorrentes já cadastradas para o mês + média diária de faturamento e de custo por km dos últimos 3 a 6 meses fechados × dias úteis. Sem IA e sem modelo pago: média simples, explicada na tela ("Como é calculado").
- **RF22** **Aviso de pouco dado**: com menos de 6 meses de histórico a previsão mostra o aviso "Poucos meses de dados" e usa a faixa mais larga; com menos de 3 meses não mostra previsão, só o aviso.
- **RF23** **Alerta de fora do padrão**: conta, custo por km de veículo ou categoria acima (ou abaixo) de 10% da média dos últimos 3 meses aparece na lista "Fora do padrão", com os dois valores e a diferença. O limite de 10% é configurável.
- **RF17** O **custo por km por veículo** e o geral saem por um caso de uso próprio e uma rota de leitura, para reaproveitamento (ver "Trabalho futuro").

### Critérios de aceite

- CA06 Lucro do painel = faturamento − custo das viagens − contas da empresa, e a soma das margens por viagem, por veículo e por cliente bate com ele (diferença só do "não rateado").
- CA07 Pagamento de motorista com viagens incluídas não altera o custo total nem o lucro.
- CA08 Trocar o critério de um grupo muda a divisão entre viagens, mas não o total rateado.
- CA09 Conta com `vehicle_id` não aparece no rateio de viagem de outro veículo.
- CA11 PDF e CSV batem, centavo a centavo, com o painel para os mesmos filtros.
- CA12 Previsão com menos de 3 meses de dado não é exibida; entre 3 e 5 meses exibe com o aviso; a faixa contém o valor previsto.
- CA13 A lista "Fora do padrão" só traz itens além do limite configurado.
- CA10 Isolamento por empresa e permissões, com contrato negativo.

### Dúvidas em aberto (decididas com padrão recomendado; Anderson pode trocar)

5. **Pagamento de motorista maior que as viagens incluídas** → a diferença (bônus, adiantamento) entra como conta da empresa. _Padrão proposto._
6. **Fechar o mês** → o rateio é recalculado ao abrir; se Anderson quiser congelar mês fechado (como o resultado congelado da viagem, 0049), entra como task própria. _Padrão: sem congelar._
7. **Conta "da frota" sem veículo** (ex.: seguro único) → rateia pelo critério do grupo entre todos os veículos. _Padrão proposto._

### Trabalho futuro (não implementar agora)

**Tela de cotação de frete** (pedido do Anderson, 2026-11-13): usará o custo por km do veículo e o geral (RF17) para sugerir preço e margem de uma cotação. Esta extensão só deixa o cálculo acessível por caso de uso e rota de leitura; a cotação terá spec própria.
