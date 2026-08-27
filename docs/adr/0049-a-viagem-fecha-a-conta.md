# ADR-0049 — A viagem fecha a conta, e cada parcela diz de onde veio

- **Status:** aceito
- **Data:** 2026-08-27
- **Contexto:** spec 061. Emenda o que a 065 D7 estabeleceu para a avaliação **prevista** da viagem.

## Contexto

Quando os CT-e de uma viagem estão autorizados, o sistema **já sabe quanto ela faturou** —
`cte_batch_item_charges` guarda cada componente em `numeric(19,4)`. E já sabe quase todo o custo: a
tabela de região tem o valor do agregado por classe de veículo, o veículo tem consumo e outros custos
por quilômetro, e a empresa tem preço de combustível.

O que ninguém consegue é fazer a subtração. O resultado é reconstruído em planilha, dias depois, por
alguém que abre três telas — e por isso quase nunca é feito. A operação sabe o que faturou no mês e
não sabe **qual viagem deu lucro**, que é a pergunta que muda a decisão de amanhã.

## Decisão

### 1. Receita é o CT-e autorizado, e nada mais

Só o documento autorizado é fato: ele tem chave, foi emitido, e é o que será cobrado. Somar previsão
produz um relatório que discorda do financeiro — e relatório que discorda do financeiro é ignorado, o
que é pior do que não existir.

Viagem com CT-e faltando **não tem receita parcial estimada**: ela tem receita incompleta e declarada
como tal, com a contagem do que falta. A consulta que responde isso já existe desde a 059.

Isto **não contradiz** a avaliação prevista da 065 D7: lá o caminhão sai antes de qualquer emissão, e
a viagem é avaliada pelos parâmetros que gerariam o CT-e, marcada como `estimated`. Aqui é o
resultado, e ele só conta o que virou documento.

### 2. Nenhuma parcela ausente vira zero silencioso

Cada parcela de custo carrega `source`. Uma margem de 18% que na verdade é "18% se o combustível
estiver certo, e ele foi estimado" leva a decisão errada com mais confiança do que nenhum número
levaria.

As origens são quatro, e a quarta é nova nesta ADR:

- **`measured`** — saiu de um fato registrado (o CT-e autorizado, a taxa lançada, o roteiro aceito);
- **`estimated`** — saiu de cadastro aplicado a uma premissa (consumo × distância aproximada);
- **`missing`** — não há de onde tirar, e o número **não é zero**: é desconhecido;
- **`period`** — o custo existe, é conhecido, e **não é da viagem**. É o salário do motorista fixo.

### 3. Dois modelos de pagamento convivem, e o cadastro do motorista diz qual

O **agregado** é pago por rota: a tabela de região cruza a zona da parada com a classe do veículo que
puxou a carga. Desde a spec 038 o veículo declara `vehicle_type`, e a classe sai dele — o que fecha a
lacuna `NO_DRIVER_RATE` que a valoração prevista carregava.

O **motorista da casa** tem valor fixo por quinzena, com dia de fechamento. E aqui está a decisão que
evita um número bonito e errado: **o salário não é rateado por viagem.**

Ratear exigiria saber quantas viagens o período terá, o que só se sabe no fim dele — e o resultado é
congelado no fechamento da viagem. O rateio nasceria errado e envelheceria pior. A parcela sai com
`source: 'period'` e valor zero, dizendo por extenso que o custo existe e não é dela; quem subtrai a
folha é a visão por período.

### 4. O imposto desce da receita, e as duas parcelas não vêm do mesmo lugar

A margem é **depois do imposto sobre o frete**.

- **ICMS** é do documento: foi calculado na emissão a partir do perfil e viajou no XML, então sai do
  **payload congelado** do CT-e autorizado. Recalcular do cadastro atual daria um número que discorda
  do documento no dia em que alguém mudar a alíquota do perfil.
- **PIS/COFINS** não existe no CT-e — é tributo federal sobre a receita, e a alíquota depende do
  regime da empresa. Vem de configuração, e **sem configuração é `missing`**: a margem aparece
  marcada como "sem os federais", nunca com eles zerados em silêncio.

CST isento, não tributado ou diferido tem ICMS zero **de fato**: isso é `measured`. A diferença entre
"não paga" e "não sei" é a razão de a origem existir.

### 5. O resultado é congelado quando a viagem fecha

Preço de combustível muda, tabela de agregado muda, alíquota muda. Se o resultado fosse sempre
recalculado do cadastro atual, a viagem de março mudaria de margem em julho, e o histórico deixaria
de servir para comparar.

Viagem aberta calcula **ao vivo** (é previsão, e serve para decidir). Viagem `completed` congela, com
os valores **e as premissas** — o mesmo raciocínio do snapshot de roteiro (ADR-0043).

Recalcular um congelado é ação explícita, com motivo e trilha, preservando a versão anterior.
Acontece quando um CT-e é cancelado ou uma taxa entra atrasada, que é caso real — e é por isso que
precisa de rastro em vez de sobrescrita.

### 6. Dinheiro tem permissão própria, e ela é curta

`trip.financials` é de **`company-admin` e `finance`**, e de mais ninguém. Quem monta viagem já tem a
avaliação prevista (065 D7) para decidir aceitar carga, e ela não mostra o que se paga ao agregado.

O valor pago ao motorista é dado sensível **para o próprio motorista**, que tem `trip.read`: o painel
financeiro não existe no PWA, e a rota de resultado recusa `driver`, `aggregate`, `separator`,
`operator` e `fiscal` — com teste nomeando cada um.

## Consequências

- A viagem passa a responder "deu lucro?" sem planilha, e o acumulado responde "aquele caminhão se
  paga?" e "o Spani dá lucro?".
- Aparece uma configuração fiscal nova (regime federal da empresa). Sem ela o produto continua
  funcionando, com a margem marcada — o que é diferente de continuar funcionando errado.
- O cadastro do motorista ganha modelo de pagamento. Frota que hoje é toda de agregado não sente;
  frota mista passa a precisar declarar quem é quem.
- O custo de motorista fixo **não aparece na viagem**, e isso vai gerar a pergunta "cadê?". A resposta
  está na tela: `period`, com o caminho para a visão do período.

## Alternativas descartadas

| Alternativa                                  | Por que não                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Somar `freight_calculations` como receita     | É previsão; o relatório discordaria do financeiro e seria ignorado                     |
| Ratear o salário do motorista por viagem      | Só se sabe o divisor no fim do período, e o resultado congela antes disso              |
| Recalcular ICMS do perfil atual               | Discordaria do documento no dia em que a alíquota mudasse                              |
| Assumir PIS/COFINS pelo regime "mais comum"   | Erra em silêncio para metade das instalações, e o erro tem cara de número certo        |
| Recalcular o resultado sempre que alguém abre | A viagem de março mudaria de margem em julho                                           |
| Tabela de agregação mantida em paralelo       | Dessincroniza. Consulta sobre os congelados, e materializa-se depois com número na mão |
| `trip.financials` junto de `trip.manage`      | Quem separa carga passaria a ver o que se paga a cada agregado                         |
