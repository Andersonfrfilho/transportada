# ADR 0042 — O leitor de etiqueta não afrouxa a CSP

- Status: aceito
- Data: 2026-08-24
- Decisores: mantenedor do projeto e revisão Opus
- Fecha a T007 da spec 055 (`specs/055-o-separador-le-a-nota-com-a-camera/`)

## Contexto

O separador vai bipar a etiqueta da nota com a câmera do celular, e o PWA roda em **Android e iOS**.
No Chromium do Android existe `BarcodeDetector` nativo e não é preciso baixar decodificador nenhum;
no Safari do iPhone ele não existe, e sem um decodificador em JavaScript metade da frota de aparelhos
fica com o botão de leitura inútil.

Escolher esse decodificador não é escolher uma biblioteca de conveniência. A CSP desta app nasce no
build, tem fonte única em `shared/contentSecurityPolicy.service.ts` e o servidor **não sobe sem ela**
(`FRONTEND_MISSING_CONTENT_SECURITY_POLICY`). Duas diretivas dela são exatamente o que um leitor de
código de barras costuma pedir emprestado:

- `script-src` **não tem** `'wasm-unsafe-eval'`, e a diretiva vale para o bundle inteiro — abrir WASM
  para o leitor abre para todo o resto do aplicativo, para sempre.
- `worker-src` é `'self'`, sem `blob:` — biblioteca que cria o worker a partir de um `Blob` não roda,
  e a saída fácil (acrescentar `blob:`) devolve ao bundle a capacidade de executar código montado em
  tempo de execução.

Por isso os critérios de recusa foram fixados **antes** de instalar qualquer coisa, e todos são
verificáveis lendo o registro do npm e o conteúdo do pacote.

## Critérios de recusa

1. **WASM** — forçaria `'wasm-unsafe-eval'` no `script-src`.
2. **Worker a partir de `blob:`** — `worker-src` é `'self'`.
3. **Ausência de ESM** — o Vite precisa do módulo para separar a rota e para empacotar o worker.
4. **Ausência de 1D Code-128** — a DANFE do modelo 55 costuma imprimir a chave em Code-128, não em
   QR. Leitor só de QR resolve metade das etiquetas e a metade que falta é a do papel que já está
   impresso no cliente.

## Candidatos medidos

| Pacote               | Última versão           | ESM | Critério que reprova                                                          |
| -------------------- | ----------------------- | --- | ----------------------------------------------------------------------------- |
| `zxing-wasm`         | 3.1.3 · 2026-08-14      | sim | 1 — é WASM por definição                                                      |
| `barcode-detector`   | 3.2.2 · 2026-08-16      | sim | 1 — herda: depende de `zxing-wasm`                                            |
| `jsqr`               | 1.4.0 · 2021-04-24      | não | 3 e 4 — sem campo `module`, só QR, sem publicação há cinco anos               |
| `@ericblade/quagga2` | 1.12.1 · 2025-12-20     | não | 3 e cobertura — 1D sem QR, e sem campo `module`                               |
| `html5-qrcode`       | 2.3.8 · 2023-04-15      | sim | manutenção — parado desde 2023, e traz câmera e UI próprias que duplicam T008 |
| `@zxing/browser`     | 0.2.1 · 2026-07-06      | sim | acoplado ao DOM (`<video>`) — não roda dentro de worker                       |
| `@zxing/library`     | **0.23.0** · 2026-04-29 | sim | nenhum — **escolhido**                                                        |

## Decisão

### 1. O decodificador é `@zxing/library@0.23.0`

Apache-2.0, uma dependência de produção (`ts-custom-error`). A opcional `@zxing/text-encoding` **não**
foi instalada — o `bun.lock` a registra como opcional e o `node_modules` não a tem; ela é polyfill de
`TextEncoder` para navegador que não temos como alvo.

Não é o pacote mais movimentado da lista, e isso está registrado de propósito: entre `0.21.3`
(2024-08-21) e `0.22.0` (2026-04-27) o projeto ficou vinte meses em silêncio. O que é mais ativo hoje
— `zxing-wasm` e o polyfill que depende dele — é justamente o que o critério 1 recusa. A troca, se um
dia for preciso, tem um ponto só: o worker do T008.

### 2. Os leitores entram por caminho profundo, nunca pela raiz nem por `MultiFormatReader`

`MultiFormatReader` arrasta todos os decodificadores do pacote — Aztec, DataMatrix, PDF417, toda a
família UPC/EAN. Medido com `bun build --target browser --minify`:

| Importação                                        | Minificado | Gzip         |
| ------------------------------------------------- | ---------- | ------------ |
| `MultiFormatReader` + binarizador + fonte         | 350.044 B  | 92.211 B     |
| `Code128Reader` + `QRCodeReader` + os mesmos dois | 109.780 B  | **28.113 B** |

Só os dois leitores que a etiqueta usa, portanto. O pacote não declara `exports`, então o caminho
profundo (`@zxing/library/esm/core/oned/Code128Reader.js`) é caminho público; os módulos de lá expõem
`export default`, e é assim que se importam — a regra de "named exports only" é da nossa base de
código, não de como se consome pacote de terceiro.

### 3. `esm/browser/*` fica fora, e a câmera é nossa

`BrowserCodeReader` é o **único** arquivo do pacote que menciona `URL.createObjectURL` (linha 1083,
o `video.src` de navegador antigo). Ele não é worker em `blob:` — mas também não é preciso: a câmera,
o `facingMode: 'environment'` e o encerramento das trilhas são o primitivo `@/components/ui/barcode-scanner`
do T008. Importar a pasta `browser/` traria o DOM para dentro do worker e o `createObjectURL` para
dentro do bundle sem que nada o exija.

### 4. O worker é empacotado pelo Vite

`new Worker(new URL('./barcode-decoder.worker.ts', import.meta.url), { type: 'module' })`. O Vite emite
o worker como asset da própria origem, e `worker-src 'self'` continua valendo sem uma vírgula de
mudança.

### 5. A CSP não muda

O decodificador não fala com a rede: nenhuma origem nova no `connect-src`, nenhuma diretiva nova.
`dist/content-security-policy.txt` continua byte a byte o que era — e é isso que o aceite da T007
verifica.

## Medições

Feitas com `bun` fora do navegador (`typeof document === 'undefined'`, `typeof window === 'undefined'`),
que é o mesmo ambiente sem DOM de um worker:

| O que                                       | Como                                                                                 | Resultado |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| Code-128C, chave de 44 dígitos              | bitmap gerado fora do pacote, a partir da tabela do padrão ISO                       | leu       |
| Code-128B, chave com CNPJ alfanumérico      | idem — é o caso que a IN RFB 2229/2024 tornou possível, e Code-128C não encoda letra | leu       |
| QR com a mesma chave                        | `MultiFormatWriter` do próprio pacote                                                | leu       |
| `WebAssembly` / `createObjectURL` no bundle | varredura do bundle estreito minificado                                              | ausentes  |

A entrada é `RGBLuminanceSource` → `HybridBinarizer` → `BinaryBitmap`, tudo alimentado por um
`Uint8ClampedArray` de luminância — que é o que o worker recebe do `ImageData` do quadro de vídeo.

## Consequências

- A rota da viagem carrega ~28 KB gzip a mais **quando o aparelho não tem `BarcodeDetector`**; em
  Android o decodificador nem é buscado.
- Quem trocar o decodificador refaz as duas medições desta ADR: as três leituras e o peso do bundle.
- **Qual simbologia a etiqueta do cliente traz continua sendo medição de campo pendente** (registrada
  em `evidence.md` da spec 055). Os três formatos acima decodificam; a medição decide se o Code-128
  do papel é B ou C, e nada mais.
- Chave de 44 caracteres com letra **não cabe em Code-128C** — ele codifica pares de dígitos. Se a
  etiqueta do cliente for C e o emitente passar a ter CNPJ alfanumérico, quem muda a impressão é o
  emitente, não o leitor: este decodifica os dois conjuntos.

## Emenda (02/10/2026): `worker-src` passa a aceitar `blob:`, só para a planilha

A regra acima valia para o leitor de etiqueta, e continua valendo para ele: nenhum motor de leitura
ou de medida cria worker a partir de `Blob`. O que mudou é outra biblioteca.

- **O que quebrou.** O `write-excel-file` comprime o `.xlsx` com o `fflate`, que monta o worker a
  partir de um `Blob` quando a planilha é grande. Com `worker-src 'self'` o navegador recusava o
  worker e o arquivo nunca saía; só o script do worker era gerado. Reproduzido com 900 linhas na
  CSP antiga. Com poucas linhas a biblioteca não usa worker, por isso o defeito só aparecia com as
  centenas de caixas reais, e o CSV (que não comprime) seguia funcionando.
- **Decisão (do usuário, 02/10/2026).** `worker-src 'self' blob:`. `script-src` continua
  `'self' 'wasm-unsafe-eval'`, sem `blob:` e sem `unsafe-eval`.
- **Por que é uma exceção estreita.** O código do worker nasce do bundle (`fflate`), nunca de texto
  de terceiro; um XSS ainda precisaria passar por `script-src` antes de chegar ao `Blob`. Mesmo
  assim é afrouxamento real: quem escrever worker novo a partir de `Blob` agora roda, e antes era
  recusado no teste.
- **O que não muda.** Worker de leitor, de OCR e de mapa continuam empacotados na própria origem
  (`pdfjsLoader`, `canhotoOcrEngine`, MapLibre) — a regra de empacotar vale por si e não depende
  da CSP recusar o resto.
- **Contrato.** `test/shared/opencv-build.contract.ts` afirma `worker-src 'self' blob:` e que
  `script-src` não contém `blob:`. Voltar atrás exige trocar o Excel por uma geração sem worker.
