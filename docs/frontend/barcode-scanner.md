# Leitor de etiqueta

Todo leitura de código de barras ou QR pela câmera vem de `@/components/ui/barcode-scanner`. O
primitivo abre a câmera traseira, lê a etiqueta e devolve o texto — nada mais. Quem decide o que
fazer com o texto (validar chave de 44 caracteres, vincular a nota, recusar duplicata) é o módulo
que o hospeda.

## Dois decodificadores, um só contrato

O navegador que tem `BarcodeDetector` decodifica sozinho — é o caso do Chromium no Android, e sai
de graça, sem nenhum byte de biblioteca. O que não tem — Safari do iPhone, que é metade do parque
de um PWA, e o Firefox — cai no decodificador do `@zxing/library` rodando **num worker**, para o
laço de decodificação não travar a rolagem da tela do separador.

O worker é empacotado pelo Vite:

```ts
new Worker(new URL('./barcodeDecoder.worker.ts', import.meta.url), { type: 'module' })
```

**Nunca por `blob:`.** A CSP da aplicação declara `worker-src 'self'` e `script-src 'self'`, sem
`'wasm-unsafe-eval'`, e o leitor não afrouxa nenhuma das duas — foi esse o critério que escolheu a
biblioteca, registrado na ADR-0042. Origem nova de worker ou de WASM é mudança de CSP, e mudança de
CSP é ADR.

## O quadro é um byte por pixel

`RGBLuminanceSource` lê **uma** amostra de luminância por pixel. O `ImageData` do canvas vem em
RGBA, quatro bytes por pixel: entregá-lo cru faz a imagem entrar quatro vezes mais larga do que a
largura declarada. O 1D sobrevive a isso — a razão entre as larguras das barras não muda —, então o
Code-128 continua lendo e **só o QR quebra**, que é o defeito mais caro de achar. A conversão é
`toLuminance` em `barcodeScanner.service.ts`, e o contrato a fixa.

## Câmera impossível é resposta, não exceção

`openCameraStream` devolve `unavailable` quando não há `getUserMedia` (navegador antigo, página
servida sem HTTPS) e `denied` quando a pessoa recusou a permissão. Nenhum dos dois lança: a tela
mostra o aviso e **o campo digitado continua sendo o caminho**. Leitor é atalho; digitar a chave
nunca deixa de funcionar.

## A câmera apaga ao fechar

Desmontar o componente ou fechar o painel encerra **toda** trilha do stream (`stopCameraStream`),
termina o worker e limpa o `srcObject` do vídeo. Câmera acesa atrás de painel fechado é a luz do
celular denunciando o vazamento — e é bateria do separador.

## Props

| Prop                 | Tipo                     | Papel                                            |
| -------------------- | ------------------------ | ------------------------------------------------ |
| `isOpen`             | `boolean`                | Abre a câmera; `false` desmonta e apaga.         |
| `onRead`             | `(text: string) => void` | Recebe o texto lido, uma vez por leitura.        |
| `onClose`            | `() => void`             | Fechar pelo botão só de ícone.                   |
| `title`              | `string`                 | Rótulo da seção e do vídeo.                      |
| `closeLabel`         | `string`                 | `aria-label` do botão só de ícone — obrigatório. |
| `startingMessage`    | `string`                 | Enquanto a permissão não voltou.                 |
| `readingMessage`     | `string`                 | Instrução de mira, com a câmera aberta.          |
| `deniedMessage`      | `string`                 | Permissão recusada.                              |
| `unavailableMessage` | `string`                 | Sem câmera neste navegador.                      |

Todo texto vem do `*.locale.json` do módulo que hospeda o leitor — o primitivo não traduz nada.

Contrato: `test/design-system/barcode-scanner.contract.ts`. Decisão de dependência e CSP:
`docs/adr/0042-o-leitor-de-etiqueta-nao-afrouxa-a-csp.md`.
