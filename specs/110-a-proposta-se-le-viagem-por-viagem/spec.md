# Feature 110 — A proposta se lê viagem por viagem, e se aceita em parte

> Registrada em 2026-09-09, a partir de um preview desenhado com o usuário e de uma leitura do
> código que encontrou três defeitos que ninguém tinha visto.

## O princípio

**A distribuição multi-veículo é uma decisão, e decisão se toma comparando.** O operador precisa
olhar quatro viagens propostas lado a lado, entender o que cada uma rende e custa, corrigir o que
estiver errado e aceitar só o que serve. Hoje ele recebe quatro cartões com contagem de paradas, num
lugar da tela onde ele não estava olhando, e um botão que aceita tudo ou nada.

## O que está errado hoje, medido

### A revisão aparece onde ninguém a pediu

`TripRouteAssemblyProposal` é renderizada em `TripWorkspace.page.tsx`, entre os botões de ação e a
tabela de viagens. O diálogo que pediu o roteiro **fecha antes** — e quem passou dois minutos
escolhendo 132 notas, 5 motoristas e 5 veículos perde de vista o pedido que gerou aquilo.

O comentário no código diz que ela fica ali _"no mesmo lugar do resultado"_, porque mostrar a revisão
dentro do diálogo a cercaria dos avisos de campo vazio que a limpeza do formulário traz de volta.
⚠️ A premissa está certa e a conclusão não: o formulário **recolhe** quando a proposta chega, e não
há campo vazio para avisar sobre.

### O painel não parece deste produto

`.proposal`, `.proposalCard` e `.proposalCardCounts` (`trip.module.css:2146`) usam
`--color-border`, `--radius-md` e `--color-text-muted`. **Nenhum dos três existe em lugar nenhum do
produto** — nem em `styles/index.css`, nem em módulo algum. O navegador descarta a declaração
inteira: o painel renderiza **sem borda**, sem raio e com o texto "apagado" na cor cheia.

### O adaptador joga fora o que a API já manda

`MultiVehicleProposal.stops` é `CoverableSuggestionStop` — quatro campos:
`excludedFromOptimization`, `label`, `nfeDocumentIds`, `vehicleId`.

A mesma parada, em `route_suggestion_stops`, tem `estimatedArrivalAt`, `distanceFromPreviousMeters`,
`durationFromPreviousSeconds`, `geocodingPrecision`, `serviceTimeSeconds` e `violations`. ⚠️ O
adaptador do módulo `trip` os descarta **uma linha antes** de eles virarem tela.

### Não há como aceitar parte, nem corrigir nada

Um botão, tudo ou nada. Uma viagem com o caminhão errado obriga a descartar as quatro e refazer o
pedido — e a spec 108 acabou de tornar isso barato justamente para que a revisão fosse possível.

## Fora do escopo

- Persistir os `nodeIds` das praças por perna e as alternativas de rota na sugestão. É a dependência
  da D4b e tem spec própria (ver "Dependências").
- Reordenar paradas dentro de uma viagem proposta. A ordem é do solver; mexer nela é o mesmo
  problema da D6, e a viagem criada já tem `reorder-trip-stops`.
- Qualquer mudança na tela de viagens além de **remover** o painel de proposta dela.

## D1 — A revisão mora no diálogo que a pediu

`TripRouteAssemblyProposal` sai de `TripWorkspace.page.tsx` e entra em
`TripRouteAssemblyDialog.component.tsx`. O diálogo **não fecha** ao receber a proposta: ele fecha no
aceite ou no descarte.

Quando a proposta chega, o formulário de pedido recolhe numa faixa de uma linha — _"132 notas no
maço · 5 motoristas · 5 veículos · saída da base às 07:40"_ — com um botão **Alterar o pedido** que
o reabre. Sem isso a lista nasce duas telas abaixo do topo.

⚠️ A afirmação **"Nada foi criado ainda — nenhuma viagem, nenhum vínculo de nota"** continua no
painel, com o ícone de escudo. Ela é o ponto inteiro da spec 108 e não se mexe.

## D2 — Uma linha por viagem, e o título decide sozinho

Cada viagem proposta é uma linha expansível. Recolhida, ela carrega:

| Onde      | O quê                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| Marca     | Quadrado com a **cor da viagem** na borda e o **ícone do tipo** do veículo dentro |
| Título    | Nome do motorista                                                                 |
| Ao lado   | Placa Mercosul, marca/modelo e tipo                                               |
| Subtítulo | As cidades que ela cobre, na ordem, com "mais N" acima de quatro                  |
| À direita | **Entregas · Peso · Receita · Despesas · Lucro · Tempo**                          |

⚠️ **A marca é um elemento com dois fatos.** A cor é a identidade da viagem — a mesma do traço no
mapa, dos pinos das paradas e das fatias do baú (paleta de `--color-cargo-stop-*`) — e o desenho é o
tipo. Dois elementos lado a lado diriam a mesma coisa em dobro, e o ponto colorido sozinho não diz
que caminhão é.

⚠️ **Despesas em vermelho (`--color-alert`), lucro em verde (`--color-ready`), receita neutra.**
Receita − Despesas = Lucro, na ordem em que a conta se lê, sem abrir nada.

⚠️ **As duas marcas obrigatórias aparecem na linha recolhida**: peso estimado (ADR-0052) e conta
incompleta (spec 101). Escondê-las atrás da expansão faria o número se apresentar como fechado
exatamente na tela em que ele é comparado com os outros.

⚠️ **As colunas são de largura fixa**, não `flex` com `gap`. Com flex, cada linha se ajusta ao
próprio conteúdo e `R$ 541,85` não cai embaixo de `R$ 1.211,97`. Número que não alinha não se
compara, e comparar é o que esta tela faz.

## D3 — O expandido é a tela de criar viagem, por viagem proposta

Abrir uma linha mostra, nesta ordem:

1. **Faixa do veículo** — ícone do tipo em destaque, marca/modelo, placa, medidas do baú, eixos,
   porta, e quatro números (volume, peso, entregas, rodagem).
2. **Roteiro** — o mapa com o traçado e a lista do dia em ordem (D4).
3. **Pedágio** — total, praças, eixos e mês da tarifa.
4. **Opções de rota** — com a mais barata marcada; uma opção só não desenha seletor.
5. **Carga** — ocupação de volume e peso, dimensões do baú, a **silhueta animada** do tipo escolhido
   com a carga dentro, e as ressalvas de origem.
6. **Planta isométrica 3D** com o seletor de camadas e a legenda.
7. **Conta** — o razão de uma coluna (D7).

⚠️ **Nenhum componente novo de carga, mapa ou conta.** `useTripCargoPreview` e `TripAssemblyMap`
recebem **notas + veículo** e não precisam de viagem criada; `CargoVehicle` e `TripCargoLayers` são
do design system. O que a spec faz é montá-los por viagem proposta.

⚠️ **Uma silhueta animada por expandido**, na Carga. A faixa do topo leva só o ícone do tipo.

## D4 — O dia em ordem, e o pedágio no trecho dele

O roteiro deixa de ser lista de paradas e vira linha do tempo:

```
◆ Base · Ribeirão Preto            saída 07:40
│  18,4 km · 32 min
① Ribeirão Preto · 5 notas         08:40
│  24,1 km · 41 min
[P] Pedágio Sertãozinho (sentido Norte) · Entrevias   R$ 98,40
② Sertãozinho · 3 notas            10:05
   …
│  42,8 km · 51 min · volta
[P] Pedágio Taquaritinga (sentido Sul) · Eixo SP      R$ 83,20
◆ Base · Ribeirão Preto            chegada 14:10
[R$] Motorista / agregado · zona 1.002 (Jaboticabal) · toco   R$ 1.480,00
```

**D4a — A volta tem três formas, e as três já existem.** `company_route_optimization_settings.
end_policy` é `depot` (volta à base), `address` (endereço próprio — a casa do motorista) ou
`last_stop` (não traz o caminhão de volta). `resolveRouteEndAddressKey` é o único intérprete, e a
sugestão já roteiriza com as pernas (`leadingLegs` / `trailingLegs` em `route-depot.policy.ts`).
Em `last_stop` a linha do tempo diz isso por extenso, em vez de morrer calada.

**D4b — ⚠️ A praça no trecho certo depende do backend.** A spec 090 casa a praça por **identidade de
nó** e **soma** o trajeto inteiro. Guardar o nó por perna é a mesma leitura de `annotations=nodes`
preservando o agrupamento — a praça **é** um nó do OSM, então a perna sai resolvida por construção,
sem raio e sem heurística. Enquanto isso não existir, a linha do tempo mostra as paradas e a volta, e
o pedágio continua saindo como `TOLL_NOT_AVAILABLE_IN_SUGGESTION` no painel.

**D4c — O pagamento do agregado fecha a rota, e não entra numa perna.** É **um** pagamento pela
viagem inteira, pela zona do último destino (spec 086 D1). Pendurá-lo num trecho sugeriria que outro
trecho tem outro pagamento.

## D5 — Aceitar todas, ou só as marcadas

Caixa de seleção por viagem, mais **Selecionar todas** com estado indeterminado quando a seleção é
parcial. A caixa fica **fora do gatilho** da linha: botão dentro de botão não existe, e marcar para
aceitar não pode abrir um detalhe de trinta linhas.

**Os totais da barra são do que está marcado.** É o ponto: desmarcar o caminhão com a conta
incompleta faz a marca sumir junto com ele, e é assim que se compara aceitar tudo com aceitar parte.

O rodapé diz o que acontece com o resto: _"As 15 notas da viagem não marcada voltam para o maço —
nada é criado para elas."_

**D5a — Aceite parcial consome a sugestão.** `POST /route-suggestions/:id/accept` passa a receber os
`vehicleIds` aceitos. A reivindicação atômica da spec 107 D2 continua idêntica
(`SET status='accepted' WHERE id=? AND status='ready'`), e o que não foi aceito **não vira nada**: as
notas voltam ao maço porque nunca saíram dele.

⚠️ A alternativa — manter a sugestão `ready` para aceitar o resto depois — foi recusada: entre os
dois aceites o maço muda, e a segunda metade descreveria uma distribuição que não existe mais. É a
mesma razão pela qual `stale` existe.

**D5b — Ações por viagem, só ícone com dica.** Na linha: **✓ aceitar só esta viagem**, **✕ descartar
esta viagem**, e **⟳ recalcular** quando ela foi alterada. `@/components/ui/tooltip`, com
`aria-label` no botão (§9 do `web.md`). ⚠️ **O espaço dos três fica reservado sempre**: sem a
reserva, as métricas das linhas vizinhas dançam horizontalmente quando o ⟳ entra.

## D6 — Editar destino invalida os números, e diz isso

Por parada, no menu da linha do tempo: **mover para outro caminhão** e **remover destino**. Abaixo
dela, **adicionar destino**, de um seletor com as paradas que sobraram e as dos outros caminhões da
mesma proposta.

⚠️ **Ação em menu, nunca edição em linha** — a mesma regra do desvio de endereço (D9 da 056).

⚠️ **Editar torna os números velhos, e o painel afirma isso:**

> **Roteiro alterado.** Distância, pedágio, ocupação e conta abaixo ainda são do traçado anterior —
> quem escolheu o caminho foi o roteirizador, e refazer a conta aqui daria um segundo número que
> discorda dele. **[Recalcular este caminhão]**

É a spec 090 D4 um nível acima: remendar km e pedágio no cliente é desenhar um traço e cobrar outro.
Quem edita, recalcula. A linha ganha a etiqueta `roteiro alterado` enquanto isso não acontece.

Remover marca a parada como **riscada com "Desfazer"** e diz que as notas voltam ao maço — nada é
apagado antes do recálculo.

## D7 — A conta numa coluna, com a derivação embaixo

Uma coluna, `width: min(100%, 46rem)`, ordenada **pela maior parcela primeiro**:

```
Receita do frete                                          R$ 4.320,00
O QUE A OPERAÇÃO CUSTA
Motorista / agregado                                      R$ 1.480,00
  zona 1.002 (Jaboticabal) · toco · agregado, pago por rota ·
  uma vez pela viagem, pela zona do destino mais distante
Combustível                                                 R$ 413,79
  184,2 km ÷ 2,8 km/l × R$ 6,29 por litro = 65,79 l · R$ 2,25/km ·
  Diesel S10 · referência da ANP para SP · semana de 31/08 a 06/09
Pedágio                                                     R$ 312,80
  3 praças · 2 eixos declarados · tarifa de ago/2026
…
O QUE O IMPOSTO LEVA
ICMS · PIS/COFINS      (imposto desce da receita, não é gasto de rodar)
Despesas                                                  R$ 3.108,03
Lucro                                        + R$ 1.211,97 · 28,1%
```

⚠️ **A derivação mora na linha do próprio custo**, não em painéis laterais. A primeira versão do
preview tinha o mesmo número em três lugares — topo, lista e painel —, e três lugares é onde eles
começam a discordar.

⚠️ **Maior primeiro.** O agregado costuma ser o dobro do combustível; na ordem da API ele cai no meio
da lista, e é por ele que a viagem se decide.

⚠️ **A parcela sem valor continua na lista**, com o motivo no lugar do número. Sumir é o que faz um
total incompleto parecer completo — a regra já é essa em `TripValuationPreview` e não muda.

⚠️ **`max-width` é proibido em `src/**/\*.css`** (`web.md`§10, contrato`responsive.contract.ts`):
a largura sai de `width: min(100%, 46rem)`.

## D8 — Convergência com a criação manual

A tela de criar viagem já tem mais coisa do que parecia. **O que ela já faz e a proposta herda**:

- `assemblyMap.depotLeg.outbound` **e** `depotLeg.return` — as duas pernas da base já existem, o que
  confirma a D4a;
- extrato de pedágio praça a praça, com `axleSource`, `estimated`, `tariff`, `withoutCharge` e
  `fallenBackToManual`;
- `routeOptions`, `noteAmount`, `noteWeight`, `noteRevenue`, `revenueRule`, `phoneCopy`;
- **`removeStop` já existe** — a ação de remover destino da D6 tem precedente e vocabulário lá.

**O que vai daqui para lá**, e é o que aproxima as duas telas:

| O quê           | Hoje na criação manual                                    | Depois                                            |
| --------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Conta           | `TripValuationPreview`: 3 totais + parcelas sem derivação | O razão da D7, mesmo componente                   |
| Rótulo do custo | "Custo", neutro                                           | **"Despesas"**, em `--color-alert`                |
| Pedágio         | ✅ **Já põe cada praça no trecho dela** (`legIndex`)      | É a proposta que ainda não pode — ver abaixo      |
| Veículo         | Só um `Select`                                            | A faixa da D3, com ícone do tipo e medidas do baú |

⚠️ **Corrigido ao implementar, e a correção inverte o item.** Eu afirmei que o pedágio por trecho
não existia na criação manual, tendo lido o tipo até a linha anterior à que responde: o
`RouteGeometryTollBooth` **tem** `legIndex`, vindo da anotação de nós do OSRM **agrupada por
trecho**, e `TripAssemblyMap` já filtra as praças por perna (`tollRows(legIndex)`).

Então a convergência aqui é **ao contrário do que a tabela dizia**: quem tem o pedágio na sequência
é a criação manual, e quem não tem é a proposta — porque a sugestão não persiste os `nodeIds`
(D4b). O que se leva de lá para cá é o **desenho**; o dado ainda falta do lado da proposta.

⚠️ O comentário do próprio tipo explica por que a coordenada não serve: a polilinha publicada é
simplificada, e num roteiro que fecha no barracão a ida e a volta correm sobre a mesma rodovia — as
duas cancelas gêmeas caíam no mesmo trecho, e a volta ficava sem pedágio nenhum.

⚠️ **A tela existente manda sobre a preferência** (`web.md` §14): o razão e a faixa nascem em
componentes compartilhados, consumidos pelas duas telas. Duas implementações da mesma conta
divergem caladas — foi assim que o preço do combustível passou a ler só o ajuste manual enquanto a
ficha do veículo lia o efetivo (spec 100).

## Requisitos funcionais

- **RF1** — A proposta é renderizada dentro de `TripRouteAssemblyDialog`, que só fecha no aceite ou
  no descarte. O formulário recolhe numa faixa com "Alterar o pedido".
- **RF2** — Uma linha expansível por viagem proposta, com marca, motorista, veículo, cidades e os
  seis números da D2, em colunas de largura fixa.
- **RF3** — O expandido monta os sete blocos da D3, reusando `TripAssemblyMap`,
  `useTripCargoPreview`, `CargoVehicle` e `TripCargoLayers`.
- **RF4** — A linha do tempo da D4, com base, paradas, praças por perna, perna de volta pela
  `end_policy` e o pagamento do agregado no fecho.
- **RF5** — Seleção por viagem e "selecionar todas" com indeterminado; totais e rótulo do botão
  derivados da seleção; frase do que volta ao maço.
- **RF6** — `POST /route-suggestions/:id/accept` aceita `vehicleIds`; o que não foi aceito não é
  criado, e a sugestão é consumida.
- **RF7** — Ações por viagem (aceitar, descartar, recalcular) só de ícone com `tooltip` e
  `aria-label`, com o espaço dos três reservado.
- **RF8** — Ações por destino (mover, remover) e adicionar destino; a viagem alterada exibe a faixa
  e a etiqueta até ser recalculada.
- **RF9** — O razão da D7, em componente compartilhado com a criação manual.
- **RF10** — O adaptador de `MultiVehicleProposal` passa a carregar `sequence`,
  `estimatedArrivalAt`, `distanceFromPreviousMeters`, `durationFromPreviousSeconds` e
  `geocodingPrecision` por parada. ⚠️ **A API não muda**: medido em 2026-09-09, `serializeSuggestion`
  já devolve a parada inteira e é o `coverableStopsFromApi` que lê quatro campos de doze — então esta
  RF não tem janela de deploy.

## Requisitos não funcionais

- Nenhum `<svg>` cru fora de `components/ui` (`icon.contract.ts`); a marca da linha usa
  `VEHICLE_TYPE_ICONS`.
- Nenhum valor arbitrário: cores, espaçamentos e alturas saem dos tokens (`web.md` §8).
- `max-width` e `width <=` proibidos em CSS; pontos de quebra apenas os quatro do `web.md` §10.
- Esqueleto com a forma do conteúdo em todo carregamento (`docs/frontend/loading.md`).
- Alvo de toque de 44px nas ações em mobile.
- Todo estado de carregamento e toda mutação seguem `docs/frontend/mutations.md`.

## Casos extremos e falhas

- **Nenhuma viagem marcada** — o botão diz "Nenhuma viagem marcada" e fica desabilitado.
- **Uma viagem só na proposta** — sem seletor de opções de rota, e "Selecionar todas" some.
- **Conta incompleta** — a marca acompanha o total na linha, na barra e no razão; desmarcar a viagem
  incompleta tira a marca da barra.
- **Veículo sem capacidade conhecida** — ocupação ausente é `null`, nunca 0% nem 100%; a faixa do
  veículo mostra o peso absoluto e diz que não há teto na ficha.
- **`end_policy = last_stop`** — sem perna de volta, sem pedágio de volta, e a linha do tempo diz.
- **Parada sem cidade** — cai no balde "Sem parada" como no detalhe da viagem, nunca some.
- **Aceite concorrente** — a reivindicação da spec 107 D2 responde `409` antes de criar coisa alguma.
- **Editar e aceitar sem recalcular** — o aceite é recusado enquanto a etiqueta `roteiro alterado`
  estiver na linha.

## Critérios de aceite

- [ ] A proposta não aparece mais em `TripWorkspace.page.tsx`; um contrato por texto de fonte falha
      se `TripRouteAssemblyProposal` for importada ali.
- [ ] Os três tokens inexistentes saíram de `trip.module.css`; um contrato varre `src/**/*.css` por
      `var(--` sem definição correspondente.
- [ ] Contrato de seleção: marcar, desmarcar, indeterminado, totais derivados, rótulo do botão e a
      frase do que volta ao maço.
- [ ] Contrato da linha do tempo: praça na perna certa, as três `end_policy`, e o pagamento do
      agregado fora das pernas.
- [ ] Contrato do razão: ordem por maior parcela, parcela com lacuna presente com o motivo, e a soma
      batendo com o total da API.
- [ ] Contrato de reserva das ações: a linha alterada e a não alterada têm a mesma largura de ações.
- [ ] Contrato de convergência: a criação manual e a proposta importam **o mesmo** componente de
      razão e a mesma faixa de veículo.
- [ ] `make check` verde; evidência por task em `evidence.md`.

## Dependências

- **Pedágio por perna e alternativas de rota na sugestão** — spec própria. Sem ela, D4b degrada com
  `TOLL_NOT_AVAILABLE_IN_SUGGESTION`, que é o comportamento de hoje e já está correto.
- **Fixar parada em veículo no solver** — spec própria. Sem ela, "mover destino para outro caminhão"
  não existe: o recálculo desfaria o movimento sem avisar.

## Dúvidas fechadas

### A dúvida do movimento, respondida — e a descoberta que ela trouxe

**A pergunta era:** mover um destino para outro caminhão recalcula os dois automaticamente, ou marca
os dois como alterados e espera o operador?

**Resposta: marca e espera**, e o argumento é medido. O solver leva ~14 s em 305 paradas (spec 104),
e recalcular a cada arrasto dispararia duas corridas por gesto — a tela ficaria inutilizável. Editar
é intenção; recalcular é ato.

⚠️ **Mas ao desenhar isso apareceu um problema que a spec não previu, e ele muda o escopo da D6.**

O aceite parte dos **grupos do servidor** (`readGroups`), não do que o cliente desenhou. Uma edição
que só existe no cliente seria **ignorada pelo aceite** — o operador veria uma distribuição e
receberia outra. Então toda edição precisa passar por uma proposta nova. E aí:

| Ação                          | Recalcular honra? | Por quê                                                                      |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| **Remover destino**           | ✅                | Tira as notas do maço; a proposta nova nasce sem elas                        |
| **Adicionar destino**         | ➖                | Já é o **"Alterar o pedido"**: ele reabre o formulário com a escolha intacta |
| **Mover para outro caminhão** | ❌                | O solver **redistribui livremente** e desfaz o movimento                     |

Mover exige **fixar a parada no veículo** — entrada nova no solver, no worker, com spec própria.
Oferecer o botão sem isso seria oferecer um gesto que o recálculo desfaz calado, e isso é pior que
não oferecer.

⚠️ E **adicionar** não precisa de botão próprio: a parada que sobrou **já está no maço** — o solver
é que não a cobriu. Recalcular sem mudar nada devolveria a mesma sobra. Quem acrescenta nota de fora
é o **"Alterar o pedido"**, que reabre o formulário com a escolha intacta; um segundo caminho para o
mesmo fim seria duas portas que divergem no dia em que uma delas ganhar um filtro.

**Consequência para a D6:** esta feature entrega **remover destino**, com a marcação e o recálculo
que ela exige; mover fica registrado como dependência, e adicionar é o "Alterar o pedido". E o recálculo é **da proposta**, não de um caminhão: mexer no maço muda a
distribuição inteira, e um botão "recalcular este caminhão" prometeria um recorte que não existe.
