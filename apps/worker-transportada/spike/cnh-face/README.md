# Spike 295 T4.1 — rosto da CNH (protótipo)

Protótipo, **não** código de produção: fica fora de `tsconfig`, lint e testes do worker. Resultado e
decisão em `specs/295-o-motorista-poe-a-propria-foto/spike-cnh.md`.

- `cnh-face-extractor.ts` — `createCnhFaceExtractor({ modelPath }).extract(bytes)`: PDF (imagens da
  página 1 por `pdfjs-dist`) ou imagem (`sharp`, EXIF aplicado, quatro rotações), detector UltraFace
  RFB-320 em `onnxruntime-web` (WASM), recorte 3:4, saída WebP ≤ 512 px. Desfechos:
  `extracted | no_face | multiple_faces | too_small | unsupported`.
- `run-cnh-face-spike.ts` — roda numa pasta de `sample-*` e imprime só desfecho e medidas.

## Rodar

Fora do repositório (o `onnxruntime-web` não é dependência do worker):

```bash
mkdir /tmp/cnh-face && cd /tmp/cnh-face && bun init -y
bun add pdfjs-dist@6.2.108 sharp@0.33.5 onnxruntime-web@1.23.2
curl -sSLo ultraface-320.onnx https://github.com/onnx/models/raw/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx
# sha256 34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017 (1,2 MB, MIT)
cp <repo>/apps/worker-transportada/spike/cnh-face/*.ts .
bun run-cnh-face-spike.ts ultraface-320.onnx <pasta-com-sample-*> <pasta-de-saída>
```

⚠️ Amostra de CNH é dado pessoal: só em pasta temporária, nunca no repositório, apagada ao fim.
