# 061 — a viagem fecha a conta

> **Depende da 056** (a viagem e suas paradas) e da **059** (a prontidão fiscal é o que garante que
> existe receita a somar). Consome a **060** (taxas) e a **058** (quilometragem) quando elas
> existirem — e funciona sem elas, com menos precisão declarada.

## Problema e resultado

Quando os CT-e de uma viagem estão autorizados, o sistema **já sabe quanto aquela viagem faturou** —
`cte_batch_item_charges` guarda cada componente do frete em `numeric(19,4)`. E ele já sabe quase todo
o custo: `freight_region_driver_rates` tem o valor pago ao motorista por classe de frete,
`fleet_vehicles` tem consumo médio (dois tanques, spec 051) e `other_costs_per_kilometer`, e a
empresa tem preço de combustível em `company_fuel_prices`.

O que ninguém consegue hoje é fazer a subtração. O resultado de uma viagem é reconstruído em planilha,
dias depois, por alguém que abre três telas — e por isso quase nunca é feito. A operação sabe o que
faturou no mês e não sabe **qual viagem deu lucro**, que é a única pergunta que muda a decisão de
amanhã: aceitar aquela carga, mandar aquele veículo, pagar aquele agregado.

O resultado desta feature é a viagem que fecha a própria conta: receita de frete, custo por
componente, e a margem — visível na viagem e somável por período, veículo, motorista e contratante.

## Fora do escopo

- Faturamento e contas a receber. Isto **mede**, não cobra.
- Folha, encargos e imposto sobre a operação. A margem aqui é operacional, não contábil — e a spec
  diz isso na tela, não só aqui.
- Precificação de frete ao contratante. `freight_rules` continua dona.
- Repasse de taxas ao contratante — é a **060**.

## Decisões

### D1 — Receita é o CT-e autorizado, e nada mais

A receita da viagem é a soma dos `cte_batch_item_charges` dos CT-e **autorizados** vinculados às notas
dela. Não é o cálculo de frete previsto (`freight_calculations`), não é a tabela, não é o combinado.

O motivo é que só o CT-e autorizado é um fato: ele foi emitido, tem chave, e é o que vai ser cobrado.
Somar previsão produz um relatório que discorda do financeiro, e um relatório que discorda do
financeiro é ignorado — o que é pior do que não existir.

Viagem com CT-e faltando não tem receita "parcial estimada": ela tem receita **incompleta e
declarada como tal**, com a contagem de quantas notas faltam. A 059 já constrói exatamente essa
consulta, e é dela que este número sai.

CT-e cancelado sai da soma, e a viagem passa a mostrar divergência — o mesmo estado `divergent` da 059.

### D2 — Custo é composto, e cada parcela diz de onde veio

| Parcela              | Fonte                                                                                         | Quando falta                                                     |
| -------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Motorista / agregado | `freight_region_driver_rates` (classe → valor), por nota ou por viagem                        | Sem região cadastrada, entra zero **marcado como ausente**       |
| Combustível          | km × consumo do veículo ÷ 1 × preço em `company_fuel_prices`, com os dois tanques da spec 051 | Sem km real (sem 058), usa a distância estimada e marca a origem |
| Outros custos por km | `fleet_vehicles.other_costs_per_kilometer`                                                    | Zero, marcado                                                    |
| Taxas de entrega     | `delivery_charges` da 060, em `recorded` ou adiante                                           | Zero enquanto a 060 não existir                                  |
| Pedágio              | lançamento manual na viagem                                                                   | Zero                                                             |

**Nenhuma parcela ausente vira zero silencioso.** Cada uma carrega `source` (`measured` | `estimated`
| `missing`), e a tela mostra a composição, nunca só o total. Uma margem de 18% que na verdade é
"18% se o combustível estiver certo, e ele foi estimado" é um número que leva a decisão errada com
mais confiança do que nenhum número levaria.

A consequência prática: enquanto a 058 não existir, o custo de combustível é estimado por distância
aproximada, e a tela diz isso. Não é motivo para adiar esta spec — é motivo para a tela ser honesta.

### D3 — O resultado é congelado quando a viagem fecha

Preço de combustível muda, tabela de agregado muda, `other_costs_per_kilometer` é reajustado. Se o
resultado for sempre recalculado do cadastro atual, a viagem de março muda de margem em julho, e o
histórico deixa de servir para comparar.

Então: enquanto a viagem está aberta, o resultado é **calculado ao vivo** (é previsão, e serve para
decidir). Quando ela vai a `completed`, ele é **congelado** em `trip_financial_results`, com os
valores e as premissas usadas — o mesmo raciocínio do snapshot de roteiro da 056 D2.

Recalcular um resultado congelado é ação explícita, com motivo e trilha, e guarda a versão anterior.
Acontece quando um CT-e é cancelado ou uma taxa entra atrasada — que é caso real, e é justamente por
isso que precisa de rastro em vez de sobrescrita.

### D4 — Dinheiro tem permissão própria

`trip.manage` deixa quem monta a viagem ver quanto ela deu de lucro, quanto se paga ao agregado e
qual a margem por contratante. Isso não é o mesmo poder.

Nasce `trip.financials` — leitura do resultado — separada de `trip.manage`. Quem separa carga não
precisa saber a margem; quem decide preço precisa. E o valor pago ao motorista é dado sensível para o
próprio motorista, que tem `trip.read`: **o painel financeiro não aparece no PWA**, e a rota de
resultado recusa o papel `driver` com teste próprio.

### D5 — Somar é tão importante quanto calcular

Uma viagem isolada não decide nada. O que decide é o acumulado: margem por **veículo** (aquele
caminhão se paga?), por **motorista/agregado** (quanto custa cada um por real faturado), por
**contratante** (o Spani dá lucro?) e por **período**.

Isso é consulta sobre os resultados congelados, com filtro e agrupamento — não uma tabela de
agregação mantida em paralelo, que dessincroniza. Se doer em volume, materializa-se depois, e aí com
número na mão.

## Histórias priorizadas

**P1 — a viagem mostra a conta**
_Dado_ uma viagem com todos os CT-e autorizados,
_quando_ o operador com `trip.financials` a abre,
_então_ vê receita, cada parcela de custo com sua origem, o total e a margem — em porcentagem e em
reais.

**P1 — a conta incompleta se declara**
_Dado_ uma viagem com 8 de 10 CT-e,
_quando_ o resultado é aberto,
_então_ mostra "receita de 8 de 10 notas" e a margem marcada como parcial. Nunca um número que
parece final.

**P1 — o custo estimado se distingue do medido**
_Dado_ uma viagem antes da 058 existir,
_quando_ o custo de combustível é exibido,
_então_ vem marcado como estimado, com a premissa (distância aproximada, consumo cadastrado, preço
da data).

**P2 — fechar congela**
_Dado_ uma viagem que vai a `completed`,
_quando_ o estado transiciona,
_então_ o resultado é gravado com as premissas, e a mudança de preço de combustível na semana
seguinte não o altera.

**P2 — o CT-e cancelado abre divergência**
_Dado_ um resultado congelado,
_quando_ um CT-e daquela viagem é cancelado,
_então_ a viagem aparece como divergente e o recálculo fica disponível como ação, com a versão
anterior preservada.

**P2 — quanto pagamos ao agregado**
_Dado_ um período,
_quando_ consultado por motorista,
_então_ mostra o total pago, o faturamento das viagens dele e a relação entre os dois.

**P3 — margem por contratante e por veículo**
Painel com o acumulado do período, ordenável e filtrável, com exportação.

**P3 — pedágio lançado à mão**
Lançamento simples na viagem, entrando na composição.

## Requisitos funcionais

1. `trip_financial_results` (D3): viagem, receita, parcelas de custo com `amount` e `source`, total,
   margem, premissas em JSONB, `frozen_at`, versão. Tudo em `numeric(19,4)`, como
   `cte_batch_item_charges`.
2. Cálculo ao vivo para viagem aberta; congelamento na transição a `completed` (056 D1), na mesma
   transação.
3. `POST /trips/:id/financial-result/recalculate` — explícito, com motivo, preservando a versão
   anterior.
4. `GET /trips/:id/financial-result` sob `trip.financials`.
5. `GET /financial-results` com filtro e agrupamento por período, veículo, motorista e contratante
   (D5), com exportação.
6. `POST /trips/:id/costs` para pedágio e custo avulso.
7. Permissão `trip.financials` (D4), com recusa explícita para `driver`.
8. Consumo opcional e degradado: sem 058, distância estimada; sem 060, taxas em zero — ambos
   marcados.
9. O cálculo é **módulo puro, sem I/O**: recebe receita, cadastros e premissas, devolve composição.
   É o que torna as regras de margem testáveis sem banco.
10. Frontend: painel na viagem e workspace de resultados, seguindo `docs/frontend/data-tables.md`.
11. Texto em `*.locale.json`.

## Requisitos não funcionais

- **Nenhuma soma de dinheiro em ponto flutuante**, em nenhum ponto do caminho — cálculo, agregação,
  exportação e tela. `numeric` no banco e decimal na aplicação (`database.md`).
- O resultado de uma viagem com 200 notas é calculado sem N+1.
- O acumulado de um mês com 400 viagens responde sem varredura de tabela por linha.
- Valor pago a motorista é dado sensível: nunca em log, nunca em payload de rota que o papel
  `driver` alcança.
- Multiempresa por construção, com teste negativo de isolamento.
- Toda alteração de resultado congelado é auditada com ator, motivo e hora.

## Casos extremos e falhas

| Caso                                       | Comportamento                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Viagem sem nenhum CT-e                     | Receita zero, declarada como ausente. A margem não é exibida — margem sobre zero é −100% e engana.                                     |
| CT-e emitido depois do congelamento        | Viagem vira divergente; recálculo disponível.                                                                                          |
| Motorista sem região cadastrada            | Custo de motorista `missing`, e a viagem aparece numa lista de "resultado incompleto por cadastro".                                    |
| Dois motoristas na mesma viagem            | O custo é somado; a atribuição por motorista rateia pelo que a regra de região disser, e se ela não disser, divide igualmente e marca. |
| Preço de combustível sem registro na data  | Usa o mais recente anterior e marca a premissa com a data efetiva.                                                                     |
| Viagem cancelada                           | Sem resultado. Custos já lançados ficam visíveis como perda.                                                                           |
| Taxa da 060 lançada depois do congelamento | Vira divergência, não sobrescrita silenciosa.                                                                                          |
| Margem negativa                            | Exibida como negativa, em destaque. Nunca escondida nem zerada.                                                                        |

## Critérios de aceite

- [ ] Teste do módulo puro de cálculo com composição completa, e com cada parcela ausente.
- [ ] Teste de que nenhuma parcela ausente vira zero sem `source: missing` (D2).
- [ ] Teste de congelamento: mudar preço de combustível depois não altera o resultado.
- [ ] Teste de recálculo: versão anterior preservada, motivo obrigatório.
- [ ] Teste de que `driver` recebe 403 na rota de resultado.
- [ ] Teste de precisão monetária: composição de 200 notas fecha exatamente com a soma dos CT-e.
- [ ] Teste negativo de tenant.
- [ ] E2E: viagem → CT-e → despacho → entregas → `completed` → resultado congelado com margem
      correta.
- [ ] `tsc --noEmit` + `make validate`.
- [ ] ADR (**0047**) sobre receita = CT-e autorizado, custo composto com origem declarada, e
      congelamento no fechamento.

## Dúvidas

- `[NEEDS CLARIFICATION: o pagamento ao agregado é por nota (freight_region_driver_rates é por classe de frete) ou por viagem (diária, percentual do frete)? Se houver mais de um modelo em uso, o cálculo precisa saber qual aplicar a cada motorista.]`
- `[NEEDS CLARIFICATION: a margem deve descontar imposto sobre o frete (ICMS, PIS/COFINS)? Descontar aproxima do resultado real e exige regra fiscal por UF; não descontar mantém a conta operacional e simples. Recomendação: não descontar agora, e dizer na tela que é margem operacional.]`
- `[NEEDS CLARIFICATION: quem tem `trip.financials` na prática — sócio e gerente apenas, ou o operador que monta viagem também precisa ver margem para decidir aceitar carga?]`

## 🤖 Modelo

| Etapa                                       | Modelo    |
| ------------------------------------------- | --------- |
| Composição de custo, congelamento, ADR-0047 | `opus` 🧠 |
| Módulo de cálculo e suíte de precisão       | `opus` 🧠 |
| Rotas, agregações, permissão                | `sonnet`  |
| Painéis e exportação                        | `sonnet`  |
