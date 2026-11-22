# Evidência — Feature 344

## T0 — medição do OCR nas fotos reais (22/11/2026)

Executada pelo Anderson na máquina dele com `tmp/ops/344-t0-mede-leitura.sh` (script fora do repositório; fotos e saída em `tmp/ops/saidas/`, dados de cliente, não commitados). Motor: o mesmo `loadOcrEngine`/`readOcrLines` do `canhoto-ocr` do worker (PP-OCRv4, `onnxruntime-web`), modelos conferidos por SHA-256. Extração do Nº/Série: protótipo ancorado por rótulo ("NF-e", "Nº", "SÉRIE"), sem texto solto. Cada foto foi lida em 4 rotações (0°, 90°, 180°, 270°).

| Foto (nome do arquivo = nota a que foi anexada) | Nº lido | Série | Confere com a nota?                               | Tempo por leitura |
| ----------------------------------------------- | ------- | ----- | ------------------------------------------------- | ----------------- |
| 1 — nota 931988 (o caso real)                   | 172195  | 1     | **não: é da NF 172195 série 1** (confirma o caso) | 1,3–1,5 s         |
| 2 — nota 932062                                 | 932062  | —     | sim                                               | 1,2–1,6 s         |
| 3 — nota 932066                                 | —       | —     | sem número ancorado (nenhum alerta)               | 2,6–3,0 s         |
| 4 — nota 932085                                 | 932085  | —     | sim                                               | 2,1–2,8 s         |

**Resultado do portão (Q1): 3 de 4 fotos com Nº ancorado e correto — passa (mínimo combinado: 3 de 4).** A foto do caso real é lida como a NF 172195 série 1, exatamente o alerta que a spec quer. A foto 3 não ancorou número: pela D3 não gera alerta (sem falso alarme), a tentativa seria carimbada.

Achados que ajustam a spec:

1. **As 4 rotações não mudaram nenhum resultado**: o motor já endireita (orientação por caixas, inclinação, 180° por confiança). A D2 passa a **uma** passada por foto, com rotações só como reserva se a primeira não ancora **[ajuste aplicado]**. Isso corta o custo à metade ou menos.
2. **Tempo**: 1,2–3,0 s por foto, bem abaixo dos ~30 s estimados; lote de 5 por ciclo fica em ~15 s no pior caso.
3. **Memória**: pico de RSS **577 MB** num processo com o motor e uma foto por vez (o bot mede ~740 MB com a thread permanente). A Q5 segue para a medição em staging (T6), agora com ponto de partida.
4. **Série** só foi lida em 1 das 3 fotos lidas; o alerta por número não depende dela (D4), e série ausente continua válida ("série não lida").
5. Ainda a conferir na T0 restante (leitura de código, não de fotos): onde a série mora em `nfe_documents`, o que a rota do robô aceita e os pontos de paridade. Ficam como primeiro passo da T1/T2 (contrato primeiro).

Limite honesto: n = 4 fotos. A medição prova que a abordagem é viável, não a taxa de produção; a taxa real vem da T6 em staging sobre as ~470 provas pendentes.

## T1 — `extractCanhotoIdentity` (22/11/2026)

Política de domínio pura no worker: `apps/worker-transportada/src/canhoto-read/domain/canhoto-identity.policy.ts` (tipo em `canhoto-identity.types.ts`, limites em `canhoto-identity.constant.ts`). Contrato primeiro: `test/canhoto-read/canhoto-identity.contract.ts`, ligado em `test/canhoto-read.contract.test.ts` (já na lista do `package.json`).

Régua implementada (D3):

- Número só com rótulo. "NF-e"/"NOTA FISCAL" é âncora forte; "Nº" solto é fraca (no DANFE inteiro pode ser o número da rua). Havendo forte, só a forte decide; dois números diferentes no mesmo nível ⇒ nada.
- "Nº" logo depois de rótulo de outro documento (pedido, ordem de compra, CT-e, fatura, CEP, CNPJ...) não conta.
- Número exato: 3 a 9 dígitos impressos (`nNF` tem no máximo 9), aceita `000.172.195`, `000,172,195` e `000172195`, sem zeros à esquerda na saída; nenhuma distância de edição no número. Rótulos tolerados: `Nº`, `N°`, `No`, `N.º`, `Nro`, `Num`, `Número`, `N`.
- Série: rótulo "SÉRIE" com até 1 erro (`SER1E`, `5ÉRIE`, `SERE`), 1 a 3 dígitos, `000` vira `0`. Duas séries diferentes ⇒ série `null`, o número fica. Série sem número ⇒ nada.
- Saída `{ number, series }` congelada, só dígitos; o texto reconhecido nunca sai da função.

CA02, linhas sintéticas (nenhuma foto de cliente no repositório): `bun test ./test/canhoto-read/canhoto-identity.contract.ts` → **42 pass, 0 fail** (Bun 1.4.4 no contêiner da sessão). Casos: rótulos em várias ordens e linhas, ruído de OCR do rótulo, número colado à série, sem âncora, número curto/zerado/longo, dois rótulos (pedido, CT-e, fatura, rua), ambiguidade, e o resultado nunca contém texto. `bun run typecheck` e `eslint` da app limpos.

Observação: na mesma sessão, 5 testes **já existentes** de `canhoto-read` que sobem `worker_thread` (decodificador de código de barras) falham com "thread exited with 13" também em `origin/staging` sem esta mudança: é o Bun 1.4.4 do contêiner, não o Bun 1.3.14 do projeto. A CI é a prova.
