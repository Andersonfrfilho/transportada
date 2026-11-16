# ADR-0116 — O rateio das contas é calculado na leitura, por grupo de custo, e o motorista não é somado de novo

- **Status:** aceito (Anderson aprovou os previews da extensão e os padrões das dúvidas 5 a 8 em 2026-11-13, T4.0:
  "aprovado pode seguir")
- **Data:** 2026-11-13
- **Contexto:** spec 325 (`specs/325-contas-fixas-e-variaveis/`), extensão "rateio e resultado do mês", task T4.1.
- **Relaciona:** complementa a [ADR-0115](0115-a-conta-da-empresa-e-modulo-proprio.md) (a conta da empresa é módulo
  próprio) e lê, sem emendar, a [ADR-0049](0049-a-viagem-fecha-a-conta.md) (a viagem fecha a conta) e a
  [ADR-0066](0066-a-diaria-paga-o-motorista-e-a-zona-fica-de-arquivo.md) (diária × dias).

## Contexto

Com o módulo Contas (ADR-0115), o sistema sabe duas coisas que não conversam: quanto cada viagem faturou e custou
(`trip_financial_results` e `trip_financial_parcels`, congelados na conclusão pela 0049) e quanto a empresa deve e pagou
de aluguel, seguro, manutenção e pagamento de motorista (`company_expense_occurrences`). O dono quer ver o custo real
de cada viagem, de cada veículo e de cada cliente, e o resultado do mês (faturamento − custo das viagens − contas).

Três perguntas precisam de resposta antes de qualquer código:

1. Onde mora o rateio: gravado na viagem ou calculado quando alguém pede?
2. Como uma conta se divide entre viagens que rodaram distâncias, dias e fretes diferentes?
3. Como impedir que o motorista, que já está na parcela `driver`/`helper` da viagem e também numa conta de pagamento,
   apareça duas vezes no custo?

## Decisão

### 1. Três grupos de custo; a categoria diz o grupo

Toda categoria de conta tem `cost_group` (coluna em `company_expense_categories`, editável no painel):

| `cost_group`     | Exemplos                                | Entra na viagem por                                   |
| ---------------- | --------------------------------------- | ----------------------------------------------------- |
| `vehicle_fixed`  | parcela, seguro, IPVA, rastreador       | critério do grupo (padrão: km rodado no período)      |
| `per_km`         | combustível, pneus, manutenção, pedágio | critério do grupo (padrão: km, o custo por km)        |
| `administrative` | aluguel, contador, sistemas, impostos   | critério do grupo (padrão: faturamento da viagem)     |
| `in_trip`        | pagamento de motorista/agregado         | **não é rateado**: o custo já está na viagem (item 5) |

A semente classifica as oito categorias como na spec (RF10). Categoria nova nasce `administrative`, o grupo mais
neutro: ela entra no resultado sem cair em veículo nenhum até alguém escolher outro grupo.

### 2. O critério é da empresa, por grupo

`company_expense_allocation_settings` guarda, por empresa e grupo, um dos critérios `per_km`, `per_trip_day`,
`per_revenue` ou `equal`. O peso de cada viagem é:

| Critério       | Peso da viagem                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `per_km`       | a distância que o resultado da viagem usou (`planned_distance_meters`, a mesma do custo por km)  |
| `per_trip_day` | as diárias da viagem (`daily_allowance_days`, 143)                                               |
| `per_revenue`  | a receita do resultado vivo da viagem (`trip_financial_results.revenue_amount`, CT-e autorizado) |
| `equal`        | 1                                                                                                |

Viagem sem o dado do critério (sem distância, sem diária, sem CT-e) tem peso zero e aparece como pendência na leitura;
a parte dela vai para as outras viagens. Se todas as viagens elegíveis tiverem peso zero, a conta inteira fica em
**não rateado** (item 6).

Trocar o critério muda **como** a conta se divide, nunca **quanto** é dividido (CA08).

### 3. Quem participa: viagem concluída no período, e o veículo da conta manda

- A viagem entra no período pela data de conclusão, com a **mesma** definição que o pagamento do motorista já usa
  (T1.4b, `expenses/infrastructure/payable-trip.query.ts`): a última transição para `completed` em `trip_status_events`;
  viagem anterior a esse histórico cai em `trips.closed_at` e depois em `updated_at`; data civil de
  `America/Sao_Paulo`. Não se usa só `closed_at`: a conclusão pelo relatório do motorista
  (`drizzle-driver-field-report.repository.ts`) passa a viagem a `completed` sem gravá-lo, e essas viagens sumiriam do
  rateio. Duas leituras de "quando a viagem terminou" no mesmo módulo fariam a viagem cair num mês no pagamento e noutro
  no resultado, então a T4.5 reaproveita a expressão (ou a extrai para um lugar só), e a T4.2 tem contrato com viagem
  concluída pelos dois caminhos.
- Só viagem `completed`: a aberta ainda não tem resultado congelado e mudaria o rateio de todas as outras a cada parada.
- A conta entra pela competência da ocorrência. O valor considerado é o **pago**, se a ocorrência foi baixada; senão o
  **previsto**. Ocorrência cancelada não entra.
- **Conta com `vehicle_id`** vai só para as viagens daquele veículo (CA09). Sem viagem do veículo no período, ela fica
  em não rateado, com o veículo nomeado.
- **Conta sem veículo** (por exemplo, um seguro único da frota; dúvida 7 da spec) é dividida pelo critério do grupo
  entre **todas** as viagens concluídas do período, de todos os veículos. Não existe "rateio igual por veículo": um
  veículo parado o mês inteiro não recebe parte, porque não tem viagem para carregá-la.

### 4. Calculado na leitura; nada é gravado na viagem

O rateio não é gravado em `trip_financial_results`, em `trip_financial_parcels` nem em tabela própria. Ele é uma função
pura (T4.4) de três entradas lidas na hora: as ocorrências do período, as viagens concluídas do período com seus
resultados vivos, e a configuração de rateio. O resultado da viagem (0049), o lucro por nota (232/259) e o faturamento
(009) não mudam em nada.

Gravar criaria uma segunda fonte de verdade que envelhece sozinha: toda baixa de conta, troca de critério ou viagem
concluída atrasada exigiria reescrever o rateio de dezenas de viagens.

**Mês fechado é recalculado** (dúvida 6 da spec). Abrir outubro em dezembro refaz o rateio com o que se sabe em
dezembro: a conta de outubro baixada depois passa do previsto para o pago, e uma troca de critério vale também para os
meses passados. A tela e a exportação mostram o critério usado e a hora do cálculo, para que um número diferente do PDF
antigo tenha explicação. Congelar mês fechado, se um dia for preciso, vira task própria com snapshot e motivo de
recálculo, no modelo da 0049 §5.

Os filtros do painel (RF18) **não** mudam o rateio: ele é feito sobre todas as viagens e contas do período, e o filtro
só escolhe quais linhas aparecem e somam. Sem isso, a margem de uma viagem mudaria conforme o filtro de veículo ou
cliente, e duas telas da mesma viagem discordariam.

### 5. O motorista não é somado de novo

O custo do motorista e do ajudante mora **uma vez**, nas parcelas `driver` e `helper` da viagem (143, 149). A conta de
pagamento (`in_trip`) registra quando e quanto a empresa pagou, e entra no resultado só por uma porta:

```text
excedente = max(0, valor considerado da ocorrência − soma das viagens incluídas nela)
```

- O **excedente** (bônus, adiantamento, acerto; dúvida 5 da spec) entra como conta da empresa no grupo
  `administrative`, rateado pelo critério desse grupo, e aparece com o nome do motorista e o rótulo "Pagamento acima
  das viagens".
- A parte coberta pelas viagens incluídas não entra em total nenhum de contas: já está no custo das viagens (CA07).
- Pagamento **abaixo** das viagens incluídas não gera crédito: o custo da viagem não diminui porque a empresa pagou
  menos (a diferença é dívida com o motorista, visível em Contas, não lucro).
- Pagamento **sem viagem incluída** tem excedente igual ao valor inteiro. Para que um motorista de salário fixo não
  seja contado em dobro por esquecimento, a leitura lista essas ocorrências como pendência ("pagamento sem viagens
  incluídas"), com o valor, para o operador incluir as viagens ou confirmar que é conta da empresa.

### 6. A soma fecha, centavo a centavo

Dinheiro é `numeric(19,4)` lido como `bigint` escalado (`shared/decimal.service.ts`), nunca float. Cada conta é dividida
entre as viagens pelo mesmo `distribute` do rateio por nota (232): piso em cada parte e o resto inteiro para a viagem de
maior peso, com as viagens em ordem estável (data de conclusão, depois `id`) para o empate cair sempre na mesma. Assim, para
cada conta, a soma das partes é exatamente o valor considerado, e:

```text
lucro = faturamento − custo das viagens − contas da empresa
      = Σ margem por viagem − não rateado
```

A mesma identidade vale somando por veículo e por cliente (CA06). **Não rateado** é a soma das contas (ou partes) sem
viagem elegível, sempre exibida, nunca escondida dentro de outra linha.

### 7. Uma conta só, para tela, exportação e previsão

O resultado do mês, as margens por viagem, veículo e cliente, o PDF e o CSV (RF19, RF20, CA11) e o custo por km por
veículo e geral (RF17) saem do **mesmo** caso de uso de leitura, que chama o mesmo serviço puro. A exportação não refaz
a conta. O custo por km é exposto por caso de uso e rota próprios, para a futura cotação de frete reaproveitar.

A previsão (RF21 a RF23, Fase 6) lê os meses fechados por esse mesmo caminho. O limite do alerta de fora do padrão nasce
em **10%** e é configurável por empresa em `company_expense_allocation_settings`.

## Consequências

- O painel de resultado é sempre consistente com Contas e com o resultado da viagem, porque não guarda cópia de nenhum
  dos dois.
- Um mês passado pode mudar de número quando uma conta é baixada ou o critério muda; isso é explicado na tela e no
  arquivo exportado, não bloqueado.
- A leitura do mês custa uma consulta por fonte (ocorrências, viagens com resultado vivo, configuração) e um cálculo em
  memória; cabe no volume de uma instalação dedicada (ADR-0021). Se um dia não couber, o cache é do resultado do
  cálculo, invalidado por baixa, critério e conclusão de viagem, nunca uma tabela de rateio.
- Os contratos da T4.2 prendem: soma fecha (CA06), motorista não duplica (CA07), critério muda divisão e não total
  (CA08), conta de veículo não vaza (CA09), isolamento e permissões (CA10).

## Alternativas descartadas

| Alternativa                                     | Por que não                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Gravar o rateio na viagem                       | Duas fontes de verdade; mudaria o resultado de viagem fechada (0049) a cada baixa de conta         |
| Congelar o mês ao fechar                        | Anderson preferiu recalcular (dúvida 6); congelar exige snapshot e motivo, vira task se precisar   |
| Critério único fixo (igual por viagem)          | Viagem longa e curta pagariam o mesmo; margem por rota ficaria falsa                               |
| Conta sem veículo dividida igual entre veículos | Veículo parado receberia custo sem viagem para carregar, e a soma por viagem não fecharia          |
| Ratear o pagamento do motorista inteiro         | Conta o motorista em dobro: ele já está nas parcelas `driver`/`helper`                             |
| Ignorar o pagamento acima das viagens           | Bônus e adiantamento sumiriam do resultado; Anderson decidiu que viram conta da empresa (dúvida 5) |
| Aplicar os filtros antes de ratear              | A margem da mesma viagem mudaria conforme o filtro, e tela e exportação discordariam               |
