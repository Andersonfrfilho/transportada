# Feature 194 — O canhoto se confere no aparelho

> Decisão do usuário (2026-09-25): "precisamos de verificação da foto do canhoto — hoje o importante é a
> foto do canhoto". ADR: [0078](../../docs/adr/0078-o-canhoto-se-confere-no-aparelho-e-so-avisa.md).
> Revisada depois da crítica (opus) de 2026-09-25: C1, M1–M7, menores e faltas.

## Problema e resultado

A app do motorista (`apps/frontend-driver`) aceita qualquer foto como comprovante. Foto tremida,
escura, estourada, sem o papel, cortada, de outra nota ou com o canhoto em branco só é descoberta no
escritório, dias depois, quando o motorista já não está no cliente para tirar outra.

**Resultado:** a foto é gravada na fila como hoje e, **logo depois**, no próprio aparelho, a app confere
três coisas e **avisa** no cartão da entrega — nunca bloqueia, nunca segura a foto em memória:

1. **Qualidade** (prioridade): sem papel, cortada, tremida, escura, sem contraste, estourada.
2. **Número da NF-e** lido no canhoto (OCR, ADR-0069), comparado com a nota do comprovante.
3. **Assinatura**: há tinta na região de recebimento do canhoto?

## Pré-requisito

- **O `attach` nunca descarta a foto.** Hoje `DriverStopCard.component.tsx:549-555` devolve cedo quando
  falta campo obrigatório, e a foto recortada some. O orquestrador abriu uma task própria, fora desta
  spec, para corrigir isso. **A fase 1 só começa com essa task em `origin/staging`** (T1.0 confere).
  Regra comum às specs 193, 194, 195 e 196: nenhum caminho de `attach` joga a foto fora.

## Specs do mesmo assunto (lidas antes de escrever)

| Spec / ADR             | O que já decidiu                                                                                           | Como esta spec usa                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 082 (D5)               | recorte no aparelho por luminância (`proofCrop.service.ts`), ajuste manual                                 | a verificação roda depois do recorte; o serviço de recorte não muda                                                   |
| 055                    | leitura por câmera no separador                                                                            | nada reaproveitado (código de barras da chave)                                                                        |
| 152 (D9, ADR-0065)     | motivos como códigos fechados; luz 60, contraste 20, Laplaciano 60 — **T15 nunca rodou**                   | códigos no mesmo espírito; limiares só como ponto de partida da calibração                                            |
| 156 T13/T14 (ADR-0069) | OCR do número com `tesseract.js` 7 no painel, interruptor `canhoto_ocr_enabled`                            | mesmo motor, configuração e interruptor, por cópia por valor                                                          |
| 159 (ADR-0070, T11)    | entrega nunca recusada por falta de foto; foto grava **antes** de qualquer espera; pior pontualidade vence | grava primeiro, avisa depois; "Tirar outra" avisa que a foto nova conta hora e lugar                                  |
| 179                    | foto na ocorrência "Não entreguei"                                                                         | **fora**: não passa pelo recorte                                                                                      |
| 184                    | fotos da carga (`kind = 'cargo'`)                                                                          | **fora**                                                                                                              |
| 189 (ADR-0075)         | app própria, precache ≤ 1,5 MiB, CSP estreita, SW só com precache                                          | emendados pela ADR-0078 §5 e §6                                                                                       |
| 192 (ADR-0077)         | o motorista muda a ordem                                                                                   | `'stop-order'` em `CAPTURE_KINDS`, selo no `DriverStopCard` — ver coordenação                                         |
| 193 (ADR-0079)         | quem recebeu + fila no cabeçalho                                                                           | mexe em `DeliveryProofSection`, `QueuedAttachment`, multipart e migration em `trip_delivery_proofs` — ver coordenação |
| 195 (ADR-0080)         | endereço errado vira correção                                                                              | botão novo no `DriverStopCard` — ver coordenação                                                                      |
| 196 (ADR-0081)         | todo evento carrega onde aconteceu                                                                         | `useDriverTrip.hook.ts`, `DriverTripWorkspace.page.tsx`; o multipart da foto mantém `latitude`/`longitude`            |
| 197, 198               | não existiam em nenhuma branch nem worktree em 2026-09-25                                                  | T1.0 confere de novo                                                                                                  |

A tabela por arquivo, com a ordem de quem entra primeiro, está no `plan.md` § Coordenação.

## Fora do escopo

- Bloquear foto, entrega ou comprovante por qualquer verificação (ADR-0070).
- O `/minha-viagem` legado do painel (`apps/frontend-transportada/src/modules/driver-trip/`): só esvazia
  filas (ADR-0075 §6) e não recebe a verificação.
- Foto da ocorrência (179), da carga (184) e assinatura desenhada no aparelho (`SignaturePad`).
- Leitura da chave por código de barras no aparelho do motorista.
- Mudar a nota do motorista (ADR-0070) com base nos avisos.
- OCR no painel e a regra de sugestão do escritório (ADR-0069 §3).
- Validar **quem** assinou.

## Histórias priorizadas

### P1 — A foto ruim é pega na porta do cliente (fase 1)

**Given** o motorista tirou (ou escolheu da galeria) a foto do canhoto e confirmou o recorte (ou "Usar
sem recorte") **When** a foto está sem papel, cortada, tremida, escura, sem contraste ou estourada
**Then** a foto **já está na fila** ("Anexada"), e o cartão mostra, ao lado da miniatura, cada motivo em
texto e ícone, com "Tirar outra" e "Manter".

**Given** o aviso está aberto **When** o motorista toca "Tirar outra" e cancela a câmera **Then** a foto
anterior continua na fila, intacta.

**Given** o motorista toca "Tirar outra" e confirma a foto nova **Then** a nova substitui a anterior na
fila numa escrita só (a anterior sai depois de a nova estar gravada), e é verificada de novo.

**Given** a parada já foi concluída **When** o aviso aparece **Then** "Tirar outra" traz a frase "A foto
nova vale a hora e o lugar de agora".

**Given** a foto está boa **Then** nada extra aparece.

### P2 — O canhoto de outra nota é avisado (fase 2)

**Given** a empresa ligou "Ler o número do canhoto (experimental)" e a foto entrou na fila **When** o
número lido não é o da nota do comprovante **Then** o cartão da parada mostra "O canhoto parece ser de
outra nota: lido X, esperado Y" (ou "parece ser da nota Y desta parada"), com "Tirar outra" e "Manter".
Nada espera a leitura.

**Given** o número lido é o da nota **Then** aparece "Número confere" com o selo "Experimental".

**Given** a leitura é inconclusiva, falha, passa de 20 s desde o aceite, o aparelho está em economia de
dados ou o interruptor está desligado **Then** nada aparece.

**Given** a foto foi anexada na tela "Fotos pendentes" **Then** o resultado aparece na linha da
pendência, só informativo (`matched`/`mismatch`), sem "Tirar outra".

### P3 — O canhoto em branco é avisado (fase 3)

**Given** a foto aceita é uma tira horizontal de canhoto **When** a célula de assinatura parece sem
tinta **Then** o aviso da P1 inclui "Não achei assinatura no canhoto: confira se o recebedor assinou",
com selo "Experimental".

**Given** a foto não é tira horizontal (DANFE inteiro, canhoto vertical, "Usar sem recorte" com o
papel todo) **Then** a assinatura não é avaliada.

### P4 — O escritório vê o aviso ignorado (fase 4, opcional)

Depende de aprovação do usuário (migration). **Given** o motorista manteve a foto com aviso **When** o
escritório abre o comprovante **Then** vê os motivos ("tremida", "número lido 000.123.457") ao lado da
foto.

## Requisitos funcionais

- **RF01** — A verificação roda nos dois caminhos da foto (câmera com `capture` e galeria), depois do
  `ProofCrop` (confirmar ou "Usar sem recorte"), também em `DriverPendingProofs.page.tsx`.
- **RF02** — O `onConfirm` do `ProofCrop` abre `proof-check` no `captureRegistry` **antes** de desmontar
  o recorte, chama `attach('photo')` (grava no IndexedDB) e só então verifica. `proof-check` fecha
  quando o resultado está pronto.
- **RF03** — Qualidade: códigos fechados `noDocument`, `documentCut`, `blurry`, `tooDark`,
  `lowContrast`, `overexposed` (ADR-0078 §2), por função pura; vários motivos aparecem juntos, em ordem
  fixa.
- **RF04** — Com zero motivos, nada aparece. Com um ou mais, o aviso fica no cartão com "Tirar outra"
  e "Manter". "Tirar outra" abre a mesma origem por um handle com `click()` síncrono; a foto nova
  substitui a anterior na fila numa escrita só; cancelar não muda nada.
- **RF05** — Com a parada concluída, "Tirar outra" mostra que a foto nova conta hora e lugar de agora.
- **RF06** — `PROOF_PHOTO_CHECK_ENABLED` (constante) desliga a verificação inteira.
- **RF07** — `GET /me/trips/current` devolve `data.canhotoOcrEnabled: boolean` (sem linha → `false`);
  a app trata ausente ou inválido como `false` e guarda no snapshot offline.
- **RF08** — `attachProof` devolve a `attachmentKey` junto do resultado. Com o interruptor ligado, o OCR
  dispara depois de `enqueueAttachment` aceitar, com prazo total de 20 s contado do aceite; resultado de
  foto trocada ou fora do prazo é descartado.
- **RF09** — Comparação: `matched` / `otherStopDocument` / `mismatch` / `unread` contra a nota do
  comprovante e as outras da parada (zeros à esquerda não contam; série lida tem de bater junto).
- **RF10** — `unread` nunca mostra nada. O resultado aparece num componente do nível da página, chaveado
  por `documentId`: no cartão da parada com "Tirar outra"/"Manter"; em "Fotos pendentes" só
  `matched`/`mismatch`, informativo.
- **RF11** — Imagem do OCR: a foto aceita reduzida a no máximo 2000 px no lado maior; tira vertical
  lida girada nos dois sentidos dentro do prazo; "Usar sem recorte" lê a foto inteira.
- **RF12** — Pré-carga: com o interruptor ligado, rede e sem `saveData`, os arquivos do motor são
  aquecidos no cache do SW quando a viagem abre; com `saveData`, o motor não carrega.
- **RF13** — Assinatura: `present` / `absent` / `inconclusive` (ADR-0078 §3); `absent` vira o motivo
  `signatureMissing`.
- **RF14** — O texto do interruptor no painel diz que vale para o escritório e para a app do motorista.
- **RF15** (fase 4, opcional) — O comprovante grava os códigos e os dígitos lidos; o painel mostra.

## Requisitos não funcionais

- **RNF01** — Tempo medido, não afirmado em CI: decodificar (`createImageBitmap`) uma foto de 12 MP +
  qualidade + assinatura, no Playwright com CPU a 6× de lentidão, registrado no `evidence.md`, e no
  preview num celular médio. Meta: resultado em ≤ 1,5 s com throttling; a foto já está na fila de
  qualquer jeito.
- **RNF02** — Precache ≤ 1,5 MiB; o único peso novo nele é o chunk `tesseract-ocr` (≤ 32 KB).
- **RNF03** — Nenhuma imagem, grade, texto OCR, confiança ou resultado sai do aparelho nas fases 1–3;
  nada em log nem telemetria.
- **RNF04** — Alvo de toque ≥ 44 px; textos em `*.locale.json` (pt-BR e en).
- **RNF05** — CSP: `'wasm-unsafe-eval'` só nas respostas de `/canhoto-ocr/<versão>/` (preferido) ou no
  documento (se a sonda reprovar); nenhuma origem nova.
- **RNF06** — Primeira leitura ~4,5 MB, só com o interruptor ligado; as seguintes do cache do SW,
  também sem rede e depois de recarregar a página.
- **RNF07** — O `prebuild` com a compressão brotli do motor cabe no teto de ~180 s do smoke local e no
  job da CI (medido no `evidence.md`).

## Casos extremos e falhas

| Caso                                                     | Comportamento                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Falta campo obrigatório no toque                         | a foto **não** some (pré-requisito); a verificação roda quando ela for anexada |
| Imagem não decodifica / canvas sem contexto              | foto já na fila; nenhum aviso                                                  |
| App fechada ou página navega durante a verificação       | a foto já está no IndexedDB; o aviso simplesmente não aparece                  |
| Atualização do SW pedida durante a verificação           | espera o `close` do `proof-check`                                              |
| "Tirar outra" e a câmera é cancelada                     | a foto anterior continua na fila                                               |
| "Tirar outra" depois de a anterior subir                 | a API guarda a nova pelo upsert, com a pior pontualidade                       |
| Foto do DANFE inteiro                                    | qualidade roda; assinatura `inconclusive`; OCR pode ler                        |
| Canhoto vertical                                         | qualidade roda; assinatura `inconclusive`; OCR tenta os dois giros             |
| "Usar sem recorte"                                       | qualidade sobre a foto inteira; assinatura só se a foto inteira for tira       |
| Duas notas da parada com o mesmo número                  | sem série lida → `unread`; com série → compara                                 |
| Aviso de OCR chega depois de a foto ser trocada          | descartado (amarrado à `attachmentKey`)                                        |
| Sem rede na primeira foto com OCR ligado e sem pré-carga | motor não carrega → `unread`                                                   |
| iOS < 16                                                 | motor falha → `unread`                                                         |
| Carimbo no lugar da assinatura                           | conta como tinta — limitação aceita                                            |

## Critérios de aceite

- **CA01** — Grades sintéticas com ruído realista (amplitude > 30, fundo claro na lateral) produzem os
  códigos esperados nos dois sentidos: nítida bem enquadrada (inclusive papel ocupando quase tudo) →
  nenhum; tremida → `blurry`; escura → `tooDark`; apagada → `lowContrast`; estourada → `overexposed`;
  sem papel → `noDocument`; texto cortado nas laterais → `documentCut`; papel inteiro com margem de mesa
  clara → nenhum.
- **CA02** — T1.2b: matriz de confusão sobre ≥ 40 fotos reais rotuladas pelo usuário, com aviso em
  ≤ 20% das fotos boas, antes de qualquer publicação.
- **CA03** — Contratos do fluxo: "cancelar a câmera depois de Tirar outra não perde a foto"; "a foto
  entra na fila antes da verificação"; "atualização do SW pedida durante a checagem espera"; "Tirar
  outra substitui numa escrita só".
- **CA04** — Smoke: foto nítida sem aviso; foto tremida → "Anexada" + aviso; "Manter" some o aviso;
  "Tirar outra" reabre o seletor; câmera e galeria.
- **CA05** — `dist.contract` verde com as regras da ADR-0078 §5; o chunk do Tesseract no precache e sem
  `modulepreload`.
- **CA06** — Contrato do SW (duas rotas, `CacheFirst` só em `/canhoto-ocr/<versão>/`) e da CSP (a forma
  escolhida pela sonda).
- **CA07** — Listas de palavras produzem `matched`/`otherStopDocument`/`mismatch`/`unread`.
- **CA08** — Smoke do OCR: número certo → "Número confere"; errado → aviso; zero
  `securitypolicyviolation`; depois de recarregar a página e `context.setOffline(true)`, a segunda
  leitura funciona.
- **CA09** — Grades com e sem traço na célula de assinatura, só rótulo e com bordas de tabela →
  `present`/`absent`/`absent`/`absent`; tira vertical → `inconclusive`.
- **CA10** — API: `canhotoOcrEnabled` no snapshot (`false` sem linha, `true` ligado, empresa A não vê o
  valor de B), com a integração registrada em `scripts["test:integration"]` e a saída mostrando o
  arquivo rodando.
- **CA11** — Prints 375/768 de cada estado enviados ao usuário, e o usuário viu o preview local antes
  de qualquer push.

## Dúvidas

Nenhum `[NEEDS CLARIFICATION]` bloqueante. Decisões desta spec (reabríveis pelo usuário):

- **D1** — **Grava primeiro, avisa depois** para as três verificações: a foto vai para o IndexedDB no
  `onConfirm`, e o aviso aparece no cartão com "Tirar outra" (substitui) e "Manter".
- **D2** — O interruptor do OCR é o `canhoto_ocr_enabled` existente, no snapshot do motorista.
- **D3** — O número é comparado com a nota do comprovante e as da mesma parada.
- **D4** — Nada sobe para a API nas fases 1–3. A fase 4 é opcional, depende de "sim" do usuário (T4.0)
  e entra junto com a migration da spec 193 na mesma tabela, ou depois dela.
- **D5** — Nenhum limiar vai a staging sem a calibração da T1.2b; produção só depois da T5.4.

**Só o usuário decide/fornece:** as ≥ 40 fotos reais rotuladas da T1.2b; se a validação de 50
canhotos da ADR-0069 §6 (OCR no painel) já foi feita — se não, a T5.4 a absorve; a aprovação da fase
4; ligar o interruptor em qualquer ambiente.
