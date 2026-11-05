# Spike T4.1 — o rosto da CNH (05/11/2026)

Medido em **produção, somente leitura** (`railway ssh` no container da `api`, transação `read only`;
download do bucket pelo mesmo container, para pasta temporária local apagada ao fim). Só motoristas
**sem** foto de perfil entraram. Nenhum nome, CPF, número de CNH ou chave de objeto foi registrado:
amostras por índice opaco. Nenhum serviço externo: tudo local.

## 1. Inventário (contagens)

| medida                                                                      | produção     |
| --------------------------------------------------------------------------- | ------------ |
| Fichas de motorista ativas (`fleet_drivers`)                                | 20           |
| … com usuário (membership)                                                  | 20           |
| … com foto de perfil (`identity_user_pictures`)                             | 2            |
| **… sem foto (escopo)**                                                     | **18**       |
| **Sem foto e com arquivo de CNH** (objeto distinto)                         | **1**        |
| CNH-e em PDF digital (CDT, com camada de texto)                             | 1            |
| CNH fotografada (imagem) / PDF digitalizado                                 | 0 / 0        |
| Objetos do fluxo de agregado no bucket (`aggregate_application_attachment`) | 8, todos PDF |
| CNH fora do escopo (candidatura `pending`, ainda não é motorista)           | 1, PDF       |

**O limite é o acervo, não a extração.** A CNH só existe no bucket pelo pré-cadastro do agregado (071,
`aggregate_application_attachments` → `aggregate_documents`). A ficha da frota ainda **não** guarda
documento: `fleet_driver_attachments` da 091 não existe (Fase 2 da 091 aberta). 17 dos 18 motoristas sem
foto não têm arquivo de CNH nenhum.

## 2. CNH-e em PDF digital

- O rosto **não** é um objeto de imagem próprio, ao contrário do que o RF10 supunha. A página 1 da CNH-e
  (produtor `CDT`, A4) traz 5 imagens: brasão 113×120, três imagens do cartão 963×680 (frente, verso,
  informações) e o QR 591×591 de 1 bit. O retrato está **dentro** da imagem da frente do cartão.
- Logo, até o PDF digital precisa de detecção (ou de recorte por geometria fixa do layout, frágil a
  mudança do Detran). O protótipo extrai as imagens ≥ 200 px da página 1 com `pdfjs-dist`, descarta 1 bit,
  e roda o detector em cada uma.
- **Resultado: 1 de 1 extraído**, um único rosto (nota 0,99998), recorte 220×294 px (≥ 120 px no lado
  curto), WebP de 5 KB, ~0,2–0,5 s por arquivo. Conferido visualmente: rosto único, centrado, utilizável
  como avatar.

## 3. Foto e PDF digitalizado

Produção não tem **nenhuma** amostra real desse tipo. Para não ficar sem medida, 12 variantes **sintéticas**
derivadas da imagem do cartão da amostra (só na pasta temporária, apagadas) simularam foto e digitalização.
Não substituem amostra real — a 048 continua esperando amostras de CNH física.

| variante                                    | desfecho                  |
| ------------------------------------------- | ------------------------- |
| cartão em JPEG, girado 90°, 180°, 270°      | 4 de 4 extraídos          |
| desfocado, escuro                           | 2 de 2 extraídos          |
| cartão inclinado 8° sobre fundo (3000×4000) | extraído (381 px)         |
| PDF digitalizado (sem texto), 2 variantes   | 2 de 2 extraídos          |
| cartão reduzido a 1/2 e 1/3                 | `too_small` (110 e 74 px) |
| cartão pequeno (700 px) em foto 3000×4000   | `no_face`                 |

**9 de 12 extraídos**, 0 rosto errado. Falha achada e corrigida no protótipo: o detector acha rosto
**deitado ou de cabeça para baixo** com nota 0,96–0,99; pegar a primeira rotação com rosto devolvia o recorte
deitado. Agora vence a rotação de maior nota (a de pé dá ≥ 0,9999).

## 4. Biblioteca e custo

| peça                            | versão     | observação                                                                                             |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `pdfjs-dist` (legacy)           | 6.2.108    | já dependência do worker; `isEvalSupported: false`                                                     |
| `sharp`                         | 0.33.5     | já dependência do worker; decodifica, aplica EXIF, gira, recorta, WebP                                 |
| `onnxruntime-web` (WASM)        | 1.23.2     | já no `bun.lock` (painel); roda no Bun; WASM simd 12 MB; carga ~140 ms, inferência ~23 ms; RSS ~230 MB |
| UltraFace RFB-320 (ONNX)        | modelo zoo | 1,2 MB, MIT, sha256 `34cd7e60…f88017`                                                                  |
| `onnxruntime-node` (descartado) | 1.31.1     | roda no Bun (RSS 79 MB), mas só traz binário **glibc** (46 MB); o worker é `oven/bun:*-alpine` (musl)  |

Alternativa não medida: acrescentar `FaceDetectorYN`/`CascadeClassifier` ao OpenCV.js que o worker já compila
(`deploy/opencv-build`, spec 152) — evita dependência nova, mas exige rebuild do WASM.

Protótipo: `apps/worker-transportada/spike/cnh-face/` (fora de lint/tsconfig; `README.md` diz como rodar).

## 5. Modos de falha

- **Sem arquivo** (17 de 18 hoje): nada a extrair até a 091 Fase 2 guardar a CNH na ficha.
- `too_small`: foto de CNH tirada de longe ou cartão reduzido; o retrato da CNH é pequeno por natureza
  (~130 px de largura num cartão de 963 px).
- `no_face`: cartão pequeno numa foto grande — o detector reduz tudo a 320×240. Melhoria possível: segunda
  passada em ladrilhos/zoom quando a primeira não acha nada.
- `multiple_faces`: não ocorreu (o verso e o QR não disparam), mas o desfecho existe e pula.
- Rotação: resolvida pela maior nota; PDF digital não gira.

## 6. Recomendação

1. **Aplicar direto** (`origin = 'cnh'`) quando: desfecho `extracted`, um único rosto, nota ≥ 0,98, lado
   curto ≥ 120 px. Vale para CNH-e digital (1/1 real) e, pelo sintético, para foto/digitalizado.
2. **Pular em silêncio** (`no_face`, `multiple_faces`, `too_small`, `unsupported`): ficam as iniciais; contar o
   desfecho em métrica sem PII, sem alerta, sem nova tentativa.
3. Rodar **no worker** (Alpine): `onnxruntime-web` WASM + modelo de 1,2 MB versionado na imagem; bytes só em
   memória. Gatilho: criação do usuário do motorista (049) e aprovação de CNH (071; depois 091).
4. **Valor hoje é 1 motorista.** A Fase 4 só rende depois da 091 Fase 2; sem ela, T4.2 é um backfill de
   uma ficha. Sugestão: T4.2 esperar a 091 T007–T012, ou entrar só com o caminho da 071.
5. Corrigir o RF10: a CNH-e **também** exige detecção (o rosto está dentro da imagem do cartão).

Amostras: 1 arquivo real + 12 variantes sintéticas, todas apagadas da pasta temporária ao fim do spike.
