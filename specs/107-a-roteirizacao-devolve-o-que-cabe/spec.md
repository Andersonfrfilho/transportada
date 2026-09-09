# Feature 107 — A roteirização devolve o que cabe, e nomeia o resto

> Registrada em 2026-09-09, a partir de um teste real que terminou em
> `TRIP_DOCUMENT_ALREADY_LINKED` e de duas decisões do usuário sobre como isso deveria se comportar.

## O princípio

**A roteirização nunca falha por inteiro.** Ela cria o que dá para criar e devolve, por extenso, o
que ficou de fora e por quê. Hoje ela faz o oposto: um único vínculo recusado derruba o aceite
inteiro, e o operador recebe um código de suporte no lugar de cinco viagens que estavam prontas.

## O que aconteceu, medido

Aceite de 345 notas em 6 veículos. Cinco viagens nasceram corretas — 328 notas, 289 paradas. O
operador viu **"Não foi possível montar o roteiro. Informe este código ao suporte:
TRIP_DOCUMENT_ALREADY_LINKED"**.

A causa foi um **segundo aceite concorrente**: `accept` lê o estado `ready`, gasta onze segundos
criando viagens e só então marca `accepted`. Dois pedidos nessa janela passam os dois. O primeiro
venceu; o segundo criou uma viagem órfã (`draft`, zero notas) e morreu ao vincular uma nota que o
primeiro acabara de vincular.

⚠️ A mensagem era verdadeira e inútil: dizia "já vinculada" sem dizer **por quem** — e quem foi era
ele mesmo, um segundo antes.

## D1 — Nota já vinculada é pulada e **nomeada**, nunca erro

O aceite salta a nota que já está viva em outra viagem e segue. No fim, a resposta traz
`skippedDocuments`, com o id e o motivo, e a tela diz _"estas notas já estão vinculadas a entregas"_.

⚠️ Isto **não é** engolir erro: é a diferença entre "o roteiro falhou" e "o roteiro saiu, e estas
três notas ficaram de fora porque já estavam em rota". A segunda frase é acionável; a primeira manda
o operador ligar para o suporte.

## D2 — ⚠️ Pular sozinho troca um erro barulhento por um defeito silencioso

Se o aceite apenas pular, o **segundo aceite concorrente** deixa de falhar: ele cria N viagens,
pula todas as notas (já vinculadas pelo primeiro), planeja rota vazia e marca `accepted`. O
resultado é **N viagens órfãs sem nenhum aviso** — pior que o erro de hoje, que ao menos gritava.

Por isso a D1 **exige** a reivindicação:

`UPDATE route_suggestions SET status='accepted' WHERE id=? AND status='ready'`. Sem linha afetada, o
segundo pedido recebe `409` imediatamente, antes de criar coisa alguma.

⚠️ Isso muda uma decisão registrada no código: hoje as viagens nascem **antes** da marcação, de
propósito, _"se a criação falhar no meio, a sugestão continua `ready` e o operador tenta de novo"_.
A retomada é preservada por **escrita compensatória**: falhou no meio, volta para `ready`.

## D3 — Falta de veículo devolve **planejamento**, não recusa

Quando a carga não cabe na frota ofertada, a sugestão devolve as viagens que couberam **mais um
plano marcado** para o restante — explicitamente identificado como _"para quando o motorista
terminar a entrega atual"_.

É a segunda onda que o usuário pediu, e ela só é possível porque a spec 106 fez a **sobra existir**:
até ela, carga que não cabia era empurrada estourando o peso, e não havia o que planejar.

⚠️ **O plano não é viagem.** Ele não vincula nota, não reserva veículo e não aparece na lista de
viagens — senão a nota ficaria presa a uma viagem que talvez nunca saia, e voltaríamos ao defeito
que a spec 102 corrigiu.

### A frase resume, o expandido permite agir

O aviso é uma linha — _"não couberam 56 notas; o RTD5J78 termina por volta das 14h e cobre 40
delas"_ —, e **abre** numa lista com as notas por extenso: número, destinatário, cidade e o motivo de
cada uma ter ficado de fora (fora da cobertura, sem zona cadastrada, coordenada imprecisa).

⚠️ **Resumo sem detalhe é o defeito, não a solução.** "56 notas" manda o operador procurar quais numa
tela de 345 — que é exatamente o passo em que ele errou o filtro e despachou 345 achando que eram 21
(spec 103). O número na frase e a lista no expandido são a mesma informação em duas profundidades, e
quem decide qual precisa é ele.

⚠️ O expandido **não** ganha estado próprio: ele lê o que a sugestão já devolve. Guardar a lista
seria o registro que a D3 recusou, com outro nome.

## Decisões abertas — precisam do usuário

1. **Onde o plano vive?** Proposta guardada na própria sugestão (ela já tem paradas sem veículo), ou
   entidade nova? A primeira é barata e some quando a sugestão é descartada; a segunda sobrevive e
   vira fila de trabalho.
2. **"Quando terminar" é o quê?** `trips.status = completed`? A última entrega reportada? O ETA
   calculado? A escolha decide se o plano é um aviso ou um gatilho.
3. **O plano reserva a nota?** Se não reservar, duas montagens podem propor a mesma nota. Se
   reservar, ela fica presa fora de qualquer viagem.

## Aceite

1. Nota já vinculada é pulada, e volta nomeada na resposta.
2. Aceite concorrente recebe `409` sem criar viagem nenhuma.
3. Falha no meio da criação devolve a sugestão para `ready`.
4. Nenhuma viagem órfã com zero notas nasce de aceite duplicado.
5. O aviso de sobra abre numa lista com as notas e o motivo de cada uma.
