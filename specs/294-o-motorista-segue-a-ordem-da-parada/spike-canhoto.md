# Spike T4.8a — reconhecer o canhoto na foto

> Data: 05/11/2026 · Modelo: `opus` · Protótipo: `spike-canhoto/canhoto-classifier.spike.ts` (descartável, fora das apps)

## Pergunta

Antes de dar baixa por foto (RF23, RF27), saber se a imagem é o **canhoto assinado** (parte destacável: "Recebemos
de…", "Data de recebimento", "Identificação e assinatura do recebedor", NF-e/Série) e não o corpo da DANFE, a
mercadoria ou outra coisa. Comparar (A) OCR local no worker e (B) modelo de visão (`claude-haiku-5-5`).

## Amostra

60 imagens, citadas só por índice opaco; nenhum texto reconhecido foi impresso nem guardado. Pasta de rascunho
apagada ao fim.

| Origem                                   | Rótulo usado                                                                       | Qtd   | Entra nas métricas |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ----- | ------------------ |
| produção, `photo` `approved`             | canhoto (o escritório aprovou)                                                     | 24    | positivo           |
| staging, `photo` (todas)                 | outra coisa — fotos de teste: chão, cabos, tela, conversa, cartão preenchido à mão | 23    | negativo           |
| staging, anexos de ocorrência            | outra coisa (mesma natureza)                                                       | 9     | negativo           |
| produção, `photo` `pending` / `rejected` | sem rótulo (não abertas)                                                           | 3 / 1 | não                |

- **Staging não tem nenhum canhoto real.** Os 32 negativos foram rotulados olhando as imagens (só staging).
  As fotos de produção **não foram vistas** nem enviadas a serviço externo; o rótulo é o veredito do escritório.
- **Classes ausentes:** `cargo` não existe em nenhum ambiente (0 linhas `kind = 'cargo'`), e não há foto só do
  corpo da DANFE identificada. O negativo mais difícil da amostra é papel preenchido à mão (3 fotos).

## Resultados

### A — OCR local (tesseract.js 5.1.1 + `por` 4.0.0_best_int, sharp, uma worker)

Regra: marcas do canhoto em 5 grupos (`RECEBEMOS DE`, `DATA DE RECEBIMENTO`, `ASSINATURA DO RECEBEDOR`/`IDENTIFICACAO
E ASSINATURA`, `PRODUTOS CONSTANTES`, `SERIE`), texto sem acento, busca aproximada com distância ≤ ⌊tamanho/6⌋.
Rotação tentada (0°, 90°, 270°, 180°) até achar marcas suficientes. **≥ 2 grupos → canhoto; 1 → incerto; 0 → outra.**

| Configuração                                          | Canhoto (VP) | Incerto | Outra (FN) | Falso positivo nos 32 negativos | Tempo p50 / p95 / máx  |
| ----------------------------------------------------- | ------------ | ------- | ---------- | ------------------------------- | ---------------------- |
| A1: 1600 px, segmentação automática, para em 2 marcas | 5/24         | 8/24    | 11/24      | 0/32                            | 2,1 s / 9,2 s / 26,8 s |
| A2: 2400 px, `PSM 11` (texto esparso), para em 3      | **7/24**     | 8/24    | 9/24       | **0/32**                        | 3,5 s / 8,0 s / 24 s   |

- **Precisão 100%** (7/7) e **recall 29%** quando só "canhoto" baixa; contando "incerto" como canhoto, recall 63% —
  mas aí a regra de "incerto" passa a valer para os 3 papéis à mão sem ter sido medida contra DANFE de verdade.
- O mesmo arquivo muda de classe entre A1 e A2 (ex.: 1 marca ↔ 4 marcas): o OCR de foto de celular inclinada
  é instável; o limiar não deve ser afinado com essa amostra.
- Medido nesta máquina (24 núcleos, uma worker do tesseract, carga da worker 140 ms). Peso: `tesseract.js` 1,7 MB +
  `tesseract.js-core` 30 MB (variantes wasm; carrega uma) + `por` 1,3 MB gz. O worker já tem `sharp` e `@zxing`.

### Código de barras como pista

Em **0 de 28** fotos de produção o Code128 de 44 dígitos foi lido, e **nenhuma** das 383 fotos `photo` de produção
tem `canhoto_read_source` preenchido. O canhoto destacado não traz o código (ele fica no corpo da DANFE), então:
(1) barcode presente indica corpo da DANFE, não canhoto; (2) a leitura da 222 (`readNumber`/`readDocumentId`) quase
nunca vai casar a foto com a nota no fluxo do RF23 — o caminho real hoje é "De qual nota é este canhoto?".

### Assinatura

Tinta no campo abaixo/ao lado do rótulo "ASSINATURA", sem linhas impressas nem caixas de texto: nos canhotos
achados (todos aprovados, presumidamente assinados) a razão variou de **0,0013 a 0,12**. Um limiar de 0,012 chamaria
2 de 6 de "sem assinatura". Sem nenhum canhoto em branco na amostra para medir o outro lado, **não é confiável**:
a foto não deve ser recusada por "sem assinatura"; a conferência do escritório (`pending`, 222) continua dona disso.

### B — modelo de visão (`claude-haiku-5-5`)

**Não executado:** `ANTHROPIC_API_KEY` ausente no ambiente. E, pela regra do spike, foto de produção não sai para
serviço externo; staging não tem canhoto real para medir acerto. Estimativa por preço (tabela de 06/10/2026):

| Item           | Valor                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Entrada        | imagem reduzida (lado maior ≤ 1568 px) ≈ 1.600 tokens + prompt ≈ 150 → ~1.750 tokens × US$ 0,10/MTok |
| Saída          | JSON `{kind, signed}` ≈ 40 tokens × US$ 0,50/MTok (thinking desligado, esforço `low`)                |
| Custo por foto | **≈ US$ 0,0002** (1.000 fotos ≈ US$ 0,20); só nas fotos que A não confirmou, ~70% disso              |
| Latência       | não medida; esperado 1–3 s por chamada                                                               |
| Acerto         | **não medido**                                                                                       |

Bloqueio que não é técnico: o canhoto traz nome, documento e assinatura do recebedor. Mandá-lo a um provedor
externo é tratamento de dado pessoal por terceiro (LGPD arts. 6º e 46) e precisa de decisão do dono antes de ligar.

## Modos de falha observados

1. Canhoto fotografado de lado (90°/270°) — resolvido tentando as rotações; custa até 4 passadas (p95 ~8 s).
2. Foto inclinada, borrada ou com sombra — OCR acha 0–1 marca num canhoto aprovado (9 de 24 em A2).
3. Canhoto recortado estreito (proporção 4:1 a 8:1) é o caso bom; foto da folha inteira (3:4) é onde mais erra.
4. Papel preenchido à mão (cartão, formulário) — 0 falso positivo na amostra, mas são só 3 exemplos.
5. Barcode nunca aparece no canhoto destacado — não serve para provar que é canhoto nem para achar a nota.

## Recomendação

1. **Adotar A2 agora**, rodando num `worker_thread` (mesmo molde do `canhoto-read`), e responder ao bot quando
   terminar (3–8 s cabem numa conversa). Regra: **≥ 2 grupos de marcas → é canhoto**; qualquer outra coisa
   (incerto, outra, corpo da DANFE com barcode) → o bot pergunta (RF23):
   "Essa foto não parece um canhoto assinado. É foto da mercadoria? _1_ - Mercadoria / _2_ - É o canhoto /
   _3_ - Descartar". O "2" vale e a foto vai `pending` para o escritório. Nunca recusar por "sem assinatura".
2. **Esperar a pergunta em ~70% dos canhotos reais** com A sozinho. Isso é atrito, não erro: nenhum caso baixa por
   palpite. Para reduzir, em ordem de custo:
   - ler pelo OCR o **número/série da NF impressos no canhoto** e casar com as notas abertas da viagem (o barcode
     não está lá); número que casa vira a terceira prova de que é canhoto e resolve o "De qual nota é?";
   - **B como segunda etapa, só no que A não confirmou**, atrás de interruptor desligado, depois de (a) decisão do
     dono sobre LGPD/provedor e (b) medir acerto em staging com canhotos de teste impressos (≤ 15 fotos, critério de
     aceite: ≥ 90% de acerto em `kind` e 0 falso "canhoto" nas negativas).
3. **Não guardar o texto reconhecido** em banco nem em log: só o veredito, os grupos de marcas achados e o tempo.
4. **Antes da T4.8**: montar em staging um lote de teste com canhoto destacado assinado e em branco, folha inteira da
   DANFE e foto de caixa, para virar o contrato do classificador (hoje a amostra não tem essas três classes).

Decisão a registrar no ADR 0113 (ou ADR novo) junto da T4.8: A2 como porta de entrada; B pendente da decisão de LGPD.
