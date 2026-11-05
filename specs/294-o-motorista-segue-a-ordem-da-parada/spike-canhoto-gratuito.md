# Spike T4.8b — reconhecer o canhoto e ler o número da NF só com opções gratuitas e locais

> Data: 05/11/2026 · Modelo: `opus` · Protótipo: `spike-canhoto-gratuito/` (descartável, fora das apps)
> Continua a T4.8a (`spike-canhoto.md`). Decisão do dono em 05/11/2026: **nada de API paga nem serviço externo; a foto
> não sai das nossas máquinas.** Tudo abaixo rodou nesta máquina, em CPU, com runtime que cabe no worker (Bun, Alpine).

## Pergunta

1. A foto é um canhoto (RF23)? 2. De qual nota é? — a métrica que importa é a segunda: o bot só precisa casar a foto
   com as **notas da viagem de quem mandou** (conjunto pequeno), não ler um número qualquer.

## Amostra

160 imagens, citadas só por índice opaco. Nenhum texto reconhecido nem número de nota foi impresso ou guardado no
repositório; o gabarito (número da nota anexada e das notas da viagem) ficou só no rascunho e foi comparado por
igualdade. Pasta de rascunho apagada ao fim (fotos, gabarito, vetores, modelos baixados, venv).

| Origem                                                                                  | Rótulo                           | Qtd | Entra nas métricas |
| --------------------------------------------------------------------------------------- | -------------------------------- | --- | ------------------ |
| produção, `photo` `approved` (ordem `md5(id)`)                                          | canhoto (veredito do escritório) | 110 | positivo           |
| produção, `photo` `rejected` (a única que existe)                                       | sem rótulo confiável             | 1   | não                |
| staging, fotos de comprovante + anexos de ocorrência                                    | outra coisa (olhadas)            | 29  | negativo           |
| sintéticas: 10 "corpo de DANFE" sem canhoto + 10 papéis quaisquer (SVG, giro, desfoque) | outra coisa                      | 20  | negativo (difícil) |

- Fotos de produção **não foram abertas para olhar**; staging foi olhada numa prancha de miniaturas (chão, cabos,
  telas, planta, cachorro e 3 papéis preenchidos à mão — nenhum canhoto).
- Notas candidatas por foto: as da mesma viagem (mediana 8, máx. 13) e as da mesma parada (mediana 1, máx. 3).
- **Classes que continuam faltando:** foto da folha inteira da DANFE de verdade, foto de mercadoria/caixa, canhoto em
  branco. Os negativos reais são fáceis; os sintéticos são texto limpo renderizado, não foto.

## Resultados

Mesma regra de marcas da T4.8a (5 grupos, busca aproximada) sobre o texto de A e de C. "Casou" = os dígitos lidos
casam com **uma única** nota candidata: exato primeiro; senão distância de edição 1 para números de 5+ dígitos.

| Opção                                                                     | É canhoto (110 pos / 49 neg)                                                     | NF lida perto de "Nº/SÉRIE" = nota anexada | **Casou com a nota certa entre as da viagem**                      | Erro de nota | p50 / p95 por foto                         | Memória (RSS pico) | Peso                                       | Licença                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------ | ------------------------------------------ | ------------------ | ------------------------------------------ | ------------------------------------------------- |
| **A** PP-OCRv4 det+rec, `onnxruntime-web` WASM, 1 thread                  | marcas ≥ 2: **39/110, 0 FP**; marcas ≥ 2 **ou** casou nota: **100/110, 0/49 FP** | 52/110                                     | **99/110 (90%)** — 95 exato, 5 aprox.; 3 ambíguos, 7 sem casamento | **1/110**    | 1,8 s / 4,7 s (máx. 6,1 s)                 | 741 MB             | runtime 11,9 MB + det 4,7 MB + rec 10,9 MB | Apache-2.0 (modelos PaddleOCR), MIT (onnxruntime) |
| **B** MobileNetV3-Large congelada + sonda linear (validação cruzada 5×10) | limiar 0,5: **110/110, 0/49 FP**; limiar 0,9: 98/110                             | — (não lê)                                 | —                                                                  | —            | 27 ms / 31 ms por visão (4 giros ≈ 110 ms) | 311 MB             | 21,9 MB fp32 + 1281 números                | Apache-2.0 (timm; pesos de ImageNet-1k)           |
| **C** Florence-2-base-ft q8, `<OCR>`, transformers.js                     | subamostra 27 pos / 12 neg: marcas ≥ 2: **0/27**; com casamento: 3/27, 0/12 FP   | 0/27                                       | **3/27 (11%)** — A na mesma subamostra: 24/27                      | 0/27         | 5,7 s / 17,5 s (máx. 18,7 s), 2 giros      | ~2 GB              | 265 MB                                     | MIT (modelo), Apache-2.0 (transformers.js)        |

C rodou numa subamostra (40 imagens, 1 a cada 4 da amostra ordenada) porque leva 5–18 s por foto; a 1ª carga baixou o modelo (70 s), as seguintes ~1 s.

### A — leitura

- **Os dígitos da nota certa aparecem no texto de 95/110 canhotos** (86%), mesmo quando as marcas não aparecem:
  o número é a parte mais legível do canhoto (impresso grande, ao lado de "Nº"/"SÉRIE").
- Casar com as notas da **parada** em vez da viagem dá 101/110 certos, 1 ambíguo, 1 errado — o conjunto menor
  ajuda pouco, porque com 8 notas o número de 6 dígitos quase nunca colide.
- O **1 "errado"** é casamento exato e único com **outra** nota da mesma viagem. Sem abrir a foto não dá para dizer se
  o canhoto foi anexado na nota errada (o escritório aprovou mesmo assim) ou se o canhoto cita duas notas; nas duas
  hipóteses, o bot perguntar "é a NF X?" antes de baixar resolve.
- **Casamento por acaso nos negativos: 0/49** (cada negativo recebeu as notas de uma viagem real para testar).
- Marcas sozinhas recuperam pouco (39/110 com ≥ 2; 61 positivos têm uma marca só, quase sempre "SÉRIE"), e "SÉRIE"
  aparece também no corpo da DANFE (6 dos 10 sintéticos com 1 marca). **Marca única nunca prova canhoto.**
- Pré-processamento que entrou: orientação pela forma das caixas (90°), inclinação pela mediana dos ângulos das
  caixas, 180° pela confiança do reconhecimento. Sem OpenCV: DB pós-processado por componentes conexos (retângulo
  alargado), o que basta para a faixa do canhoto. Média de 3 passadas por foto.
- **Alpine:** o mesmo código rodou em `oven/bun:1.3.14-alpine` (`sharp` 0.33.5 + `onnxruntime-web` 1.23.2, WASM) com o
  mesmo resultado nas imagens de teste. `onnxruntime-node` não serve (glibc).
- Contra a T4.8a (tesseract, 7/24 confirmados): o PaddleOCR lê muito melhor a foto torta de celular, e o número da
  nota resolve o que as marcas não resolvem.

### B — classificador

- Separação perfeita na amostra, mas **a amostra é fácil**: os negativos reais são chão, cabos e telas; os difíceis são
  sintéticos e "parecem renderizados". Os 3 papéis escritos à mão ficaram em 0,12–0,29 (abaixo do limiar, mas são os
  negativos mais altos). O classificador provavelmente aprendeu "foto de tira de papel impresso", **não** "canhoto e
  não corpo da DANFE". Sem foto da folha inteira e de mercadoria, não há como medir o que importa.
- Ajuste fino da rede inteira não foi tentado: com 110 positivos e 49 negativos ele só decoraria a amostra; a sonda
  linear é o máximo honesto. 110/49 é desequilibrado (pesos de classe balanceados).
- Custo de B no worker é baixo (≈ 110 ms, 22 MB), mas **não diz de qual nota é** — e é isso que o bot precisa.

### C — Florence-2

- Roda em CPU, mas **lê mal o canhoto**: a imagem entra reduzida a 768×768 e as letras miúdas da faixa somem; o
  número da nota certa apareceu no texto de 1/27 fotos (A: 24/27 na mesma subamostra). Nenhuma marca do canhoto lida.
- É lento (p50 5,7 s com dois giros, p95 17,5 s), usa ~2 GB de memória e pesa 265 MB em `q8`. O transformers.js usa
  `onnxruntime-node` (glibc) por padrão; no Alpine precisaria do backend WASM, não testado — e seria mais lento ainda.
- Recortar a faixa antes poderia ajudar, mas aí o recorte já depende de uma detecção de texto (o que A faz sozinho).

## Custos

Nenhum por foto (sem API). Custo é CPU do worker: A ≈ 2 s por foto numa thread (p95 ~5 s), dentro do tempo de uma
conversa; imagem do worker cresce ~28 MB (runtime WASM + dois modelos). Download único dos modelos no build
(ou versionados como os da ADR-0103), sem chamada externa em execução.

## Recomendação

1. **Adotar A no worker** (molde do `canhoto-read`: `worker_thread`, uma sessão carregada por processo, uma foto por
   vez) com a decisão abaixo — o número da nota é a prova principal, as marcas são a secundária:

   | Resultado da leitura                                                          | O bot faz                                                                                                                                                      |
   | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | dígitos casam **exatamente** com **uma** nota aberta da viagem de quem mandou | é canhoto dessa nota → segue o RF23 (entrega em preparo, pede localização); a foto vai `pending` para o escritório como hoje (222)                             |
   | casam só **aproximadamente** (distância 1) com uma nota                       | confirma antes: "Este canhoto é da NF 17234? _1_ - Sim / _2_ - Não, é de outra" (2 → pergunta de qual)                                                         |
   | casam com mais de uma nota, ou com nenhuma, e **marcas ≥ 2**                  | "De qual nota é este canhoto?" com as notas abertas numeradas                                                                                                  |
   | casam com nenhuma e marcas ≤ 1                                                | RF23: "Essa foto não parece um canhoto assinado. É foto da mercadoria? _1_ - Mercadoria / _2_ - É o canhoto / _3_ - Descartar"; o "2" leva a "De qual nota é?" |
   | casou com nota de **outra parada**                                            | RF25 (fora de ordem), nunca baixa calado                                                                                                                       |

   Medido: **90% dos canhotos reais baixam sem pergunta** (99/110), 3% pedem "de qual nota" por ambiguidade, 6% caem
   na pergunta do RF23/"de qual nota", e **0 negativo** casou por acaso. O 1 caso de nota divergente (0,9%) é o risco
   residual: por isso o casamento exato com nota de **outra parada** cai no RF25, e toda foto lida continua `pending`
   para o escritório.

2. **Limiares iniciais:** casamento exato único; aproximado só com 5+ dígitos e distância ≤ 1 (com confirmação);
   marcas ≥ 2 para dizer "é canhoto" sem número. Marca única nunca decide. Rotação: 0/90/180/270 dentro do OCR.
3. **B fica para depois, como pré-filtro opcional** "parece papel impresso?" — só depois de juntar negativos de
   verdade. As respostas do próprio bot fazem esse rótulo de graça: o "1 - Mercadoria" do RF23 vira foto de
   mercadoria rotulada; o "2 - É o canhoto" vira positivo difícil. Retreinar com isso, local, antes de ligar.
4. **C não entra:** lê 3/27 contra 24/27 de A, 3–4× mais lento, ~2 GB de memória e 265 MB de modelo. Fica descartado para o canhoto.
5. **Não guardar o texto reconhecido** em banco, log ou fila: só o veredito, a nota casada (id), o tipo de casamento,
   as marcas achadas e o tempo.
6. **Antes da T4.8:** um lote de staging com folha inteira da DANFE, caixa/mercadoria e canhoto em branco, para virar
   contrato do leitor (hoje não há como medir o falso positivo "corpo da DANFE").

Decisão registrada no ADR 0113 (§5).
