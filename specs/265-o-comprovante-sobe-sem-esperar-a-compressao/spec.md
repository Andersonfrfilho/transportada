# Feature 265 — O comprovante sobe sem esperar a compressão

> Registrada em 2026-10-14, a partir do defeito P0 do motorista Duylen (comprovante preso em
> "enviando"). **Numeração.** Conferida em 2026-10-14 com `ls specs` e
> `git log --all -- 'specs/265*'`: a última é a 264. Esta é a **265**. Estado: **rascunho para
> aprovação** — nada implementado; as decisões abertas estão em "Dúvidas".

## Assunto já tratado em

- **212**: a redução no aparelho (2000 px, ~900 KiB, teto de 960 KiB) e `pendingReduction`. É o desenho
  que esta spec **substitui** para aparelho lento, sem apagar.
- **213 / 220 RF17-RF19**: a miniatura de 320 px que sobe junto com o original e nunca é condição para
  o comprovante existir.
- **222 / `worker-transportada/src/canhoto-read`**: o worker já lê o código de barras do canhoto e
  reporta à API pela rota do robô. Hoje lê a imagem **já reduzida**.
- **254**: diagnóstico do cliente (`photo_reduce`, `step_timing`, `send_failed`, `timeout`).
- **070 e 264**: precedentes do trilho "grava o objeto, outbox, worker processa":
  `aggregate-attachment.v1` e `conversation-audio-transcription`. Esta spec segue o mesmo molde.
- **PRs #206-#211 (hotfix de 14/10)**: estado de tela "reduzindo" com contagem, qualidade por faixa
  pelo tempo medido, log com modelo do aparelho. Ficam como ponte até esta spec chegar.

## Problema, medido

1. A API recusa o corpo acima de **1 MiB** (`APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES`, 413 antes da
   rota) e o arquivo do comprovante acima de **960 KiB** (`OFFICE_PROOF_MAX_BYTES`, 422). A foto da
   câmera tem 3 a 5 MB, então **o aparelho é obrigado a comprimir antes de enviar**.
2. Em aparelho fraco isso é caro: em produção (14/10) um Samsung SM-A125M levou **10,6 s** só na
   redução, e dez entregas em paralelo levaram 17 s cada. O motorista espera, ou vê "enviando" sem
   saber o que acontece, ou a foto estoura o teto de 20 s e sobe sem reduzir (e volta 413).
3. A compressão no aparelho também **piora a leitura do canhoto**: o worker decodifica o código de
   barras de uma imagem já degradada pelo JPEG em qualidade baixa.

## Resultado

O envio do comprovante deixa de depender de o aparelho comprimir bem. O aparelho **tenta** reduzir
dentro de um orçamento de tempo; se estoura, **sobe o original** por uma rota que aceita arquivo
maior; e o **worker** gera a versão leve, a miniatura e a leitura do código de barras a partir do
original. O motorista confirma e segue; o painel mostra "processando" até o worker terminar.

## Fora do escopo

- Mudar o teto global de 1 MiB das outras rotas (só a rota de upload do comprovante ganha teto maior).
- Recortar ou melhorar a foto no aparelho (ProofCrop segue como está).
- OCR no servidor (continua fora, como na 222).
- Remover a redução no aparelho: ela continua para aparelho rápido, pois economiza dados móveis.

## Histórias priorizadas

### P1 — Aparelho lento sobe o original e segue

**Given** um aparelho cuja redução passou do orçamento (padrão 8 s) **When** o motorista confirma o
comprovante **Then** o original sobe como está, a confirmação não espera, e o cartão mostra "enviando"
e depois "processando" até o worker terminar.

### P1 — O worker reduz e lê a partir do original

**Given** um comprovante recebido sem versão leve **When** o worker consome o evento **Then** ele grava
a versão reduzida (régua da 212), a miniatura (320 px) e a leitura do código de barras (222) a partir
do original, e o comprovante passa a "pronto".

### P2 — Aparelho rápido continua reduzindo

**Given** um aparelho que reduz em menos que o orçamento **When** o motorista confirma **Then** sobe a
versão leve com a miniatura, como hoje, e o worker só lê o código de barras.

### P2 — Falha do worker não perde a foto

**Given** o worker falha ao comprimir **When** esgotam as tentativas **Then** o original continua
guardado e visível no painel, marcado "sem versão leve", e o comprovante não fica preso.

## Requisitos funcionais

- **RF1** A rota de upload do comprovante do motorista (`POST .../documents/:documentId/proof`) aceita
  corpo até `PROOF_ORIGINAL_MAX_REQUEST_BYTES` (proposto: 12 MiB); as demais rotas mantêm 1 MiB.
- **RF2** O corpo é lido em fluxo com a leitura limitada pelo teto da rota; acima dele, 413 como hoje.
- **RF3** O cliente declara `variant = 'reduced' | 'original'`. O servidor **não confia**: confere o
  tamanho real e o tipo MIME pelo conteúdo.
- **RF4** `original` grava o objeto e um evento de outbox na **mesma transação**; `reduced` mantém o
  fluxo atual e o evento só pede a leitura do código de barras.
- **RF5** O worker (trilho novo, no molde da 264) baixa o original, reduz em `worker_thread` à régua da
  212, gera a miniatura da 213/220, substitui o objeto reduzido e dispara a leitura da 222 **sobre o
  original**.
- **RF6** Estado do comprovante: `received → processing → ready | processing_failed`. A API e o painel
  expõem o estado; `processing_failed` mantém o original acessível.
- **RF7** Idempotência: o evento carrega a chave do anexo; reprocessar não duplica objeto nem leitura.
- **RF8** O original é guardado por prazo configurável e depois apagado, mantendo só a versão leve
  (retenção em Dúvidas).
- **RF9** Aparelho: orçamento de tempo da redução (`PROOF_PHOTO_REDUCTION_BUDGET_MS`, padrão 8 s). Ao
  estourar, cancela a redução e envia o original; registra `send_failed`/`timeout` com modelo do
  aparelho (254).
- **RF10** A tela do motorista continua mostrando "reduzindo" com contagem (PR #210) e acrescenta
  "enviado, processando" quando o servidor devolve `received/processing`.
- **RF11** O estado `processing` não bloqueia o motorista nem a conclusão da entrega; a conferência
  manual do canhoto no painel espera `ready` (ou mostra o original com aviso).

## Requisitos não funcionais

- **RNF1** Segurança: `companyId` do contexto autenticado; o tipo e o tamanho do original validados no
  servidor; imagem decodificada em `worker_thread` com limite de memória e de pixels (anti
  decompression bomb).
- **RNF2** Nunca logar o conteúdo do arquivo nem o EXIF; o worker descarta EXIF/GPS ao reencodar, como
  o canvas faz hoje.
- **RNF3** Dados móveis: o original custa mais (3-5 MB). Só sobe quando a redução estourou o orçamento.
- **RNF4** Migration aditiva (colunas novas anuláveis); sem migration destrutiva.

## Casos extremos e falhas

- Original acima do teto da rota: 413 com a causa nomeada; a fila marca "recusada" e explica.
- Imagem corrompida ou formato não suportado (HEIC sem decodificador): `processing_failed`, original
  guardado, motorista não é bloqueado.
- Worker fora do ar: o evento fica no outbox; o painel mostra "processando" com idade; nenhum dado
  perdido.
- Dois uploads do mesmo anexo (reenvio da fila): a chave idempotente devolve o mesmo resultado.
- Aparelho sem `localStorage`: a faixa de qualidade volta ao padrão e mede de novo (PR #211).

## Critérios de aceite

- Contrato da API: `original` entre 1 MiB e o novo teto é aceito só na rota do comprovante; nas outras
  rotas segue 413; acima do novo teto, 413.
- Contrato do worker: original grande vira versão ≤ 960 KiB + miniatura + leitura do código de barras;
  falha deixa o original e `processing_failed`.
- Contrato do app: redução estourando o orçamento envia o original e registra o diagnóstico com modelo.
- Smoke: motorista confirma sem esperar; o painel mostra "processando" e depois a foto.

## Dúvidas

- [NEEDS CLARIFICATION: teto do original — 12 MiB cobre as câmeras atuais? Precisa de medida nas fotos
  reais da frota antes de fechar.]
- [NEEDS CLARIFICATION: retenção do original — 7 dias, 30 dias, ou guardar sempre? (custo de storage
  contra valor probatório do canhoto).]
- [NEEDS CLARIFICATION: o orçamento de 8 s é por foto ou o aparelho decide pela média das últimas
  (como as faixas do PR #211)? Proposta: orçamento fixo, faixas só escolhem a qualidade.]
- [NEEDS CLARIFICATION: o painel pode mostrar "processando" na conferência do canhoto, ou o operador
  espera `ready`? Proposta: espera, com o original visível.]
