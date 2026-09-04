# Feature 080 — O detalhe da viagem se lê de uma vez

## Problema e resultado

A 079 pôs na tela o que faltava: paradas, prontidão fiscal, ocupação, prova de entrega. Em uso,
seis coisas não se sustentaram — e o padrão entre elas é o mesmo: **a tela anuncia informação que
não entrega**. O mapa tem título e nenhum mapa; a conta da viagem tem cabeçalho e nenhum valor; a
barra mostra porcentagem de estado em vez do andamento do processo; o motorista aparece só pelo
nome, e falar com ele exige abrir a frota.

O resultado é uma tela em que cada painel ou mostra o número, ou diz por que não tem.

## Fora do escopo

- **Plano de estiva.** O baú passa a ser desenhado com as caixas na **ordem de carregamento**, que
  é dado real. Onde cada caixa vai dentro do baú exige dimensão por volume, que a NF-e não traz —
  a nota da 079 T003 continua valendo e não é revogada aqui.
- **Fundo de mapa de terceiro.** Sem Google e sem tile externo (ver ADR desta spec).
- **Rastro do caminhão sobre o mapa.** `trip_locations` existe e tem as três guardas da ADR-0050
  §5; juntá-lo ao roteiro é spec própria.

## Histórias priorizadas

### P1 — o mapa mostra o caminho, não só o título

**Given** uma viagem com paradas cujos endereços foram geocodificados
**When** o operador abre o detalhe
**Then** ele vê os pinos na ordem do roteiro e **a trajetória pelas ruas** entre eles, e as paradas
sem coordenada aparecem nomeadas fora do mapa.

### P2 — quem dirige, e como falar com ele

**Given** uma viagem com motorista atribuído
**When** o operador abre o detalhe
**Then** ele vê nome, telefone e e-mail do motorista sem sair da tela.

### P3 — a conta da viagem mostra números

**Given** uma viagem aberta com frete calculado
**When** o operador abre a conta
**Then** ele vê o ganho previsto e o custo previsto, com a marca de que é previsão — e, sem
cálculo, a razão de não haver número.

### P4 — a carga se lê num painel só

**Given** uma viagem com notas vinculadas
**When** o operador olha a carga
**Then** ocupação, peso e o desenho do baú por ordem de carregamento estão juntos, com a origem
estimada dita uma vez.

### P5 — o andamento é processo, não porcentagem

**Given** uma viagem em qualquer estado
**When** o operador olha o andamento
**Then** ele vê as etapas do processo e onde a viagem está, com a transição animada.

### P6 — a linha da nota resolve a nota

**Given** uma nota sem CT-e numa viagem
**When** o operador olha a linha dela
**Then** a ação de emitir está ali, e a parada mostra o número do endereço.

## Requisitos funcionais

- **RF-1** Geocodificação de parada: o endereço da parada vira coordenada em `geocoded_addresses`,
  reaproveitada por chave de endereço entre viagens.
- **RF-2** Trajetória: a API devolve a geometria do percurso pelo OSRM já hospedado
  (`/route/v1/driving/...?overview=full&geometries=geojson`), guardada por viagem e invalidada
  quando a ordem das paradas muda.
- **RF-3** O motorista da viagem carrega telefone e e-mail, vindos de `fleet_drivers`.
- **RF-4** A conta da viagem exibe ganho e custo previstos, ou a razão da ausência.
- **RF-5** Ocupação, peso e mapa de carga num painel único.
- **RF-6** O andamento vira etapas de processo com transição animada.
- **RF-7** Ação de emitir CT-e na linha da nota; número do endereço no rótulo da parada.
- **RF-8** Todo botão de ação da viagem leva ícone (`web.md` §9).

## Requisitos não funcionais

- Nenhum destino externo novo no `connect-src`: o OSRM é interno, e a geocodificação usa provedor
  já declarado.
- O navegador não fala com o OSRM: a API busca e devolve pronta.
- Contraste e alvo de toque preservados; nada abaixo de `--control-height-compact`.
- Animação respeita `prefers-reduced-motion`.

## Casos extremos e falhas

- Parada sem coordenada: nomeada fora do mapa, nunca escondida.
- OSRM fora do ar: pinos e ordem continuam; a linha some com aviso, e a tela não quebra.
- Viagem sem frete calculado: a conta diz que não há cálculo, em vez de mostrar zero.
- Motorista sem telefone ou e-mail cadastrado: campo ausente, não traço solto.
- Nota já com CT-e: a ação de emitir não aparece na linha.

## Critérios de aceite

- **CA1** Trajetória desenhada entre paradas geocodificadas, na mesma projeção dos pinos.
- **CA2** Nenhuma chamada a terceiro nova no bundle (contrato de CSP segue verde).
- **CA3** Telefone e e-mail do motorista na tela, sem abrir a frota.
- **CA4** Ganho e custo previstos com marca de previsão, ou razão da ausência.
- **CA5** Um painel de carga, com a origem estimada dita uma vez só.
- **CA6** Etapas do processo com estado atual visível e transição animada.
- **CA7** Emitir CT-e na linha da nota; parada com número do endereço.
- **CA8** Todo botão de ação de viagem com ícone.

## Dúvidas

- **Geocodificação:** o endereço completo do destinatário sai para o provedor (Photon já em uso) ou
  paramos no CEP, que põe o pino na rua e não no número?
  `[NEEDS CLARIFICATION: precisão do pino versus dado que sai daqui]`
