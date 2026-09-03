# ADR-0058 — A viagem começa por toque do motorista, e o estado deixa de ser só derivado

- **Data:** 2026-09-03
- **Estado:** aceita
- **Contexto:** acrescenta um estado a `TRIP_STATUSES` e duas transições manuais à máquina da
  **ADR-0043**, que hoje deriva `in_transit` e `completed` do estado das notas.

## Contexto

A ADR-0043 fez o estado da viagem ser **derivado** do estado das notas, com quatro transições manuais
e só (criar, planejar rota, despachar, cancelar). `resolveDerivedCandidate`
(`trips/domain/trip-state.policy.ts`) diz o resto: `in_transit` quando a primeira nota fecha,
`completed` quando a última fecha.

Isso tem uma consequência que só aparece medindo o dia do motorista: **chegar na parada não muda o
estado da viagem**. Só entregar ou devolver muda. Então quem sai do galpão às 6h e roda uma hora até a
primeira parada aparece como `dispatched` o tempo inteiro — indistinguível de quem não saiu. O
escritório não sabe se o caminhão está na estrada ou parado no pátio, e a diferença entre as duas
coisas é a única pergunta que ele faz naquela hora.

A derivação foi a decisão certa contra o defeito que ela evitava: estado que depende de alguém lembrar
de tocar num botão fica errado sempre que a pessoa esquece. Mas ela pagou esse seguro com a hora em
que mais se pergunta pela viagem.

## Decisão

### 1. Duas transições manuais, e um estado novo

`TRIP_STATUSES` ganha `on_delivery_route`, entre `in_transit` e `completed`. O ciclo do campo passa a
ser:

    dispatched --(motorista confere a carga)--> in_transit
    in_transit --(motorista inicia o trajeto)--> on_delivery_route
    on_delivery_route --(última nota fechada)--> completed

`completed` **continua derivado**: o fim não depende de ninguém lembrar de tocar. O que passa a ser
manual é o **começo**, que é o que a derivação não tinha como ver.

### 2. O que cada toque significa, e por que não são um só

- **Conferir a carga** é o motorista dizendo _"o que está no caminhão é o que a viagem diz"_. Ele vê
  as notas, as paradas e o DAMDFE antes de sair. Sem isso, divergência de carga só aparece na terceira
  parada.
- **Iniciar trajeto** é _"saí"_, e abre o guia da próxima parada. É a informação que o escritório não
  tem hoje.

Juntar os dois num botão só perderia a diferença entre o caminhão carregado no pátio e o caminhão na
estrada — que é justamente a distinção que esta ADR existe para criar.

### 3. O esquecimento não pode travar o trabalho

É a objeção que derrubou o botão da primeira vez, e ela é respondida, não ignorada:

- **Fechar uma nota adianta o estado.** Confirmou entrega estando em `dispatched` ou `in_transit`, a
  viagem salta para `on_delivery_route` pela derivação que já existe. Nenhum toque esquecido impede
  entregar, e nenhum deixa a viagem parada num estado que já não é verdade.
- **O estado nunca anda para trás.** `tripStatusRank` já garante isso, e é o que permite conviver
  transição manual e derivação sem uma desfazer a outra.
- **Encerrar o trajeto não volta o estado.** Ele fecha o guia, não a viagem. O motorista para para
  almoçar e continua depois; viagem que voltasse a `in_transit` a cada pausa produziria um histórico
  de idas e vindas que não descreve nada.

**Duas viagens despachadas são duas conferências.** O motorista com dois despachos no mesmo pátio
confere a carga de cada uma. É atrito de propósito: a conferência afirma que o que está no caminhão é
o que **aquela** viagem diz, e uma conferência que valesse para as duas não afirmaria nada sobre
nenhuma.

### 4. O toque é do motorista, e a permissão já existe

As duas transições são `trip.report`, que `driver` e `aggregate` já têm. **Nenhuma permissão nasce**,
e o escritório não ganha botão nenhum: `dispatch` continua sendo dele, e começar o trajeto continua
sendo de quem dirige.

## Consequências

- O escritório passa a distinguir caminhão carregado de caminhão na estrada, sem inferir.
- A conferência de carga vira um momento com hora registrada — hoje ela acontece e não deixa rastro.
- A spec 058 ganha um marco a mais para medir tempo real de rota, além do tempo de serviço por parada.
- **O que não se ganha:** posição. Estado não é rastro, e o rastro tem consentimento próprio
  (ADR-0050 §5).
- **O custo que se assume:** um valor novo no CHECK de `trips.status` e nas telas que traduzem
  estado, e duas rotas em `/me/trips/current`.

## Alternativas descartadas

| Alternativa                                     | Por que não                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Continuar só derivando                          | A hora em que mais se pergunta pela viagem é justamente a que a derivação não enxerga.          |
| Derivar `on_delivery_route` da primeira chegada | Chegar na parada é tarde: a pergunta é sobre a hora anterior, a da estrada.                     |
| Um botão só, "iniciar viagem"                   | Perde a distinção entre carregado no pátio e na estrada, que é o motivo da ADR.                 |
| Derivar do rastro de posição                    | Amarra estado de viagem a consentimento de localização, que é opcional e revogável por desenho. |
| Encerrar trajeto voltando a `in_transit`        | Toda parada para almoço viraria transição, e o histórico deixaria de descrever a viagem.        |
