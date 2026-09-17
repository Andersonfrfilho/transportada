# ADR-0066 — A diária paga o motorista, e a zona fica de arquivo

- **Status:** aceita
- **Data:** 2026-09-17
- **Decisores:** usuário (decisão tomada ao longo da execução) e revisão Opus
- **Fecha:** a T3/T14 da spec 143 (`specs/143-a-diaria-paga-o-motorista/`)

## Contexto

A spec 143 troca o custo do motorista: em vez de precificar por zona/rota/empate contra
`freight_region_driver_rates` (specs 123–128), o custo passa a ser `diária × dias`
(`buildTripDriverCost`, T3), com a diária resolvida em cascata motorista → empresa → padrão (T2) e os
dias vindos da operação ou da duração estimada do roteiro (T4).

Isso deixa órfão um corpo de código que não é pequeno: `trip-driver-zone.policy.ts` (264 linhas,
resolve cobertura de zona e nomeia faixas), `trip-driver-tie.policy.ts` (decide o empate por maior
preço entre faixas empatadas) e as três suítes que os exercitam
(`driver-zone.contract.ts`, `driver-route-vote.contract.ts`, `driver-route-tie.contract.ts`). Nenhum
deles tem consumidor de produção depois da T3: `trip-valuation.query.ts` continua chamando
`resolveTripDriverZone` (T3 deixou a leitura ligada para não quebrar `crew-zone-wiring.contract.ts`
antes da hora), mas o resultado não entra mais na tripulação, e `readRatesByRegion` morreu como
método privado não utilizado.

A pergunta que fecha a spec: apaga ou mantém? Um leitor futuro que encontrar 264 linhas sem chamador
de produção vai supor código morto e removê-las — e é exatamente isso que este ADR impede.

## Decisão

**A política de zona e a política de empate continuam versionadas, sem consumidor de produção.**
`trip-driver-zone.policy.ts`, `trip-driver-tie.policy.ts` e as três suítes que provam que ambas
continuam funcionando (`driver-zone.contract.ts`, `driver-route-vote.contract.ts`,
`driver-route-tie.contract.ts`) **não são removidos**. `freightRegionDriverRates` deixa de ser lida
pelo domínio de viagens para formar custo, mas a tabela e o cadastro continuam existindo — é dado de
região de frete, não exclusivo do motorista.

Razão prática, não sentimental: a diária é a regra hoje, mas zona/rota/empate foi regra viva por
cinco specs (123 a 128), com nuance testada (célula vazia vs. veículo sem coluna, empate por número
de cidades, maior preço entre faixas). Se o produto voltar atrás — ou se uma transportadora precisar
de uma modalidade de custo por zona ao lado da diária — o código volta a ligar sem arqueologia: as
suítes são a prova de que ele ainda se comporta como descrito, e reescrevê-lo do zero custaria mais
que mantê-lo parado.

### Vocabulário de lacuna: nem todo código morto para de ser produzido junto

Seis códigos de `VALUATION_GAPS` **deixam de ser produzidos** por `buildTripDriverCost`, mas
**permanecem no vocabulário e nos quatro dicionários de locale**:

- `SALARIED_CREW_MEMBER`
- `NO_DRIVER_RATE`
- `CITY_WITHOUT_REGION`
- `DRIVER_RATE_MISSING_FOR_CLASS`
- `DRIVER_ZONE_PRICED_FROM_TABLE`
- `DRIVER_ROUTE_TIE_HIGHEST_RATE`

Resultado de viagem **já congelado antes desta spec** carrega esses códigos em
`trip_financial_parcels`, e a tela de resultado congelado lê o rótulo pelo código gravado, não
recalcula. Apagar o dicionário faria viagem antiga imprimir a chave crua (`DRIVER_RATE_MISSING_FOR_CLASS`)
em vez da frase, para sempre — congelamento é o oposto de mutável. Isto vale para qualquer código de
lacuna que um domínio deixe de produzir: o código sai do produtor, nunca do vocabulário, enquanto
houver linha congelada que o carregue.

Dois códigos do mesmo grupo já eram órfãos **antes** da spec 143, e ficam registrados aqui para não
parecerem estrago desta execução: `DRIVER_ZONE_NOT_COVERED` e `DRIVER_ROUTE_AMBIGUOUS` — declarados
em `VALUATION_GAPS`, traduzidos nos quatro locales, sem produtor em `src/` já antes desta spec (o
segundo, por texto do próprio código-fonte, não é mais produzido desde a spec 128).

## Alternativas rejeitadas

**Apagar `trip-driver-zone.policy.ts`, `trip-driver-tie.policy.ts` e as três suítes.** Rejeitada:
nenhuma delas tem defeito, e apagar destruiria cinco specs de regra testada por uma reorganização de
onde o custo vem — não por a regra ter parado de fazer sentido. Reescrever do zero, se o produto
precisar dela de novo, custaria mais que os poucos bytes de manter parada.

**Apagar os seis códigos de `VALUATION_GAPS` que pararam de ser produzidos.** Rejeitada: resultado
congelado grava o código, não recalcula o rótulo a cada leitura — apagar o dicionário quebra a leitura
de toda viagem antiga que o carrega, silenciosamente (chave crua na tela, sem erro).

**Mover a política de zona para `freight-regions/` como "arquivo morto".** Rejeitada: ela não é do
domínio de frete, é do domínio de custo do motorista por viagem — mover por estar parada confundiria
onde ela reaparece se for religada, e o _namespace_ certo continua sendo `trips/domain`.

## Consequências

- `trip-driver-zone.policy.ts`, `trip-driver-tie.policy.ts` e as três suítes seguem no repositório,
  sem chamador de produção. Quem for religar a precificação por zona começa lendo estas suítes, não
  reescrevendo a política.
- `trip-valuation.query.ts` mantém duas leituras de banco (`readZoneCatalog`, `readDriverCoverage`)
  que já não influenciam preço nem lacuna — custo aceito nesta spec, registrado como dívida de uma
  task (T3/T4), não como algo que este ADR resolve.
- Os seis códigos de lacuna continuam nos quatro dicionários de locale e em `VALUATION_GAPS` para
  sempre, ou até que se prove que nenhuma linha congelada os carrega mais (auditoria que esta spec
  não fez).
- Um item de limpeza aparentemente óbvio ("essa política não tem chamador, posso apagar?") passa a
  exigir ler este ADR antes — é o próprio propósito do documento.

## O que reabriria esta decisão

- O produto voltar a precificar o motorista por zona/rota, ao lado da diária ou no lugar dela.
- Uma auditoria mostrar que nenhuma linha de `trip_financial_parcels` carrega mais nenhum dos seis
  códigos congelados — aí o dicionário pode encolher, com o próprio achado citado no commit.
- Um segundo domínio precisar de uma política de zona/empate genérica — nesse caso ela migra para
  código compartilhado, não fica arquivada dentro de `trips/domain`.
