# ADR 0103 — A transcrição de áudio roda com modelo próprio (whisper.cpp no worker)

- **Status:** **aceita** (2026-10-12, T0.2 da spec 264), com o modelo e as medidas abaixo. Produção exige aprovação
  humana própria.
- **Data:** 2026-10-10
- **Nasce da spec 264**; fecha a dúvida da spec 183 (RF18, T706)
- **Citações:** ADR-0072, ADR-0073, ADR-0081 §9, ADR-0101, specs 183, 252, 263

## Contexto

A spec 183 (RF18, D8) decidiu que o áudio da conversa é mensagem e que a transcrição é só ajuda de leitura, gerada pelo
worker depois de gravar o áudio, desligável por empresa, e que "transcrever manda a voz de terceiros a um provedor, e
isso exige ADR própria". A T706 ficou bloqueada por falta dessa decisão.

O pacote `@adatechnology/audio-transcription-provider@0.1.0` oferece dois motores atrás da mesma porta estrutural
(`AudioTranscriber`): Groq hospedado (padrão; aceita `baseUrl` compatível com OpenAI) e `whisper-local` (whisper.cpp +
ffmpeg + modelo ggml, em processo filho, subpath opt-in), além de uma cadeia (`createTranscriberChain`) e da distinção
retriável/definitivo nos erros.

## Decisão

1. **O motor é o `whisper-local`, rodando dentro da imagem do worker.** Nenhuma voz sai da nossa infraestrutura;
   nenhum custo por uso. (Decisão do dono, 2026-10-10.)
2. **O modelo é escolhido por medida no runner do Railway** (spike T0.2 da spec 264), pelo critério fechado do plano
   da 264 § d: o menor modelo sem loop de repetição, com erro de palavras aceitável numa amostra pt-BR conferida à
   mão, fator de tempo real ≤ 1 em 2 min de áudio e RAM de pico + base do worker ≤ 70 % do teto do serviço.
   - **Modelo escolhido: `small-q5_1`** · sha256 `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb`
     (190 085 487 bytes, `https://huggingface.co/ggerganov/whisper.cpp`, conferido no build) · whisper.cpp **`v1.9.4`**
     (commit `927cfce34f31707e17f2bff35c349632fb9e2c3a`, conferido no build; `-DGGML_NATIVE=OFF -DGGML_AVX=ON
-DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DBUILD_SHARED_LIBS=OFF`).
   - Medidas no runner do Railway (2026-10-12, serviço temporário `spike-whisper-264` em staging, Intel Xeon 6975P-C,
     teto 8 vCPU / 8 GB igual ao do worker, `--threads 7`): imagem **+293 MB** (ffmpeg e libs 107 MB + `whisper-cli`
     4 MB + modelo 182 MB), deploy **≈ 40 s** depois do push (push de 3,07 GB com os cinco modelos em 66 s; build total
     ≈ 3 min 29 s), RAM de pico **0,50 GB** (com a base do worker: 1,15 GB de 8 GB = **14 %**), fator de tempo real
     **0,15–0,17** em 2 min e 0,14 em 5 min, erro de palavras **2,5–8,2 %** em **6** áudios TTS pt-BR no runner (e
     12 na medida local; limpo, ruído de cabine ~8 dB SNR, fala rápida; 10 s a 5 min), **nenhum loop**. Impacto numa
     rotina vizinha de CPU (proxy do `trip.canhoto.read`) durante a transcrição: nenhum mensurável (−0 a −1 %).
   - Por que não os outros: `base` reprovou (ii) — 19–29 % com ruído e 84 palavras engolidas. `small`,
     `large-v3-turbo-q5_0` e `large-v3-turbo` cumprem os quatro critérios (fatores 0,17 / 0,50 / 0,46), mas não são
     o **menor**; ficam como reserva medida, nessa ordem, se a T6.3 reprovar o `small-q5_1` com áudio real — cabem no
     worker sem mudar plano.
   - Teto de duração **mantido em 10 min** (pior caso ≈ 102 s por áudio). `AUDIO_TRANSCRIPTION_TIMEOUT_MS = 300000`,
     `AUDIO_TRANSCRIPTION_BATCH_SIZE = 2`, `AUDIO_TRANSCRIPTION_THREADS = 7`. Cadência **5 min**
     (`JOB_TICK_INTERVAL_SECONDS = 300` e o `cron` do Railway em `*/5`; não há agendador mais fino). Worker: **8 vCPU /
     8 GB, sem mudança de plano**.
   - Custo: spike ≈ **US$ 0,06** (~27 min); operação ≈ **US$ 0,0006 por minuto de áudio** pela tabela pública do Railway,
     zero fora da transcrição. Números, comandos e ressalvas em `specs/264-*/evidence.md` § "T0.2 — medidas".
   - ⚠️ A amostra é **TTS** (dicção perfeita, sem sotaque): proxy otimista. A qualidade com voz real em cabine é
     conferida na T6.3 com áudio gravado com consentimento; se reprovar, troca pela reserva acima com nova medida.
3. **Groq/OpenAI e qualquer serviço hospedado ficam fora**, inclusive como reserva em cadeia. Ligar um deles exige ADR
   nova (privacidade e custo).
4. **Um áudio por vez por instância**, em processo filho; teto de duração transcrita (padrão 10 min); sem a variável
   do modelo a rotina não é registrada (inerte, molde da spec 252).
5. **Se nenhum modelo cumprir o critério no worker**, a decisão volta ao dono (plano maior, serviço interno dedicado
   sem domínio público, ou critério mais frouxo) — não se resolve por conta própria.

## Consequências

- **Privacidade:** a fala de motorista, operador e contratante nunca vai a terceiro. O texto é dado pessoal novo:
  tabela do produto com `company_id`, fora de log, retenção amarrada ao áudio (spec 264 D10), registro em
  `docs/SECURITY.md`.
- **Custo:** zero por uso; custo de infra medido acima (RAM/CPU do plano, imagem maior, deploy mais lento).
- **Operação:** o worker passa a carregar `ffmpeg` e `whisper-cli` compilado de tag fixada, e o modelo conferido por
  sha256 no build. Atualizar o whisper.cpp ou o modelo é mudança de imagem com nova medida.
- **Qualidade:** em CPU e com ruído de cabine o texto erra; por isso o aviso "gerada por máquina" e o áudio como
  registro (183 D8). A transcrição nunca decide nada.
- **Latência:** até a cadência da rotina mais o tempo de processamento — aceitável para leitura assistida, não para
  conversa em tempo real.

## Alternativas descartadas

- **Groq (Whisper hospedado)** — mais rápido e sem carga no worker, mas manda a voz de terceiros a um serviço externo,
  com cota (free tier 20 req/min, 2.000/dia) e cobrança com piso de 10 s por requisição fora dele. O dono recusou
  custo por uso e envio da voz para fora.
- **OpenAI (Whisper/transcribe API)** — mesmos motivos, com custo por minuto.
- **Cadeia Groq → local** — reintroduz o envio para fora no caminho feliz; fica para ADR futura, se algum dia for
  aceitável.
- **Transcrever no aparelho (navegador)** — modelos WASM pesados demais para o celular do motorista, bateria e dados;
  e o escritório e os canais externos não teriam transcrição.
- **Serviço interno dedicado desde já** — isola a CPU, mas é um serviço a mais para operar antes de existir medida que o
  justifique; fica como saída de emergência (Decisão 5).
- **`base` (~148 MB) por economia** — o README do pacote registra loop de repetição e troca de palavras em pt-BR com
  áudio de celular; entra no spike só como piso de comparação. Medido (T0.2, local): sem loop, mas 17–23 % de erro com
  ruído e janelas de 30 s trocadas por "música de fundo"; no Railway, 19–29 % e 84 palavras engolidas.
- **`large-v3-turbo` (recomendação do README do pacote)** — medido (T0.2): cumpre o critério no runner (fator 0,46 em
  2 min), mas com 1,8 GB de RAM, frases inteiras engolidas no proxy TTS e o mesmo erro de palavras do `small`; não é o
  menor. Fica como reserva, depois de `small` e `large-v3-turbo-q5_0`.
