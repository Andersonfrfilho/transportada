# Feature 171 — A linha do tempo começa quando a viagem nasce

## Problema e resultado

A linha do tempo da viagem mostra oito tipos de evento — despacho, troca de status, chegada em
parada, entrega, devolução, ocorrência de parada, ocorrência de nota e troca de status de nota — e
**não mostra o nascimento da viagem**. Numa viagem recém-criada com uma ocorrência, o primeiro item
da lista é a ocorrência: a história começa no meio.

Quem abre a linha do tempo para auditar não vê quando a viagem foi criada nem por quem, e a tela
cujo propósito é "o que aconteceu com esta viagem" omite o primeiro fato dela.

Resultado: a linha do tempo abre com a criação da viagem, e as entradas entram com animação curta —
hoje a lista troca de conteúdo sem nada indicar que ela mudou.

## Fora do escopo

- Eventos de outras entidades (nota importada, veículo trocado na frota).
- Reescrever a história de viagens antigas que não têm o registro: elas continuam começando no
  primeiro evento que existir.

## Histórias priorizadas

### P1 — A história começa no começo

**Given** uma viagem criada hoje
**When** alguém abre a linha do tempo
**Then** o item mais antigo é a criação da viagem, com quem criou, quando e por qual canal.

### P2 — A lista mostra que mudou

**Given** a linha do tempo aberta
**When** um evento novo entra (recarga, "tentar de novo", ou paginação)
**Then** as entradas novas aparecem com uma animação curta de entrada, em vez de trocar o conteúdo
sem aviso.

### P3 — Viagem antiga não mente

**Given** uma viagem criada antes desta spec
**When** alguém abre a linha do tempo
**Then** ela começa no primeiro evento registrado, sem inventar uma criação que ninguém gravou.

## Requisitos funcionais

- **RF1** A criação da viagem grava evento de estado, com ator, canal e instante — o mesmo caminho
  das demais transições, para a linha do tempo não precisar de fonte especial.
- **RF2** O tipo `trip.created` entra no vocabulário da linha do tempo, com prioridade de desempate
  **menor** que qualquer outro do mesmo instante: nascer vem antes de tudo o que veio depois.
- **RF3** A tela nomeia o evento com o vocabulário da operação ("Viagem criada"), com o autor.
- **RF4** Migration **não** inventa evento para viagem existente (RF da P3).
- **RF5** As entradas da lista entram com animação curta, respeitando `prefers-reduced-motion` —
  quem pediu menos movimento não recebe movimento.
- **RF6** Textos em pt-BR; en onde a seção já existir.

## Requisitos não funcionais

- Sem custo novo por item: a animação é CSS, não biblioteca.
- A ordenação continua por instante com desempate por prioridade e id, como a spec 158 definiu.
- O evento de criação respeita o mesmo escopo por empresa.

## Casos extremos e falhas

- **Viagem criada por semeadura ou importação** (sem ator humano): o evento grava o canal e deixa o
  ator nulo, e a tela diz "pelo sistema" em vez de inventar nome.
- **Criação e primeira transição no mesmo instante**: a prioridade resolve, e o nascimento aparece
  por último na lista decrescente — que é o começo da história.
- **Lista longa com paginação**: a animação vale para o que entra, não para o que já estava.

## Critérios de aceite

- **CA01** Viagem criada grava o evento com ator, canal e instante.
- **CA02** A linha do tempo mostra "Viagem criada" como o item mais antigo.
- **CA03** Viagem anterior à spec não ganha evento nenhum.
- **CA04** Empate de instante põe a criação abaixo dos demais (mais antiga).
- **CA05** As entradas novas animam; com `prefers-reduced-motion` não animam.
- **CA06** Revisão de design com print (web.md §15).

## Dúvidas

Nenhuma.
