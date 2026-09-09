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

## O que falta (D3)

A segunda onda, com a frase e o expandido. O desenho está decidido na spec — plano é **leitura**,
não registro; "quando terminar" é **frase**, não gatilho; e não reserva nota. Falta implementar, mais
o botão de continuação, que é o ganho real de operação.
