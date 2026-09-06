# Feature 086 — O valor do agregado é o da zona **da viagem**

## Problema e resultado

A página de criação de viagem já mostra o custo do agregado: a parcela `driver` da prévia de
valoração sai de `freight_region_driver_rates`, cruzando a cobertura do motorista com a classe do
veículo. O encanamento existe ponta a ponta — `readPreviewCrew` →
`buildTripDriverCost` → `TripValuationPreview`. **O que não existe é a escolha da zona certa.**

`trip-valuation.query.ts` comenta que o valor sai "cruzando **a zona da parada** com a classe do
veículo". Ele não cruza. A consulta junta `fleet_driver_regions` — a cobertura do motorista — sem
nenhum filtro pelo destino da viagem, e `byDriver` fica com **a primeira linha que trouxer valor**.
Um motorista que cobre mais de uma zona da mesma família recebe um preço arbitrário, decidido pela
ordem que o Postgres devolveu.

Medido na tabela real trazida de staging (146 preços, 29 zonas): dentro de BARRETOS, a mesma classe
`truck` vale **1086,12** na zona `1.000` e **1508,51** na `1.003`. São 39% de diferença numa parcela
que a tela apresenta como número medido, sem marca de estimativa — e é o número que decide se a
viagem é montada.

O resultado desta feature é uma parcela `driver` que responde pela zona que a viagem realmente
percorre, e que diz `NO_DRIVER_RATE` quando não consegue decidir, em vez de escolher sozinha.

## Fora do escopo

- Mudar a tabela de preços, a importação dela ou a tela de Regiões (spec 038, ADR-0038).
- Ratear salário de motorista da casa na viagem — segue sendo custo do período (ADR-0049 §3).
- Fazer `tractor_unit` ter preço: `resolveVehicleFreightClass` manda `''` de propósito, porque
  cavalo mecânico não é coluna da planilha do cliente. Ele continua caindo em `NO_DRIVER_RATE`, e
  isso é o comportamento **certo**, não um defeito desta spec.

## Histórias priorizadas

### P1 — A zona sai do destino da viagem

**Given** um motorista que cobre as zonas `1.000` e `1.003` de BARRETOS
**And** uma viagem cujas paradas caem todas na zona `1.003`
**When** o operador abre a prévia na criação da viagem
**Then** a parcela `driver` vale o preço de `1.003` para a classe do veículo
**And** não o de `1.000`, nem o que vier primeiro.

### P2 — Zona indecidível é lacuna, nunca palpite

**Given** uma viagem cujas paradas caem em duas zonas que o motorista cobre com preços diferentes
**When** a prévia é calculada
**Then** a parcela sobe `NO_DRIVER_RATE` com o total marcado como incompleto
**And** a tela nomeia as duas zonas em conflito, para o operador decidir.

### P3 — Sem parada ainda não é sem preço, é sem resposta

**Given** uma viagem em `draft`, sem roteiro planejado e sem nota vinculada
**When** a prévia é calculada
**Then** a parcela `driver` sobe como lacuna, e não com o preço da primeira zona do motorista.

## Requisitos funcionais

- A resolução do valor recebe **o destino** (a zona das paradas / das notas escolhidas), além do
  motorista e da classe do veículo.
- A regra de zona é acumulativa dentro da família (`parseRegionCode`, `region-coverage.policy.ts`):
  quem cobre a zona 3 cobre a 1 e a 2 da mesma família. Empate entre zonas de famílias diferentes
  não se desempata sozinho — é o caso da P2.
- A escolha vive em **política pura**, testável sem banco. A consulta traz as candidatas; ela decide.
- Os dois caminhos usam a mesma política: `readCrew` (viagem existente) e `readPreviewCrew`
  (formulário). Divergir os dois faria a prévia prometer um preço e a viagem cobrar outro.

## Requisitos não funcionais

- Nenhuma chamada por motorista: as candidatas vêm numa consulta só, como hoje.
- `companyId` no `where` de toda junção nova, com contrato negativo em `test/*-schema/`.

## Casos extremos e falhas

- Motorista com cobertura `scope: 'city'` para a cidade da parada e `scope: 'region'` para a zona:
  a cidade é mais específica e vence.
- Nota sem endereço normalizável (a parada cai no balde "Sem parada"): não decide zona, e a viagem
  inteira vira lacuna se nenhuma outra parada decidir.
- Classe `''` (cavalo mecânico e afins): `NO_DRIVER_RATE`, como hoje.

## Critérios de aceite

- Contrato que reprova a escolha por ordem de linha: duas zonas cobertas, preços diferentes,
  destino numa delas → o preço é o da zona do destino, e o teste falha se a consulta devolver a
  ordem invertida.
- Contrato da P2: duas zonas plausíveis → `NO_DRIVER_RATE`, nunca um número.
- Paridade entre `readCrew` e `readPreviewCrew` afirmada por teste.
- Evidência com a consulta rodada contra o dado real de staging carregado em local.

## Decisões tomadas (2026-09-05)

As duas dúvidas bloqueantes foram respondidas pelo dono do produto:

- **D1 — a zona é a do último destino, o mais distante.** Uma viagem que toca 1.001 e 1.003 paga o
  preço da 1.003. É a leitura da coluna OBSERVAÇÃO da planilha ("Todas da Zona 1, 2, mais Zona 3"):
  uma saída, um pagamento, e o preço da zona alta já paga a passagem pelas baixas.
- **D2 — cidade sem zona é sinal, não palpite.** Quando o destino não casa com nenhuma linha de
  `freight_region_cities`, a parcela sobe como lacuna e a tela **nomeia a cidade a cadastrar**;
  quando houver município próximo já cadastrado, ela sugere a zona dele — como sugestão, nunca
  aplicada sozinha.

## Dúvidas

Nenhuma bloqueante. As decisões acima fecham as duas que existiam.
