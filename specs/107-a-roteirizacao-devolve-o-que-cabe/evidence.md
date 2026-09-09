# Evidência 107 — A roteirização devolve o que cabe

## O que foi implementado

**D1 e D2, que são inseparáveis.** D3 (segunda onda) fica para a próxima leva.

|                                                                  |                                          |
| ---------------------------------------------------------------- | ---------------------------------------- |
| `linkDocument` devolve `false` para nota já viva em outra viagem | `trip-composer.adapter.ts`               |
| o aceite pula, conta o que ficou e nomeia o que saiu             | `multi-vehicle-suggestion.use-case.ts`   |
| `decide` (já condicional) passou a ser chamado **primeiro**      | idem                                     |
| `release` devolve a sugestão para `ready` na falha               | `drizzle-route-suggestion.repository.ts` |
| `skippedDocuments` na resposta da rota                           | `multi-vehicle-suggestion.routes.ts`     |

## Por que D1 exigia D2

Pular sozinho trocaria um erro barulhento por um defeito silencioso: o segundo aceite concorrente
deixaria de falhar, criaria N viagens, pularia todas as notas (o primeiro já as vinculou) e marcaria
`accepted`. **N viagens órfãs, sem aviso.** Pior que o erro de hoje, que ao menos gritava.

## A correção do D2 é de ordem, não de mecanismo

`decide` **já** era condicional (`where status = 'ready'`) — faltava chamá-lo cedo. Ele rodava depois
de onze segundos criando viagens, e dois pedidos nessa janela passavam os dois.

⚠️ Isso inverte uma decisão registrada no código: as viagens nasciam antes de propósito, _"se a
criação falhar no meio, a sugestão continua `ready` e o operador tenta de novo"_. A propriedade é
preservada pela **escrita compensatória** — e ela é condicional também (`where status = 'accepted'`),
senão uma compensação atrasada devolveria para `ready` uma sugestão que outro pedido já aceitou.

⚠️ A compensação **não desfaz as viagens criadas**: apagá-las destruiria trabalho que pode estar
correto, e a lista de viagens mostra o que nasceu.

## Um teste meu que passava pelo motivo errado

Escrevi `expect(fixture.calls.create).toHaveLength(0)` para provar que o aceite recusado não cria
viagem. `calls.create` é a criação de **sugestão**, não de viagem — a asserção era vazia e passava
sempre. Trocada por `expect(fixture.calls.trip).toEqual([])`, com um `claimFails` na fixture que
simula a reivindicação perdida.

Vale como lição: teste verde não é teste que prova. Este passou na primeira execução, e por isso
quase escapou.

## Gates

```
make check   exit 0
api          4852 tests · 0 fail
```

## A sobra na tela (segunda leva)

O usuário confirmou o que eu tinha marcado como incerto: **a sobra não aparecia**. A API a devolvia
desde a spec 106 e a tela simplesmente não a lia — as notas sumiam da proposta sem explicação, e o
roteiro **parecia completo**.

`TripRouteAssemblyLeftovers` imprime a frase e abre a lista, separada por causa:

| causa                             | ação que ela pede                               |
| --------------------------------- | ----------------------------------------------- |
| sem motorista que cubra a região  | cadastrar cobertura, ou ofertar outro motorista |
| endereço impreciso demais         | corrigir o endereço da nota                     |
| nota já vinculada a outra entrega | nenhuma — ela já está em rota                   |

⚠️ `test/suggestion-leftover/screen.contract.ts` afirma que o painel some **só** quando não há nada a
dizer: uma segunda condição — permissão, aba, tamanho de tela — é o caminho pelo qual a sobra
desaparece de novo, e o roteiro volta a parecer completo.

## Um defeito meu, corrigido antes do commit

Criei o serviço em `routing/shared/suggestionLeftover.service.ts` **e** reimplementei a mesma lógica
dentro do adaptador de `trip`. Duas definições de "sobra": uma testada e sem consumidor, outra em
produção e sem teste — exatamente o par que diverge no dia em que uma terceira causa aparecer.

Colapsado numa só. O adaptador importa de `routing`, o que `trip` já faz em três outros lugares, e a
assinatura pede a **forma mínima** (`CoverableSuggestionStop`) em vez do tipo completo — senão o
adaptador, que lê corpo cru da API, teria de construir campos que não usa.

## D3 — o botão de continuação (terceira leva)

**A hora não existe, e a medição é o que decidiu o escopo.**

|                                               |   preenchido |
| --------------------------------------------- | -----------: |
| `trip_stops.estimated_arrival_at`             | **0 de 869** |
| `route_suggestion_stops.estimated_arrival_at` |   873 de 950 |

O ETA é calculado na **sugestão** e nunca levado para a **viagem**. Não existe hora de término de
viagem em lugar nenhum do sistema — a frase _"o RTD5J78 termina por volta das 14h"_ não tinha de onde
sair, e inventá-la seria o número plausível sem aviso que este código recusa em todo lugar.

Então esta leva entrega o que é verdadeiro **e** o que rende mais: **o botão de continuação.**

- A sugestão passou a serializar `nfeDocumentIds` por parada — sem eles a sobra é uma lista de nomes
  de cidade que o operador refiltraria à mão, que é o passo em que 345 notas viraram sete viagens.
- `collectRetryableDocumentIds` devolve **só** a sobra sem cobertura. ⚠️ A parada de endereço
  impreciso não fica melhor numa segunda montagem, e reoferecê-la convidaria o operador a repetir o
  mesmo pedido esperando resultado diferente.
- `retryWith` **filtra o pool disponível** em vez de confiar nos ids: a nota pode ter entrado numa
  viagem entre o aceite e o clique, e reofertá-la produziria o `already_linked` que a D1 acabou de
  aprender a pular.

⚠️ E o tipo da sobra virou **alias** do de `routing` — eu tinha declarado uma cópia em `trip`, com os
mesmos campos menos a causa. Duas definições de "sobra" que divergiriam na primeira causa nova.

## O que falta

**A hora.** Levar `estimated_arrival_at` das paradas da sugestão para as da viagem no aceite, e expor
o término na listagem. ⚠️ Ela precisa vir marcada como **estimativa do planejamento**: o ETA congela
no momento em que a rota foi planejada e envelhece — às 14h ele ainda diz o que achava às 7h.

Com ela, a frase fica completa. Sem ela, o painel diz o que sabe.
