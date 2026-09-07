# Feature 094 — Onde cada caixa cabe

## Problema e resultado

A planta da spec 088 desenha o baú em escala e divide as **faixas** por parada: "desta marca até
aquela é a carga da parada 3". Ela não diz onde cada caixa vai, e a 085 recusou dizer por um motivo
que era verdadeiro na época — a NF-e não traz dimensão de volume, e sem medida qualquer posição é
palpite com cara de instrução.

⚠️ **A 085 mudou essa premissa e o produto não colheu.** `nfe_package_boxes` guarda a medida da caixa
por `(emitente, produto, unidade)`, e o conferente a preenche pela aba Caixas. Onde a caixa está
medida, a posição **é calculável** — e continua não desenhada.

Ao fim: quem carrega vê, camada por camada, um arranjo que cabe nas medidas do baú e respeita a ordem
de entrega.

## O que a tela promete, e o que não promete

**Promete:** este arranjo **cabe**. As caixas desta viagem entram no baú nesta disposição, e a carga
da última parada fica no fundo.

**Não promete** que este é o arranjo certo. Faltam três coisas para isso, e nenhuma existe no modelo:

- **Empilhabilidade e fragilidade** — nada impede a planta de pôr a caixa de ovos embaixo da de
  detergente.
- **Peso por caixa** — existe a coluna, preenchida em **1** das 6 caixas medidas. Sem ela não há
  distribuição de peso.
- **Peso por eixo** — não existe, e é o que gera multa na balança.

A tela diz isso em uma linha, sempre visível. Um desenho que promete estiva sem esses dados é o
defeito que a 085 evitou, com outra roupa.

## Fora do escopo

- **3D.** A planta é vista de cima, camada por camada — é como se carrega e como se confere com fita.
  Isométrico esconde o que está atrás e é ilegível no celular do separador, que é quem usa isto.
- **Reordenar a carga arrastando.** A posição é calculada; corrigir à mão é outra spec, e exige
  guardar o arranjo escolhido.
- **Empacotamento ótimo.** É NP-difícil, e a diferença entre a heurística de camadas e o ótimo não
  paga o tempo de resposta numa tela de montagem.

## Histórias priorizadas

### P1 — A camada mostra onde a caixa entra

**Given** uma viagem cujas notas têm caixa medida
**When** o operador abre a planta do baú
**Then** cada camada é desenhada em escala, com as caixas na posição calculada, agrupadas por parada
e coloridas pela mesma paleta das faixas
**And** a ordem é a de carregamento: a última parada da rota ocupa o fundo.

### P2 — Sem medida, a caixa presumida entra no lugar

**Given** uma nota cujo produto não tem caixa medida
**When** a planta é calculada
**Then** entra uma **caixa presumida**, derivada do volume estimado do item e da proporção da caixa
mediana da empresa
**And** ela é desenhada com marca visível de presumida — hachura, não cor cheia —, e a camada inteira
que a contém carrega a marca
**And** o texto diz quantas caixas do desenho são presumidas.

### P3 — A marca de origem sobrevive à soma

**Given** uma camada com caixas medidas e presumidas
**When** a tela resume a viagem
**Then** vale a **pior** origem, como no volume e no peso: uma caixa presumida torna presumido o
arranjo todo — quem carrega decide pelo pior caso.

### P4 — Caixa que não cabe é dita, não escondida

**Given** uma caixa mais larga que o baú, ou carga que estoura a última camada
**When** a planta é calculada
**Then** ela sai da planta e é **nomeada** abaixo dela, com a medida que a impede
**And** o desenho não a encolhe para caber.

## Requisitos funcionais

- **RF1** `resolveCargoPlan` (domínio puro, API) recebe as caixas por parada, as dimensões do baú e a
  ordem de entrega, e devolve camadas com `{boxes: [{x, y, widthM, depthM, heightM, stopSequence,
source}], heightM, source}`.
- **RF2** O empacotamento é por **camada**: enche o piso (comprimento × largura) numa varredura em
  fileiras, sobe para a próxima quando não couber mais, e para quando a altura do baú acabar.
- **RF3** A caixa presumida sai de `resolveFallbackBox`: volume estimado do item ÷ quantidade, com a
  proporção da mediana das caixas **medidas da empresa** — e, sem nenhuma medida, da caixa de
  referência do catálogo.
- **RF4** A planta só existe com as **três** medidas do baú na ficha do veículo (regra da 088 D2).
  Sem elas, a tela continua mostrando as faixas proporcionais e o aviso que já existe.
- **RF5** A tela desenha **uma camada por vez**, com navegação entre elas, e diz quantas são.

## Requisitos não funcionais

- O cálculo é **puro e síncrono**, no mesmo `POST /trips/cargo-preview` que já monta a planta — sem
  rota nova e sem segunda consulta.
- Viagem de 300 notas não pode travar a tela: o empacotamento é linear no número de caixas, e há teto
  declarado de caixas desenhadas por camada.

## Casos extremos e falhas

- **Nenhuma caixa medida na empresa inteira** — a proporção vem do catálogo de referência, e a marca
  de presumido cobre tudo. É o estado de hoje: 6 de 663.
- **Nota sem cubagem nem caixa** — não entra na planta e é nomeada, como já acontece hoje.
- **Carga maior que o baú** — as camadas param no teto e o excedente é nomeado, com o volume que
  sobrou. Nunca comprimir para caber.
- **Uma parada só** — a planta continua valendo: ela mostra o arranjo, não a divisão por parada.
- **Caixa mais comprida que a largura do baú** — cabe deitada ou não cabe; o desenho tenta as duas
  orientações no plano e, falhando, nomeia.

## Critérios de aceite

1. Viagem com todas as caixas medidas desenha as camadas com posição, sem nenhuma marca de presumido.
2. Viagem sem nenhuma caixa medida desenha as camadas inteiras marcadas como presumidas.
3. Mistura das duas marca a camada e o resumo como presumidos.
4. Caixa que não cabe aparece nomeada abaixo da planta, com a medida que a impede.
5. Veículo sem as três medidas do baú não mostra planta nenhuma — o comportamento da 088 é mantido.
6. A linha que diz o que a planta **não** promete está sempre visível.
7. O tempo de cálculo de uma viagem de 300 notas não passa de 50 ms no teste de domínio.

## Dúvidas

Nenhuma aberta.
