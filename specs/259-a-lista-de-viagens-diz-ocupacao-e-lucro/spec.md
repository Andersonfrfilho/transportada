# Feature 259 — A lista de viagens diz ocupação e lucro

> Registrada em 2026-10-09. Pedido do usuário olhando `/trips` em produção: "em cada item, adicione a
> porcentagem de preenchimento da van — de peso e de dimensão — e os gastos e lucros".
> Decisões do usuário: custo e lucro saem **da mesma conta do detalhe, em lote** (não do congelado, não de
> uma previsão simples).

## Problema e resultado

A linha da lista de viagens (`TripTable`) mostra veículo, status, valor da carga e receita estimada. Quem monta
a viagem decide se ela sai olhando para o detalhe, viagem por viagem, para saber **quanto do baú está cheio** e
**se a viagem dá lucro**. Os dois números existem — `TripCargoPanel` (ocupação) e `TripFinancialPanel`
(valoração) — e nenhum chega à lista.

Resultado: cada linha mostra

1. **Peso**: % do teto de carga do veículo (`payloadRatio`), com a marca de estimativa quando o peso é presumido.
2. **Volume (dimensão)**: % da capacidade em m³ (`occupancy`), com a marca de estimativa/parcial.
3. **Gasto**: `totalCost` da valoração.
4. **Lucro**: `totalMargin` e `marginPercentage`, marcado como previsto quando a receita é previsão.

Os números são **os mesmos do detalhe** — mesma política, mesmo arredondamento, mesma marca de estimativa.

## Fora do escopo

- Recalcular ou congelar resultado financeiro (`financial-result`) a partir da lista.
- Ordenar ou filtrar a lista por ocupação ou lucro (a ordenação atual só vale na página corrente; fica para depois).
- Mudar a conta de custo, de receita ou de ocupação. A lista só **lê** a conta existente.
- A app do motorista e o portal do contratante.

## Histórias priorizadas

### P1 — Ocupação na linha

**Given** uma viagem com veículo de capacidade conhecida e notas vinculadas **When** abro `/trips` **Then** a
linha mostra "Peso NN%" e "Volume NN%", iguais aos do detalhe da mesma viagem.

**Given** uma viagem sem veículo, sem capacidade ou sem medida **When** abro `/trips` **Then** a linha diz o
que falta ("sem capacidade", "a definir"), nunca 0% nem 100% sem marca.

### P1 — Gasto e lucro na linha

**Given** usuário com `trip.financials` **When** abro `/trips` **Then** cada linha mostra gasto, lucro e % de
margem, e o lucro negativo aparece como prejuízo.

**Given** usuário **sem** `trip.financials` **When** abro `/trips` **Then** as colunas de gasto e lucro não
existem e a resposta da API não carrega nenhum campo monetário novo.

### P2 — Lista continua barata

**Given** uma página de 20 viagens **When** a API responde **Then** o número de consultas não cresce com o
número de viagens (sem N+1) e uma falha em ocupação ou custo de uma viagem não derruba a lista.

## Requisitos funcionais

- RF1. `GET /trips` devolve, por item, `occupancy` (peso e volume, cada um com razão e origem/marca) ou `null`
  quando não há veículo.
- RF2. `amounts` ganha `costTotal`, `marginTotal` e `marginPercentage`, classificados `money` em
  `TRIP_AMOUNTS_FIELD_POLICY` (redigidos sem `trip.financials`).
- RF3. A conta de custo e margem é `buildValuationFromContext` — a **única** conta de margem do produto
  (comentário em `read-trip-valuation.use-case.ts`). Proibido somar custo à mão na lista.
- RF4. `occupancy` usa `resolveTripOccupancy` e `resolveTripCargoWeight`, as mesmas políticas do detalhe.
- RF5. Falha ao calcular ocupação ou valoração de uma viagem vira campo ausente nessa viagem, com `warn` só de
  ids e código; as demais linhas seguem.
- RF6. Frontend: colunas novas em `TRIP_COLUMN_KEYS`; gasto e lucro somem sem `trip.financials`
  (`visibleTripColumns`).
- RF7. Barra de progresso acessível (`role="progressbar"`, valor e texto), cor por faixa, sem cor como único
  sinal.

## Requisitos não funcionais

- Sem N+1: consultas por página independem do tamanho da página (medido, T1.1/T2.x).
- Isolamento por `companyId` em toda consulta nova; contrato negativo em `tenant-safety.contract.ts`.
- Zero logs de PII; nada de dinheiro em log.
- Dinheiro como string decimal, nunca `number`.

## Casos extremos e falhas

- Viagem `awaiting_crew` (sem veículo): ocupação `null`, custo com lacuna `NO_VEHICLE` nomeada.
- Viagem cancelada: sem custo nem ocupação úteis; a linha mostra "—".
- `hasGaps` da valoração: o lucro sai marcado "parcial".
- Receita `estimated`: lucro marcado "previsto".
- Carreta atrelada: capacidade da carreta vence (spec 147); cavalo nunca carrega.

## Critérios de aceite

- Para N viagens de fixture, o valor da lista é idêntico ao do detalhe (teste de paridade).
- Contagem de consultas igual para 1 e para 20 viagens.
- Sem `trip.financials`, o JSON não tem `costTotal`, `marginTotal` nem `marginPercentage`.
- Print do painel com a coluna nova e revisão de design (`web.md` §15).

## Dúvidas

- [NEEDS CLARIFICATION: ocupação em lote verdadeira (reescrever `loadTripOccupancy` por `tripIds`) ou reuso do
  carregador por viagem com concorrência limitada? Decide T1.1 com medição de consultas.]
