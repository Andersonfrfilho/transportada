# Spec 111 — Ordem escolhida à mão na proposta

## Contexto

A proposta multi-veículo (spec 110) mostrava, no expandido de cada viagem, o mapa, a carga e a conta.
O operador pediu setas de subir e descer ao lado da lixeira, com pedágio, tempo e carga recalculando
a cada troca. Três defeitos medidos estavam no caminho:

1. **A proposta ordenava por rótulo.** Mapa e prévia de carga recebiam `view.cities` (`"FRANCA"`) e
   ranqueiam por `cidade|CEP|número`. Nada casava, tudo empatava em `MAX_SAFE_INTEGER`, e a planta de
   carga saía na ordem em que as **notas** chegaram, não na de entrega.
2. **Duas contas na mesma tela.** O mapa pede a rota ao OSRM com nós e imprimia o pedágio (medido:
   R$ 71,40 em 6 praças); o razão logo abaixo era a conta da sugestão, medida na matriz do solver sem
   nós, e dizia "pedágio só é calculado depois da viagem criada".
3. **O aceite ignorava qualquer ordem do cliente**: o corpo era `.strict()` com só `vehicleIds`, e a
   ordem vinha exclusivamente de `route_suggestion_stops.sequence`.

## Decisões

- **D1 — A ordem é chave de parada, nunca rótulo.** `buildProposalStopOrder` monta a chave na ordem do
  roteiro; o degrau `cidade:` virou `resolveStopKey`, um lugar só (estava copiado em três).
- **D2 — As setas voltam, e revertem a D6 da spec 110.** A D6 as recusou porque a conta ao lado não
  acompanharia a ordem. Hoje a conta do expandido é `useTripValuationPreview` — a da criação manual —,
  alimentada pela mesma `stopOrder` do mapa e da carga. Reordenar mede o caminho novo, o pedágio dele
  (mesma chamada ao OSRM que dá a distância, spec 090 D4) e a arrumação do baú.
- **D3 — O aceite leva a ordem.** `stopOrderByVehicle` opcional no corpo. A regra é a de
  `orderStopKeys`, que monta a planta: parada não mencionada vai ao fim na ordem do solver; chave que a
  proposta não conhece é ignorada (é o degrau `cidade:`); parada de **outro** caminhão é 400
  (`ROUTE_SUGGESTION_STOP_NOT_IN_VEHICLE`) — mover entre caminhões não existe. ⚠️ **Revogado pela spec 112**: hoje
  é movimento, e a parada vai com as notas dela. Toda recusa vem antes da
  reivindicação (spec 107 D2).
- **D4 — Ordem trocada à mão nasce sem horário previsto.** O horário é gravado casado por endereço, na
  ordem do solver, e descreveria outra ordem. A ordem do solver reenviada tal e qual não conta como
  troca. Na faixa do expandido, tempo e rodagem do roteirizador saem pela mesma razão; o mapa mede a
  ordem nova e os imprime.
- **D5 — A ordem é por caminhão**, ao contrário da remoção de parada: ela não muda o maço nem a
  distribuição, então não trava o aceite nem pede recálculo da proposta. Nova proposta e aceite a zeram.
- **D6 — Verde é o que entra, vermelho é o que sai, na tela inteira.** No razão a receita era o único
  total sem cor. Na linha recolhida e na barra de totais também — e ali o prejuízo saía **laranja**
  (`.negative` do `trip.module.css` é cobre) enquanto o razão logo abaixo pintava o mesmo prejuízo de
  vermelho: um número, duas cores, uma tela. O `.negative` global não foi tocado (outras telas o usam);
  na linha e na barra o prejuízo passou ao vermelho da despesa.
- **D7 — A proposta tem duas portas, e a regra vale nas duas.** A segunda abre pela tabela de Notas
  (`MultiVehicleSuggestionAction` → `MultiVehicleSuggestionDialog`) e imprimia receita, despesa e lucro
  positivo sem cor nenhuma. `SuggestionValuationReport` e `SuggestionVehicleValuation` ganharam as
  classes `revenue`, `expense` e `profit`. Receita ausente fica sem cor: verde afirmaria um valor que
  ninguém calculou.

- **D8 — As setas não vão ao servidor; quem mede é "Salvar ordem".** Na primeira versão cada toque
  refazia três consultas — a conta, a carreta e a rota do mapa, as duas últimas no OSRM —, e descer uma
  parada dez posições gastava trinta chamadas para mostrar números que o operador só queria ver no
  fim. Hoje o toque troca a parada de lugar com a vizinha **na tela**; "Salvar ordem" mede uma vez.
  Enquanto o rascunho está aberto: a faixa diz que pedágio, tempo e carreta são da ordem anterior; o
  mapa desenha o rascunho e **mede a ordem salva** (`measuredOrder`), sem pernas, pedágio por trecho
  nem traço, que apontariam a praça errada no trecho errado; e o aceite fica **travado** — a viagem
  nasceria numa ordem que ninguém viu medida. Voltar à ordem salva apaga o rascunho sozinho. Na
  criação manual nada muda: ela não passa `measuredOrder` e segue medindo a cada toque.

## Fora do escopo, e o porquê

- **As linhas recolhidas e a barra de totais continuam na conta da sugestão**, sem pedágio. Levá-las à
  prévia exige uma consulta por viagem proposta antes de qualquer expansão — é o próximo passo, e até
  lá linha recolhida e expandido podem discordar no pedágio e na distância.
- **Pedágio na sugestão em si** (fora do expandido) exige `/route?annotations=nodes` por veículo no
  worker e migration: o `/table` do OSRM não tem nós. Spec própria.

## Deploy

⚠️ **A API sobe antes do front.** O corpo do aceite é `.strict()`: a tela nova mandando
`stopOrderByVehicle` a uma API antiga leva 400.
