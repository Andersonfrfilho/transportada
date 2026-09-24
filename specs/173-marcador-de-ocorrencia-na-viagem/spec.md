# Feature 173 — A viagem mostra onde há ocorrência

## Problema e resultado

Para saber se uma nota teve ocorrência, é preciso abrir o diálogo **daquela nota**. Numa viagem de
dez paradas, são dez aberturas para responder "algo deu errado nesta viagem?".

O dado para responder isso **já chega à tela**: a API publica `openOccurrenceCase` em cada nota e
`hasOpenOccurrence` em cada parada desde a spec 164 T15 — e o bundle passou a aceitá-los em 23/09,
depois de eles derrubarem a viagem inteira por serem desconhecidos. Aceitar não é usar: hoje os dois
campos chegam e a tela os ignora.

Resultado: a viagem diz, de relance, quais paradas e quais notas têm ocorrência aberta.

## Fora do escopo

- Resolver a ocorrência pela tela da viagem — a tratativa é a spec 164.
- Contar ocorrências encerradas. O marcador é de **tratativa aberta**, que é o que ainda pede ação.

## Histórias priorizadas

### P1 — Ver de relance onde está o problema

**Given** uma viagem com ocorrência aberta em duas notas
**When** o operador abre a viagem
**Then** as duas notas aparecem marcadas, e a parada delas também.

### P2 — Chegar na ocorrência em um clique

**Given** uma nota marcada
**When** o operador clica no marcador
**Then** abre o diálogo de ocorrência daquela nota, sem procurar o botão.

### P3 — Instalação com API antiga não inventa marcador

**Given** uma API que ainda não publica os campos
**When** a viagem é aberta
**Then** nenhuma marcação aparece — ausência é ausência, nunca "sem ocorrência".

## Requisitos funcionais

- **RF1** A linha da nota ganha marcador quando `openOccurrenceCase` é verdadeiro.
- **RF2** A parada ganha marcador quando `hasOpenOccurrence` é verdadeiro, com a contagem de notas
  atingidas.
- **RF3** O marcador é clicável e abre o diálogo de ocorrência da nota.
- **RF4** Campo ausente (API anterior) não desenha marcador e não assume falso visualmente — a
  distinção entre "não tem" e "não sei" fica no código, e a tela simplesmente não marca.
- **RF5** O marcador usa o ícone de alerta do design system e o tom `--color-alert`, o mesmo
  vocabulário visual do resto do produto.
- **RF6** Um resumo no cabeçalho diz quantas notas da viagem têm ocorrência aberta (casa com a
  spec 170, que leva o estado para o cabeçalho).
- **RF7** Textos em pt-BR; en onde a seção já existir.

## Requisitos não funcionais

- Só frontend: nenhum campo novo, nenhuma chamada nova.
- Contraste conferido no estado normal e no selecionado (linha marcada em tabela com zebra).

## Casos extremos e falhas

- **Todas as notas com ocorrência**: o resumo diz o total, e não vira parede de ícone.
- **Parada com uma nota marcada entre dez**: a parada marca, e a contagem diz uma.
- **Ocorrência encerrada**: sem marcador — o campo já vem falso da API.

## Critérios de aceite

- **CA01** Nota com tratativa aberta aparece marcada.
- **CA02** Parada com nota marcada aparece marcada, com a contagem.
- **CA03** Clicar no marcador abre o diálogo daquela nota.
- **CA04** Resposta sem os campos não desenha marcador nenhum.
- **CA05** Resumo no cabeçalho bate com a contagem das notas marcadas.
- **CA06** Revisão de design com print (web.md §15).

## Dúvidas

Nenhuma.
