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

## O que falta (D3)

A segunda onda: a frase _"não couberam 56 — o RTD5J78 termina por volta das 14h e cobre 40 delas"_,
e o botão de continuação. O desenho está decidido na spec — plano é **leitura**, não registro;
"quando terminar" é **frase**, não gatilho; e não reserva nota.
