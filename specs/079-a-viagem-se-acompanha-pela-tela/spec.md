# Feature 079 — A viagem se acompanha pela tela

## Problema e resultado

O detalhe da viagem hoje é uma **lista**: situação, paradas, notas e botões. Quem opera precisa
saber, olhando uma vez: **que caminhão é**, **quem dirige e como falar com ele**, **onde a carga
está**, **o que já foi entregue e com que prova**, e **quanto falta**. Hoje isso exige abrir a
frota, o rastreamento e cada nota — ou ligar para o motorista.

O resultado é uma tela em que a viagem se lê inteira, e a entrega concluída carrega a prova que a
sustenta.

⚠️ **O UUID do veículo já foi consertado** (spec anterior, `describeTripVehicle`): a linha mostra
placa, marca, modelo, ano e cor. Ele não faz parte desta spec.

## Fora do escopo

- **Reordenar paradas** — já existe, com arraste por `@dnd-kit` em `TripStopList`, escolhido por
  acessibilidade de teclado e pelo alvo de toque de 375px. Reimplementar é regressão.
- **Registrar ocorrência e comprovante** — o motorista já grava por `/me/current-trip/...`; esta
  spec **exibe**, não cria caminho de escrita.
- Alterar a política de peso (ver P6 e a dúvida sobre estimativa por item).

## Histórias priorizadas

### P1 — O caminhão e a carga se leem de longe

**Given** uma viagem com veículo e notas vinculadas
**When** o operador abre o detalhe
**Then** vê a identificação do veículo e **quanto do baú está ocupado**, com a origem do número
declarada quando ele for estimado.

### P2 — Quem dirige, e como falar com ele

**Given** uma viagem com motorista
**When** o operador abre o detalhe
**Then** vê nome e foto do motorista e um caminho de contato, **sem** que a tela exponha dado
pessoal que não sirva ao acompanhamento.

### P3 — Onde a carga está

**Given** uma viagem despachada, com motorista que consentiu com o rastro
**When** o operador abre o detalhe
**Then** vê o último ponto registrado e **quando** ele foi registrado.

**Given** motorista que **não** consentiu
**Then** a tela diz que não há rastro, e não insinua falha do sistema.

### P4 — O que já foi entregue e o que vem

**Given** uma viagem em curso
**When** o operador abre o detalhe
**Then** vê progresso em porcentagem, quais paradas foram atendidas, quais são as próximas na ordem
do roteiro, e uma previsão de término.

### P5 — A entrega concluída carrega a prova

**Given** uma nota marcada como entregue com comprovante
**When** o operador abre aquela entrega
**Then** vê a prova (foto e assinatura, quando houver), o horário real, a ocorrência registrada se
houver, e os dados que identificam a entrega: número da nota, cliente, endereço e CEP.

### P6 — O peso deixa de ser chute quando os itens dizem

**Given** uma nota sem peso declarado, mas com itens
**When** a carga é somada
**Then** o peso sai dos itens em vez do fator por volume, e a tela diz de onde ele veio.

## Requisitos funcionais

- **RF1** — O painel do veículo mostra ocupação com a **origem** do número (declarado × estimado).
- **RF2** — O painel do motorista mostra nome, foto e contato.
- **RF3** — O último ponto é exibido com data e hora, e **só** com consentimento vigente.
- **RF4** — O progresso é derivado do estado das notas, nunca digitado.
- **RF5** — Cada entrega concluída expõe comprovante, ocorrência e identificação da nota.
- **RF6** — A previsão de término declara que é estimativa e de onde saiu.

## Requisitos não funcionais

- **RNF1** — Nenhum número derivado aparece sem dizer que é derivado. É a regra que a tela de
  roteiro já cumpre e que esta herda.
- **RNF2** — A tela abre em 375px sem rolagem horizontal, e é operada com uma mão.
- **RNF3** — Nenhum dado pessoal do motorista chega ao bundle além do necessário às histórias.
- **RNF4** — Nenhuma origem externa nova: mapa e animação são desenho nosso, como o mapa de zonas.

## Casos extremos e falhas

| caso                        | comportamento                                            |
| --------------------------- | -------------------------------------------------------- |
| veículo removido da frota   | cai no identificador, com rótulo dizendo que é isso      |
| motorista sem foto          | iniciais, como o cabeçalho já faz                        |
| sem consentimento de rastro | "sem rastro" explícito — nunca mapa vazio sem explicação |
| viagem em `draft`           | sem progresso e sem previsão: não há o que acompanhar    |
| entrega sem comprovante     | "sem comprovante" — não confundir com "não entregue"     |
| nota sem itens e sem peso   | mantém a estimativa por volume, marcada como estimada    |

## Critérios de aceite

- **CA1** — Nenhuma tela desta spec imprime UUID como identificação.
- **CA2** — Todo número estimado tem marca de estimado ao lado, com a origem.
- **CA3** — Ausência de consentimento e ausência de rastro produzem a **mesma** tela.
- **CA4** — 375px sem rolagem horizontal, verificado no smoke.
- **CA5** — Nenhum campo do motorista sob a ADR-0039 aparece sem a ADR estar executada.

## Dúvidas

**[NEEDS CLARIFICATION: idade, telefone e e-mail do motorista na tela]**
A **ADR-0039** decidiu criptografar `birth_date`, telefone e endereço do motorista, e o `CLAUDE.md`
registra que a decisão foi barata **porque não há leitor**. Esta tela cria o leitor. Três saídas, e a
escolha é de quem responde pelo produto:

1. executar a ADR-0039 antes (envelope A256GCM, AAD por motorista) e então exibir;
2. exibir só o que já está em claro por decisão registrada — `name` e `tax_id` —, e contatar por
   caminho que não expõe o número (ver a dúvida seguinte);
3. adiar P2 inteira.

Idade é derivada de `birth_date`: **não existe** exibir idade sem ler o campo criptografado.

**[NEEDS CLARIFICATION: o que "botão de contato para o cliente" significa]**
Pode ser (a) contatar o **destinatário** da nota, (b) contatar o **motorista**, ou (c) o contratante
pelo portal. Os três têm dono e dado diferentes — e o telefone do destinatário vem da NF-e, que é
dado de terceiro, não da transportadora.

**[NEEDS CLARIFICATION: o rastro do motorista para o operador]**
A ADR-0050 §5 desenhou o rastro para o **contratante**, com a garantia de que ele vê coordenada e
nunca quem dirige. Mostrar ao operador é outra relação: o consentimento atual cobre isso, ou precisa
de consentimento próprio?

**[NEEDS CLARIFICATION: peso por itens]**
A **ADR-0052** escolheu estimar por **volume** de propósito, para a soma continuar coerente com o
`qVol` de `composeCargoQuantities`. Estimar por item muda essa política e precisa decidir: o que
fazer quando só parte dos itens tem peso, e o que prevalece quando item e volume discordam.

**[NEEDS CLARIFICATION: mapa]**
Não há biblioteca de mapa no painel — o mapa de zonas e o do portal são SVG nosso. Um mapa de rota
com pontos entregues e próximos é trabalho de desenho, não de integração. Vale o custo agora, ou a
lista ordenada basta para esta spec?

**[NEEDS CLARIFICATION: animação do veículo]**
"SVG animado do que o veículo é, em movimento" é enfeite ou informação? Se for informação, o que ela
diz que a barra de ocupação já não diz?

⚠️ **Nada aqui se implementa com dúvida aberta** — é regra do repositório, e cinco das seis histórias
dependem de pelo menos uma delas.
