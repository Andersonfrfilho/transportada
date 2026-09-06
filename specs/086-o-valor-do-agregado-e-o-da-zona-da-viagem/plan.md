# Plano técnico — 086

## A medição que manda no desenho

Antes de desenhar qualquer coisa, medi o casamento entre o destino das notas e a tabela de zonas,
com o dado real de staging carregado em local (29 zonas, 83 cidades, 146 preços):

| casamento                                            | destinos distintos | casam  |
| ---------------------------------------------------- | ------------------ | ------ |
| `upper(trim())`, como `normalizeRegionCity` faz hoje | 76                 | **39** |
| dobrando acento também                               | 76                 | **65** |

**As 38 cidades que não casavam eram todas sem acento** — `RIBEIRAO PRETO`, `SAO CARLOS`, `MATAO`,
`GUAIRA`. A NF-e escreve sem acento; a planilha do cliente escreve com. Não é cidade faltando, é
grafia — e `normalizeRegionCity` (`region-coverage.policy.ts`) sobe a caixa e colapsa espaço, mas
**não dobra acento**.

Isso reordena a spec: sem a dobra de acento, metade das viagens cairia em `NO_DRIVER_RATE` por um
motivo errado, e a lacuna diria "cadastre RIBEIRAO PRETO" com Ribeirão Preto já cadastrada. A dobra
vem **antes** da escolha de zona.

Sobram **12 cidades genuinamente ausentes** da tabela — `ALTINOPOLIS`, `ITOBI`, `ORLANDIA`,
`GUATAPARA`, `RESTINGA`, `NUPORANGA`, `ITIRAPUA`, `ESPIRITO SANTO DO PINHAL`, `SANTA CRUZ DA
CONCEICAO`, `SANTO ANTONIO DA ALEGRIA`, `SANTO ANTONIO DO JARDIM`, `VISTA ALEGRE DO ALTO`. Essas
são exatamente o caso da D2: a lacuna as nomeia.

⚠️ A dobra é em **TypeScript**, dentro de `normalizeRegionCity`, nunca por `unaccent` do Postgres.
Usei a extensão só para medir; o índice `freight_region_cities_company_city_idx` é sobre a coluna
crua, e uma expressão `unaccent(city)` no `where` o descartaria. A cidade é normalizada na escrita
(importação) e na leitura pela mesma função pura, como a caixa alta já é.

## O caminho do dado

`trip_stops` **não tem cidade** — só `address_key` (`(postal_code, number, city_code)`) e `label`.
`freight_region_cities` chaveia por **nome** de cidade + UF. Então a resolução não é um join direto:

```
parada (trip_stops.sequence)
  → trip_documents → nfe_documents
  → resolvePhysicalDestination (spec 073: desvio manual → <entrega> → <enderDest>)
  → nfe_addresses.city / .state
  → normalizeRegionCity (com dobra de acento)
  → freight_region_cities → region_id
  → freight_region_driver_rates (region_id, freight_class)
```

Usar `resolvePhysicalDestination` e não o destinatário cru é obrigatório: a linha divisória da 073
diz que **quem decide lugar** segue o destino físico, e a zona de frete é lugar.

## As três peças novas

### 1. `foldRegionCity` — a chave de casamento (feito)

Em `freight-regions/domain/region-coverage.policy.ts`, ao lado de `normalizeRegionCity`.

⚠️ **Corrigido ao escrever o contrato:** o desenho inicial dizia "`normalizeRegionCity` dobra
acento". Está errado. Essa função é o que a importação **grava** e o que a tela **imprime** — dobrar
ali resolveria o casamento e faria o operador ler `MATAO` no nome da própria cidade dele, contra a
regra de acentuação de pt-BR do produto. A dobra é uma segunda função, usada **só para comparar**,
nos dois lados: as 83 cidades já gravadas continuam acentuadas e passam pela mesma chave.

### 2. `trip-driver-zone.policy.ts` — política pura, novo arquivo

`resolveTripDriverZone({ stops, coverage })` decide qual zona paga:

- Ordena as paradas por `sequence` e toma **a última** (D1: o destino mais distante).
- Se a última parada não resolve cidade → tenta a anterior, e assim por diante. Uma parada sem
  endereço normalizável não derruba a viagem inteira.
- Confere a cobertura do motorista com `coversRegion` (acumulativa dentro da família).
- Devolve `{ regionId }` ou `{ gap, cityToRegister }` — nunca um número escolhido por ordem de linha.

Sem roteiro planejado (prévia, viagem em `draft`) não há `sequence` confiável. Aí a regra é a **zona
mais alta alcançada dentro da família**, que é o que a acumulação já significa; paradas em famílias
diferentes sem ordem → lacuna. _Assumido, não perguntado: é a leitura mais próxima da D1 quando o
"mais distante" ainda não foi calculado._

### 3. As duas consultas passam a receber o destino

`readCrew` e `readPreviewCrew` (`trips/infrastructure/trip-valuation.query.ts`) trazem as candidatas
— cobertura do motorista **e** as cidades das paradas — e chamam a política. Hoje elas decidem
sozinhas, com `byDriver` ficando com a primeira linha que trouxer valor; é esse trecho que sai.

⚠️ **Uma consulta só, como hoje.** Nada de uma ida ao banco por motorista ou por parada.

## Lacuna nova

`VALUATION_GAPS` ganha `cityWithoutRegion` (`CITY_WITHOUT_REGION`), distinta de `noDriverRate`:
"a cidade não está na tabela" é acionável de um jeito ("cadastre ITOBI/SP"), "o motorista não cobre
esta zona" é de outro. Rótulo nos dois `*.locale.json` que já carregam os gaps.

## Riscos

- **A mudança de `normalizeRegionCity` alcança a importação.** Reimportar a planilha depois dela
  precisa continuar devolvendo `{0,0,0}` — a idempotência da 038 é contrato e não pode quebrar.
- **`tractor_unit` continua sem preço**, por desenho. Se depois da 086 a parcela `driver` de uma
  viagem com cavalo mecânico aparecer com número, é defeito.
- Multiempresa: toda junção nova leva `company_id`, com contrato negativo.

## 🤖 Modelo

| fase                                   | modelo                                       |
| -------------------------------------- | -------------------------------------------- |
| T1–T2 (dobra de acento, política pura) | `sonnet`                                     |
| T3 (as duas consultas + paridade)      | `opus` 🧠 — é onde a decisão sai da consulta |
| T4–T5 (lacuna, rótulos, evidência)     | `sonnet`                                     |
