# Evidência — 264

## T0.2 — medidas

> **Situação (2026-10-12): fechada.** Medida local (2026-10-11) e medida no Railway (2026-10-12, serviço temporário
> `spike-whisper-264` no ambiente `staging` do projeto `transportada`, workspace AdA Technology, autorizado pelo dono e
> **removido** ao fim). Modelo escolhido pelo critério fechado: **`small-q5_1`**. ADR-0103 **aceita**.

### O que se mediu e onde

- **Máquina:** Apple M3 Pro (11 núcleos, 18 GB), Docker Desktop `aarch64` com 11 CPUs/8 GB. Cada medida roda num
  contêiner **Alpine com Bun 1.3.14 (a mesma base do worker)**, limitado a `--cpus=8 --memory=8g` (o teto do worker),
  com `whisper-cli` compilado da tag fixada e `--threads 7` (vCPU − 1, plano § d).
- ⚠️ **A máquina estava disputada:** `vm.loadavg` entre **12,5 e 17,9** em 11 núcleos durante toda a medida (outras
  sessões, Keycloak/MinIO/Postgres de outras árvores). Os tempos são **ruidosos** — a mesma combinação variou até 40 %
  (`large-v3-turbo-q5_0` em 2 min: 94 s limpo vs 133 s com ruído). E o M3 não é a CPU x86 do Railway. **O fator de tempo real local não fecha o critério (iii) no worker** — quem
  fecha é a medida no Railway, mais abaixo (que saiu bem mais rápida que a local).
- **whisper.cpp:** tag `v1.9.4` (2026-09-11; a `v1.9.5` tinha 5 dias e ficou de fora pela regra de duas semanas),
  commit `927cfce34f31707e17f2bff35c349632fb9e2c3a`, conferido no build (`test "$(git rev-parse HEAD)" = ...`).
  `cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
-DGGML_NATIVE=OFF`. Binário de 2,8 MB, dinâmico só contra `libstdc++`, `libgomp`, `libgcc_s` e musl.
- **Modelos** baixados de `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/`, sha256 conferido contra o oid
  LFS publicado pela API do Hugging Face (`/api/models/ggerganov/whisper.cpp/tree/main`) — os cinco bateram:

| modelo                | bytes         | sha256                                                             |
| --------------------- | ------------- | ------------------------------------------------------------------ |
| `base`                | 147 951 465   | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |
| `small-q5_1`          | 190 085 487   | `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb` |
| `small`               | 487 601 967   | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |
| `large-v3-turbo-q5_0` | 574 041 195   | `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` |
| `large-v3-turbo`      | 1 624 555 275 | `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69` |

### Áudio de teste (proxy otimista)

- **Nenhum áudio de cliente nem de pessoa real.** Texto original de logística (recado de motorista: doca, nota, canhoto,
  lacre, manifesto, diária; 832 palavras, sem números escritos em algarismo) falado por `say -v Luciana` (TTS pt-BR do
  macOS). Prefixos por frase para 10 s (36 palavras), 1 min (159), 2 min (315) e 5 min 17 s (833).
- Três variantes por duração, todas em **ogg/opus 24 kbit/s mono 48 kHz** (o que o `MediaRecorder` grava):
  - `clean` — a fala pura;
  - `noise` — ruído de cabine: ruído marrom (`anoisesrc=color=brown:amplitude=0.35`) + zumbido de motor de 90 Hz
    (`sine=frequency=90`, volume 0,12) + ruído rosa (`amplitude=0.08`), via `amix ... normalize=0,alimiter`;
    fala −14,9 dB RMS contra ruído −22,7 dB RMS ⇒ **SNR ≈ 8 dB**;
  - `fast` — `say -r 250` (fala ~55 % mais rápida que o padrão da voz).
- ⚠️ **TTS é proxy otimista:** dicção perfeita, sem sotaque, sem fala sobreposta, sem silêncio longo, sem o microfone
  do celular. O README do pacote registra loop de repetição de `small`/`base` **em áudio real de celular** — que este
  proxy não reproduziu. **A qualidade real em pt-BR com ruído de cabine continua risco aberto para a T6.3**, em staging,
  com áudio gravado no app com consentimento de quem fala.

### Comandos

```sh
# imagem do spike (Dockerfile no scratchpad: estágio Alpine compila whisper-cli; runtime = oven/bun:1.3.14-alpine
# + apk add ffmpeg libstdc++ libgomp time)
docker build -f Dockerfile.local -t spike-whisper-264:local .        # 61 s, compilação do whisper-cli incluída

# por modelo, os 12 áudios (o mesmo par de chamadas do pacote: ffmpeg → WAV 16 kHz mono, whisper-cli com as flags
# de createWhisperLocalTranscriber)
docker run --rm --cpus=8 --memory=8g -v audio:/audio:ro -v models:/models:ro ... spike-whisper-264:local \
  /scripts/bench.sh <modelo> 7 /audio /models /out <clips...>
#   bench.sh, por áudio:
#   /usr/bin/time -f "%e %M" ffmpeg -nostdin -loglevel error -i X.ogg -ar 16000 -ac 1 -y a.wav
#   /usr/bin/time -f "%e %M" whisper-cli --model ggml-<m>.bin --file a.wav --no-timestamps --language pt \
#     --max-context 0 --output-txt --output-file <saida> --threads 7

# erro de palavras: Levenshtein por palavra contra o texto-fonte, minúsculas, sem pontuação, hífen = espaço,
# "3"→"três" e "6"→"seis"; "maior repetição" = maior número de repetições consecutivas de um n-grama (1–8 palavras);
# "maior trecho perdido" = maior sequência do texto-fonte que sumiu da saída
python3 -I score.py audio out/local
```

A saída do `whisper-cli` foi medida **crua**, antes do `collapseRepetitions` do pacote — loop aqui é loop do modelo.

### Resultados por modelo (local, M3 disputado)

Fator de tempo real = (ffmpeg + whisper) ÷ duração. RSS = pico do processo `whisper-cli` (GNU `time %M`); o ffmpeg ficou
em 43–45 MB em todos.

| modelo                | áudio      | duração (s) | ffmpeg (s) | whisper (s) | fator de tempo real | RSS pico (MB) | erro de palavras | maior repetição | maior trecho perdido |
| --------------------- | ---------- | ----------: | ---------: | ----------: | ------------------: | ------------: | ---------------: | --------------: | -------------------: |
| `base`                | d010-clean |          14 |       0,19 |         1,7 |                0,14 |           283 |            8,3 % |               1 |                    1 |
| `base`                | d010-noise |          14 |       0,06 |         1,2 |                0,09 |           283 |            8,3 % |               1 |                    1 |
| `base`                | d060-clean |          60 |       0,17 |         4,3 |                0,07 |           288 |            7,5 % |               1 |                    1 |
| `base`                | d060-noise |          60 |       0,17 |         4,1 |                0,07 |           288 |           17,0 % |               1 |                    3 |
| `base`                | d120-clean |         120 |       0,50 |         8,4 |                0,07 |           294 |            4,8 % |               1 |                    1 |
| `base`                | d120-noise |         120 |       0,34 |        10,2 |                0,09 |           294 |           18,1 % |               1 |                   20 |
| `base`                | d120-fast  |          89 |       0,38 |         8,1 |                0,10 |           291 |            3,8 % |               1 |                    1 |
| `base`                | d300-clean |         317 |       1,28 |        24,3 |                0,08 |           312 |            9,2 % |               1 |                   35 |
| `base`                | d300-noise |         317 |       1,23 |        21,4 |                0,07 |           312 |           23,4 % |               1 |                   82 |
| `base`                | d300-fast  |         234 |       0,83 |        15,2 |                0,07 |           305 |           31,2 % |               1 |              **210** |
| `small-q5_1`          | d010-clean |          14 |       0,12 |         7,0 |                0,52 |           463 |            0,0 % |               1 |                    0 |
| `small-q5_1`          | d010-noise |          14 |       0,08 |         6,5 |                0,48 |           463 |           11,1 % |               1 |                    2 |
| `small-q5_1`          | d060-clean |          60 |       0,31 |        24,8 |                0,42 |           467 |            6,9 % |               1 |                    6 |
| `small-q5_1`          | d060-noise |          60 |       0,23 |        29,6 |                0,50 |           467 |            2,5 % |               1 |                    1 |
| `small-q5_1`          | d120-clean |         120 |       0,44 |        32,5 |            **0,27** |           473 |            3,5 % |               1 |                    6 |
| `small-q5_1`          | d120-noise |         120 |       0,66 |        33,4 |            **0,28** |           473 |            7,6 % |               1 |                    6 |
| `small-q5_1`          | d120-fast  |          89 |       0,93 |        31,4 |                0,36 |           470 |            2,2 % |               1 |                    3 |
| `small-q5_1`          | d300-clean |         317 |       1,36 |       122,7 |                0,39 |           498 |            4,3 % |               1 |                    6 |
| `small-q5_1`          | d300-noise |         317 |       1,32 |        72,7 |                0,23 |           496 |            6,6 % |               1 |                    6 |
| `small-q5_1`          | d300-fast  |         234 |       1,24 |        76,3 |                0,33 |           483 |            1,9 % |               1 |                    3 |
| `small`               | d010-clean |          14 |       0,11 |         6,7 |                0,50 |           753 |            0,0 % |               1 |                    0 |
| `small`               | d010-noise |          14 |       0,08 |         4,6 |                0,35 |           751 |            5,6 % |               1 |                    0 |
| `small`               | d060-clean |          60 |       0,22 |        14,7 |                0,25 |           754 |            6,3 % |               1 |                    6 |
| `small`               | d060-noise |          60 |       0,28 |        16,6 |                0,28 |           755 |            5,0 % |               1 |                    6 |
| `small`               | d120-clean |         120 |       0,49 |        31,7 |            **0,27** |           760 |            3,2 % |               1 |                    6 |
| `small`               | d120-noise |         120 |       0,43 |        43,0 |            **0,36** |           761 |            7,0 % |               1 |                    6 |
| `small`               | d120-fast  |          89 |       0,39 |        28,6 |                0,33 |           757 |            2,2 % |               1 |                    3 |
| `small`               | d300-clean |         317 |       1,78 |        67,7 |                0,22 |           779 |            4,1 % |               1 |                    6 |
| `small`               | d300-noise |         317 |       1,31 |        68,2 |                0,22 |           779 |            5,8 % |               1 |                    5 |
| `small`               | d300-fast  |         234 |       0,90 |        49,4 |                0,21 |           771 |            2,0 % |               1 |                    3 |
| `large-v3-turbo-q5_0` | d010-clean |          14 |       0,08 |        16,6 |                1,22 |           793 |            0,0 % |               1 |                    0 |
| `large-v3-turbo-q5_0` | d010-noise |          14 |       0,07 |        17,4 |                1,28 |           793 |            2,8 % |               1 |                    0 |
| `large-v3-turbo-q5_0` | d060-clean |          60 |       0,30 |        56,9 |                0,95 |           798 |            7,5 % |               1 |                    6 |
| `large-v3-turbo-q5_0` | d060-noise |          60 |       0,26 |        56,6 |                0,95 |           798 |            5,0 % |               1 |                    6 |
| `large-v3-turbo-q5_0` | d120-clean |         120 |       0,55 |        94,0 |            **0,79** |           805 |            7,6 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d120-noise |         120 |       0,99 |       132,9 |            **1,11** |           805 |            7,3 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d120-fast  |          89 |       0,56 |       132,6 |                1,50 |           802 |            1,6 % |               1 |                    3 |
| `large-v3-turbo-q5_0` | d300-clean |         317 |       2,11 |       373,4 |                1,18 |           827 |            6,6 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d300-noise |         317 |       1,20 |       222,5 |                0,70 |           827 |            6,6 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d300-fast  |         234 |       0,99 |       185,7 |                0,80 |           818 |            4,9 % |               1 |                   23 |
| `large-v3-turbo`      | d010-clean |          14 |       0,08 |        28,8 |                2,12 |         1 802 |            0,0 % |               1 |                    0 |
| `large-v3-turbo`      | d060-noise |          60 |       0,31 |        79,5 |                1,33 |         1 807 |            5,0 % |               1 |                    6 |
| `large-v3-turbo`      | d120-clean |         120 |       0,48 |       133,9 |            **1,12** |         1 814 |            7,3 % |               1 |                    8 |
| `large-v3-turbo`      | d120-noise |         120 |       0,48 |        94,1 |            **0,79** |         1 815 |            7,3 % |               1 |                   16 |
| `large-v3-turbo`      | d120-fast  |          89 |       0,33 |        78,8 |                0,89 |         1 810 |            1,6 % |               1 |                    3 |
| `large-v3-turbo`      | d300-noise |         317 |       1,55 |       251,1 |                0,80 |         1 836 |            6,6 % |               1 |                   16 |

(`base`: as variantes `d010-fast`/`d060-fast` deram 8,3 %/3,8 %, sem loop; `large-v3-turbo` só rodou seis áudios por
tempo de máquina — os mais longos e os com ruído.)

### Conferência à mão (amostra)

Diferenças palavra a palavra lidas uma a uma em `d120-clean`, `d120-noise`, `d300-noise` e `d300-fast`:

- **Nenhum loop** em nenhum modelo (maior repetição = 1). O modo de falha que apareceu foi outro: **janela engolida** —
  o decodificador troca 30 s de fala por uma alucinação curta ("música de fundo", "obrigada", "ouço").
  - `base` perdeu **210 palavras seguidas** em `d300-fast` (canhoto molhado, coleta, portaria, lacre — trocados por
    "música fundo ouço"), 82 em `d300-noise`, 20 em `d120-noise`; e troca termos do domínio ("ocorrência" →
    "opóvencia", "canhoto" → "outra nota", "carregada" → "acarrigada"). **Inútil para o caso.**
  - `large-v3-turbo` e `-q5_0` erram pouca palavra, mas **engolem frases inteiras** (16–23 palavras: "da última vez eu
    fiquei esperando quase a tarde inteira porque a carga não estava separada" → "obrigada"; "ele conferiu tudo, olhou
    o lacre" sumiu).
  - `small` e `small-q5_1` perdem no máximo 6 palavras (o mesmo trecho em todos os modelos, "enquanto isso eu vou
    adiantando a", fronteira de janela) e erram por **fonética**: "canhoto" → "canoto", "doca" → "dota", "porta" →
    "cota", "multa" → "luta", "almoxarifado" → "almocharifado/almoçarifado", "combino" → "convinho". Erros que um leitor
    corrige pelo contexto, com o áudio ao lado (183 D8) — mas "multa → luta" muda sentido.
- **Erro de palavras na amostra com ruído (SNR ≈ 8 dB):** `base` 17–23 %, `small-q5_1` 2,5–7,6 %, `small` 5,0–7,0 %,
  `large-v3-turbo(-q5_0)` 5,0–7,3 %. Com o proxy TTS, `small`/`small-q5_1` empatam com o turbo e não engolem frase.

### Canhoto ao lado (impacto na rotina vizinha)

Proxy de `trip.canhoto.read`: uma thread JS de CPU pura (`load.ts` com `bun`: laço sobre 256 KB + `sha256`, contando
operações/s — a decodificação do zxing roda numa única `worker_thread`), no mesmo contêiner de 8 CPUs, sozinha e durante
a transcrição de `d120-noise` com `--threads 7`:

| situação             | proxy do canhoto (op/s) | transcrição de 2 min |
| -------------------- | ----------------------: | -------------------: |
| sozinho (antes)      |                   541,4 |                    — |
| durante `small-q5_1` |           477,3 (−12 %) |  38,7 s (era 34,1 s) |
| durante `small`      |           482,7 (−11 %) |  35,3 s (era 43,4 s) |
| sozinho (depois)     |                   559,8 |                    — |

Com 7 threads de whisper em 8 CPUs a rotina vizinha perde ~11–12 % de vazão — não para. Medida em ARM disputado; no
Railway o impacto foi nulo (abaixo).

### Teto do serviço e RAM (critério iv)

- Worker (Railway, `get-service-metrics`, 168 h): **limite 8 vCPU / 8 GB** em staging e em produção; memória média
  0,20–0,22 GB, pico 0,47 GB (amostra de 60 s, produção) e 0,59 GB (amostra horária, staging). CPU média 0,04–0,06 vCPU.
- Teto de 70 % = 5,6 GB. Base do worker 0,6 GB + ffmpeg 0,05 GB + whisper: `base` 0,31 · `small-q5_1` 0,50 ·
  `small` 0,78 · `turbo-q5_0` 0,83 · `turbo` 1,84 GB ⇒ pior caso **2,5 GB = 31 %**. **Todos cumprem (iv)**, e um áudio
  por vez segura isso.

### Imagem e build (medidos localmente, arm64)

- Camada `apk add ffmpeg libstdc++ libgomp` sobre `oven/bun:1.3.14-alpine`: **107 MB** (descompactado); `whisper-cli`:
  **2,8 MB**; modelo: o tamanho do arquivo. Acréscimo à imagem do worker: `small-q5_1` ≈ **+291 MB**, `small` ≈ +598 MB,
  `turbo-q5_0` ≈ +684 MB, `turbo` ≈ +1,73 GB.
- Build do estágio do `whisper-cli` (clone raso + cmake, 11 CPUs): **61 s**. No builder do Railway: abaixo.

### Cadência do agendador

Não é medida, é o código: `JOB_TICK_INTERVAL_SECONDS = 300` (`apps/worker-transportada/src/shared/job-catalog.constant.ts:11`,
"nada corre mais fino que ela"), disparada pelo serviço `cron` com `cronSchedule: '*/5 * * * *'` — e o cron do Railway
não aceita menos de 5 min. **Cadência = 5 min**, caso previsto no plano § d ("se o agendador só der 5 min, a T0.2
registra e a spec aceita"). Latência no pior caso ≈ 5 min + fila + processamento.

### Leitura local (2026-10-11, só para registro)

Na medida local, `base` reprovou (ii) e os dois turbo ficaram com fator 0,79–1,50 em 2 min, o que levou à previsão de que
reprovariam (iii) no servidor. **A previsão estava errada:** a CPU do Railway é mais rápida que o M3 disputado (abaixo).
O candidato local era `small-q5_1`.

### Railway — medida no runner (2026-10-12)

**Serviço:** `spike-whisper-264` (id `38e8fa38-009d-40db-b402-33a4e74d9ca6`), criado vazio por `create-service` no
ambiente `staging` (`3cd99844…`) e implantado com `railway up --detach -p <projeto> -e <staging> -s <serviço>` a partir do
contexto do scratchpad (Dockerfile x86, `-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON`,
cinco modelos baixados no build com `sha256sum -c`, áudios TTS, `bench.sh`/`load.ts`/`run.sh`). Sem variável, sem
domínio, sem volume. O `update-service` (limites/restart) foi **negado** pela permissão, e não foi preciso: o serviço
nasceu com o mesmo teto do worker — `cpu.max=800000 100000` (8 vCPU) e `memory.max=8000000000` (8 GB), lidos do cgroup
no próprio contêiner.

- **Runner:** `Intel(R) Xeon(R) 6975P-C`, `nproc=48` visíveis, AVX2 e AVX-512 presentes (o binário usa só até AVX2).
- **Build:** upload às 13:01:09Z, `whisper-cli` compilado em **74 s** (13:01:30 → 13:02:44), modelos baixados e
  conferidos em paralelo (o maior terminou 13:02:17), exportação 28 s, push de **3,07 GB** (os cinco modelos) em **66 s**;
  build total **≈ 3 min 29 s**. Contêiner de pé às 13:05:18 — **≈ 40 s** de deploy depois do push.
- **Tamanho:** o push de 3 068 941 687 bytes leva os cinco modelos (2 706 MB); sem os quatro que não ficam, a imagem do
  spike seria ≈ 0,36 GB. No worker, o acréscimo é ffmpeg e libs (107 MB) + `whisper-cli` x86 (**4 MB**) + `small-q5_1`
  (**182 MB**) ≈ **+293 MB**.

| modelo                | áudio      | duração (s) | ffmpeg (s) | whisper (s) | fator de tempo real | RSS pico (MB) | erro de palavras | maior repetição | maior trecho perdido |
| --------------------- | ---------- | ----------: | ---------: | ----------: | ------------------: | ------------: | ---------------: | --------------: | -------------------: |
| `base`                | d010-clean |          14 |       0,08 |        1,00 |                0,08 |           284 |            8,3 % |               1 |                    1 |
| `base`                | d060-noise |          60 |       0,22 |        3,50 |                0,06 |           291 |           18,9 % |               1 |                    3 |
| `base`                | d120-clean |         120 |       0,40 |        6,05 |                0,05 |           297 |            5,7 % |               1 |                    2 |
| `base`                | d120-noise |         120 |       0,42 |        6,33 |                0,06 |           297 |           19,7 % |               1 |                   20 |
| `base`                | d120-fast  |          89 |       0,32 |        5,55 |                0,07 |           294 |            3,8 % |               1 |                    1 |
| `base`                | d300-noise |         317 |       1,06 |       14,58 |                0,05 |           316 |           29,4 % |               1 |               **84** |
| `small-q5_1`          | d010-clean |          14 |       0,08 |        3,35 |                0,25 |           467 |            0,0 % |               1 |                    0 |
| `small-q5_1`          | d060-noise |          60 |       0,24 |       10,93 |                0,19 |           471 |            2,5 % |               1 |                    1 |
| `small-q5_1`          | d120-clean |         120 |       0,43 |       20,27 |            **0,17** |           479 |            3,5 % |               1 |                    6 |
| `small-q5_1`          | d120-noise |         120 |       0,43 |       17,76 |            **0,15** |           481 |            7,6 % |               1 |                    6 |
| `small-q5_1`          | d120-fast  |          89 |       0,31 |       16,18 |                0,19 |           473 |            2,2 % |               1 |                    3 |
| `small-q5_1`          | d300-noise |         317 |       1,07 |       44,78 |                0,14 |           500 |            8,2 % |               1 |                   14 |
| `small`               | d010-clean |          14 |       0,08 |        3,33 |                0,25 |           750 |            0,0 % |               1 |                    0 |
| `small`               | d060-noise |          60 |       0,22 |       10,30 |                0,17 |           760 |            5,0 % |               1 |                    6 |
| `small`               | d120-clean |         120 |       0,41 |       20,24 |                0,17 |           761 |            3,2 % |               1 |                    6 |
| `small`               | d120-noise |         120 |       0,44 |       20,42 |                0,17 |           767 |            6,3 % |               1 |                    6 |
| `small`               | d120-fast  |          89 |       0,36 |       16,28 |                0,19 |           763 |            2,2 % |               1 |                    3 |
| `small`               | d300-noise |         317 |       0,98 |       43,69 |                0,14 |           784 |            5,9 % |               1 |                    5 |
| `large-v3-turbo-q5_0` | d010-clean |          14 |       0,08 |       11,19 |                0,83 |           801 |            0,0 % |               1 |                    0 |
| `large-v3-turbo-q5_0` | d060-noise |          60 |       0,22 |       33,39 |                0,56 |           807 |            5,0 % |               1 |                    6 |
| `large-v3-turbo-q5_0` | d120-clean |         120 |       0,42 |       57,54 |                0,48 |           816 |            7,6 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d120-noise |         120 |       0,44 |       59,19 |                0,50 |           815 |            7,3 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d120-fast  |          89 |       0,36 |       36,91 |                0,42 |           810 |            1,6 % |               1 |                    3 |
| `large-v3-turbo-q5_0` | d300-noise |         317 |       1,03 |      128,10 |                0,41 |           835 |            6,7 % |               1 |                   16 |
| `large-v3-turbo`      | d010-clean |          14 |       0,08 |       10,82 |                0,80 |         1 801 |            0,0 % |               1 |                    0 |
| `large-v3-turbo`      | d060-noise |          60 |       0,22 |       32,68 |                0,55 |         1 816 |            5,0 % |               1 |                    6 |
| `large-v3-turbo`      | d120-clean |         120 |       0,44 |       53,77 |                0,45 |         1 823 |            7,3 % |               1 |                    8 |
| `large-v3-turbo`      | d120-noise |         120 |       0,40 |       55,14 |                0,46 |         1 823 |            7,3 % |               1 |                   16 |
| `large-v3-turbo`      | d120-fast  |          89 |       0,34 |       37,23 |                0,42 |         1 811 |            1,6 % |               1 |                    3 |
| `large-v3-turbo`      | d300-noise |         317 |       1,09 |      122,76 |                0,39 |         1 845 |            6,6 % |               1 |                   16 |

Os textos voltaram no log do serviço (só a transcrição do TTS de logística, sem dado pessoal) e foram pontuados com o
mesmo `score.py`. Conferência à mão do `small-q5_1` em `d300-noise` no x86: os 14 de "maior trecho perdido" são uma frase
("quando eu terminar aqui eu mando uma nova mensagem com as fotos dos paletes") — a mesma perda de janela que o local
tinha mostrado em outro trecho; o resto são as trocas fonéticas já listadas ("a kia", "vim impedir", "a parma se
aperdiu").

**RAM pelo Railway** (`get-service-metrics`, amostra de 30 s, janela do spike): pico **2,20 GB** — durante o
`large-v3-turbo` (1,85 GB de RSS + ffmpeg + cache das páginas do modelo); média 0,36 GB. CPU pico 10,1 (amostra que
estoura o teto por arredondamento da janela), média 2,05 na janela de 1 h.

**Canhoto ao lado no runner** (mesmo `load.ts`, 1 thread JS, enquanto a transcrição de 2 min com ruído usa 7):

| situação                      | proxy do canhoto (op/s) | transcrição de 2 min |
| ----------------------------- | ----------------------: | -------------------: |
| sozinho                       |                   494,4 |                    — |
| durante `small`               |            492,7 (−0 %) |  21,3 s (era 20,9 s) |
| durante `large-v3-turbo-q5_0` |            489,4 (−1 %) |  59,6 s (era 59,6 s) |
| durante `large-v3-turbo`      |            494,2 (−0 %) |  54,8 s (era 55,5 s) |

Com 7 + 1 threads dentro de 8 vCPU, **nenhuma das duas perde vazão mensurável** no runner. (`small-q5_1` não entrou no
par simultâneo; o `small` tem o mesmo custo de CPU, 20,2 vs 20,3 s em 2 min.)

### Decisão pelo critério fechado (medida no Railway)

| modelo                | (i) loop | (ii) erro de palavras (amostra conferida)                 | (iii) fator ≤ 1 em 2 min | (iv) RAM + base ≤ 70 % (5,6 GB) |
| --------------------- | -------- | --------------------------------------------------------- | ------------------------ | ------------------------------- |
| `base`                | nenhum   | **reprova** — 18,9–29,4 % com ruído, 84 palavras perdidas | 0,05–0,06                | 0,97 GB — ok                    |
| `small-q5_1`          | nenhum   | **2,5–8,2 %**, perda ≤ 14 palavras                        | **0,15–0,17**            | **1,15 GB (14 %)** — ok         |
| `small`               | nenhum   | 3,2–6,3 %, perda ≤ 6                                      | 0,17                     | 1,43 GB — ok                    |
| `large-v3-turbo-q5_0` | nenhum   | 5,0–7,6 %, engole frases (16)                             | 0,48–0,50                | 1,49 GB — ok                    |
| `large-v3-turbo`      | nenhum   | 5,0–7,3 %, engole frases (8–16)                           | 0,45–0,46                | 2,50 GB — ok                    |

**Escolhido: `small-q5_1`** — o menor que cumpre os quatro. `base` é menor e não cumpre (ii). Erro de palavras aceito
para a amostra: **≤ 8,2 %** com ruído de cabine ~8 dB, sem loop e sem janela engolida acima de uma frase. Reserva medida,
se a T6.3 com áudio real reprovar o `small-q5_1`: `small` (mesmo custo de CPU, +0,28 GB) e depois `large-v3-turbo-q5_0`
(fator ~0,5, +0,33 GB) — os dois cabem no worker sem mudar plano. Trocar é mudança de imagem com nova medida (ADR).

**Dimensionamento que sai da medida** (plano § d):

- Teto de duração **mantido em 10 min**. Pior caso no runner: 10 min × 0,17 ≈ **102 s** por áudio.
- `AUDIO_TRANSCRIPTION_TIMEOUT_MS`: **300000** (≈ 3× o pior caso medido, para a CPU disputada com o resto do worker).
- `AUDIO_TRANSCRIPTION_BATCH_SIZE` **2** (padrão do plano): 2 × 102 s ≈ 3,4 min < o ciclo de 5 min.
- `AUDIO_TRANSCRIPTION_THREADS` **7** (vCPU − 1, como medido). Worker **sem mudança de plano**: 8 vCPU / 8 GB.
- Cadência: **5 min** (o agendador, acima). Latência típica de um áudio de 1 min: até 5 min de espera + ~11 s.

**Custo do spike:** o serviço viveu ~27 min (13:01 → 13:28Z). Pela média da janela de 1 h, ≈ 123 vCPU-min e ≈ 21 GB-min ⇒
pela tabela pública do Railway (US$ 0,000463/vCPU-min, US$ 0,000231/GB-min) ≈ **US$ 0,06** (estimativa; confere na
fatura). **Custo de operação:** só durante a transcrição — ~0,17 min de 7 vCPU por minuto de áudio ≈ **US$ 0,0006 por
minuto de áudio** pela mesma tabela, e +0,5 GB só enquanto o processo filho roda; zero por uso fora disso.

**Remoção:** `delete-service` às ~13:28Z (resposta: `detachedVolumes: []`). Conferido depois com `describe-environment`
(staging: nenhum serviço `spike-whisper-264`, nenhum volume órfão, `staged: null`) e `list-services` (os mesmos 23 serviços
de antes). Nenhum domínio foi gerado, nenhuma variável escrita, nenhum serviço existente tocado, produção intocada.

### O que NÃO foi medido, e por quê

1. **Áudio real** (voz humana, sotaque, celular, cabine de verdade): proibido usar áudio de cliente e não há gravação
   consentida ainda. Fica para a **T6.3** em staging; é lá que o aviso do README do pacote sobre loop em `small` com áudio
   de celular se confirma ou cai. O TTS é **proxy otimista**: o erro real em pt-BR com ruído continua risco aberto.
2. **`small-q5_1` simultâneo ao canhoto no runner:** o par rodou com `small`, `turbo-q5_0` e `turbo`; o `small-q5_1` tem
   o mesmo custo de CPU do `small` no runner.
3. **Imagem só com o modelo escolhido** no Railway: o push mediu a imagem com os cinco modelos; o acréscimo do worker é
   calculado pelas camadas (+293 MB), não empurrado.
4. **Volume do Railway como alternativa à imagem** (plano § d): a imagem com o modelo dá deploy de ~40 s e push de ~66 s
   para 3 GB — com +293 MB não há ganho que justifique o risco de boot sem modelo; não medido.
5. **Disputa com a planta do baú e a prévia da carga** (outras rotinas de CPU do worker): só o proxy do canhoto foi medido.
6. **`--threads` diferente de 7:** não variado.
7. **Mac nativo com `/usr/bin/time -l`:** substituído pelo GNU `time` dentro do contêiner Alpine (a base do worker); o
   `whisper-cli` do Homebrew usa Metal e mediria a GPU do laptop.

## T2.1 — schema e migration da transcrição

Migration `apps/api-transportada/drizzle/20261012140238_conversation_audio_transcription/` (`migration.sql`,
`rollback.sql`, `snapshot.json`), após `20261010103500_quick_reply_driver_audience`. Schemas em
`src/database/occurrence-conversation-audio-transcription.schema.ts` e `company-audio-transcription-settings.schema.ts`;
constantes em `src/shared/conversation-audio-transcription.constant.ts`; índice parcial
`occurrence_conversation_attachments_audio_created_idx` em `occurrence-conversation.schema.ts`.

Testes escritos antes (vistos vermelhos no primeiro `bun test`: importavam os schemas ainda inexistentes), e depois verdes:

- `test/occurrence-conversation-schema/audio-transcription.contract.ts` (FKs com `company_id`, únicos, índices, lista de
  status sem `disabled`/`purged`, códigos de falha da RF14 + `company_disabled`, CHECK de 20 000 `char_length`, nomes ≤ 63 bytes);
- `test/database-migration/conversation-audio-transcription.static.contract.ts` (aditiva, sem ENUM, um único índice novo em
  anexos, identificadores ≤ 63 bytes, rollback com ordem e guarda de `ROW_COUNT`);
- `test/database-migration/conversation-audio-transcription.assertion.ts` (no banco: 1 transcrição por anexo; 20 000 code
  points aceitos e 20 001 recusados, emoji incluso; `disabled` e `purged` recusados em `status`; código fora da lista
  recusado; cada um dos 9 códigos aceito; `too_long` amarrado ao teto; `ready` exige `generated_at`; empresa inexistente
  recusada por FK; uma configuração por empresa). Cada caso roda numa transação que volta; nada sobra para o rollback.
- Registrados em `test/occurrence-conversation-schema.contract.test.ts`, `test/database-migration.contract.test.ts`,
  `test/database-migration/static-migration.contract.ts` (cadeia) e `test/database-migration/database-migration.integration.ts`
  (assertion + tabelas antes e depois do rollback/reaplicação), com `CONVERSATION_AUDIO_TRANSCRIPTION_TABLES` em `support.ts`.

Comandos e saídas (worktree `transportada-wt/spec-260`, 2026-10-12):

- `bun run db:generate -- --name conversation_audio_transcription` → `drizzle/20261012140238_conversation_audio_transcription/migration.sql`
  gerada pelo drizzle-kit; SQL customizado (header e comentários) acrescentado à mão, CHECKs e índice parcial sem alteração.
- `bun run db:generate` (depois) → `{"status":"no_changes"}`.
- `bun run db:check` → `Everything's fine`.
- `bun run typecheck` (`tsc --noEmit`) → sem erros.
- `bun run lint` (`eslint src test drizzle.config.ts eslint.config.js --max-warnings=0`) → sem saída, exit 0.
- `prettier --check` nos arquivos tocados → `All matched files use Prettier code style!` (snapshot.json fica fora, por
  `.prettierignore`).
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo da API) → `11427 pass, 25 skip, 0 fail`
  (208 arquivos, 11452 testes). Os 25 skip são os de integração sem `DRIZZLE_TEST_DATABASE_URL` neste comando.
- `make migration-test` (raiz) → 1ª rodada `203 pass, 1 fail`: `readBusinessTables` (support.ts) tem lista própria de filtro e
  não conhecia as tabelas novas; corrigido. 2ª rodada → `204 pass, 0 fail`, exit 0, rollback e reaplicação incluídos.

Divergências e interpretações (contract.md §5.5):

- **`purged` não é status.** §5.5 fixa `status` em `pending|ready|failed`; o plano § c (linha 112) e a tabela do
  contrato (linha 373) ainda citam `purged`. Adotado §5.5: expurgo = `ready` com `text is null` e `generated_at`
  preservado (o mapper trata `ready` sem texto como ausente). Quem implementar T2.2/T3.x deve seguir isso.
- **CHECKs do plano que o §5.5 não repete, mantidos:** `failed` exige `failure_code`; `ready` ⇔ `generated_at`;
  `audio_duration_ms > 0` quando houver.
- **Nomes curtos:** FKs, únicos e checks foram nomeados à mão para caber em 63 bytes (o Drizzle geraria nomes longos
  que o Postgres trunca ou troca por hash). Testado.
- **`updated_by_user_id` sem FK**, como o calendário (registrado no arquivo do schema).

## T2.2 — mapper `toParticipantTranscription`, tabela espelhada e paridade (2026-10-12)

- **Documentos alinhados (commit docs separado `aaab51dcf`):** `purged` não é status. `plan.md` § c (linha 112) e a
  tabela do `contract.md` §5.2 (linha 373) passaram a `ready` sem texto (expurgado) ⇒ ausente; também corrigidas as
  menções do worker (`plan.md` § d, `contract.md` §5.6 passos 5 e 7, `tasks.md` T2.2/T3.3).
- **Código:** `occurrence-conversation/domain/participant-transcription.{constant,types,mapper}.ts`.
  `toParticipantTranscription({ row, isEnabled })` (objeto, code-standart §10) e `resolveAudioDurationMs`. **Não ligado às rotas**
  (T2.3).
- **Paridade:** `@adatechnology/conversation-contracts` `0.6.0` exato em `devDependencies` da API (`bun install`; `bun.lock`
  atualizado; as outras apps seguem em `0.5.0`, com cópia própria no lock). `test/occurrence-conversation/participant-transcription.contract.ts`
  parseia cada saída do mapper com `participantTranscriptionSchema` e `participantAttachmentSchema` e exige que o parse devolva
  o mesmo objeto (o schema é _strip_, então perda seria visível). Segunda cópia de zod (^3 do pacote × 4.4.3 da API) só em
  `test/**`.
- **Texto de fonte:** `participant-transcription-source.contract.ts` — nenhum `src/**` importa o pacote (estático, dinâmico
  ou `require`); está em `devDependencies` na versão exata e fora de `dependencies`.
- **Ouro das rotas antigas:** os três serializadores antigos (`read-occurrence-conversations`, portal, motorista antigo) não
  citam `transcription`/`durationMs`; `signConversationAttachments` e a leitura antiga com anexo de áudio que tem `duration_ms`
  saem byte a byte com os cinco campos.
- **Mutação (todas reprovam):** `ready` sem texto devolvido como ready vazio (1 fail); `language` nulo passando (10);
  texto sem corte (3); `purged` voltando como status (3); corte partindo par substituto (1); import do pacote em `src/**`
  (1); campo novo no anexo antigo (4). Mapper e serviço restaurados depois de cada uma.
- **Gates (apps/api-transportada):** `bun run typecheck` limpo · `bun run lint` limpo (`--max-warnings=0`) ·
  `bun --env-file=../../.env.test test --timeout 120000` → **11489 pass, 25 skip, 0 fail** · `bun run db:check` "Everything's fine".
- **Divergências do contrato:**
  1. `contract.md` §5.2 (linha 372) dizia `failed` com outro código ⇒ `{ status: 'failed' }`; a task manda **ausente**.
     Adotado ausente e a linha da tabela foi corrigida. Para o leitor é equivalente (só o player), e não vaza que houve falha
     que a tela não distingue.
  2. `failed/too_long` com `maxDurationMs` nulo ou não inteiro positivo também sai ausente (o CHECK da T2.1 impede no banco).
  3. A tabela do contrato dava `toParticipantTranscription(row | undefined, enabled)`; a assinatura é por objeto (§10 do code-standart).
  4. Os testes de contrato foram escritos junto do mapper, não antes: a prova de que eles pegam o defeito é a mutação acima.

## T2.3 — leitura em lote nas rotas por assunto e `transcriptionUpdatedAt` (2026-10-12)

- **Código:** `application/conversation-transcription.port.ts` (porta de leitura + `SubjectAttachmentView`),
  `application/conversation-audio-enrichment.service.ts` (etapa separada, depois de `signConversationAttachments`, nos quatro casos de uso),
  `infrastructure/conversation-transcription.query.ts` (3 leituras em lote, na transação do assunto; o office reaproveita as do motorista),
  `infrastructure/conversation-transcription-write.query.ts` (escrita mínima com `updated_at = now()` do banco, usada pelos testes e pela T3.x).
  `ConversationAttachmentRecord` ganhou `durationMs?` (a leitura antiga seleciona a coluna a mais, mas a view assinada segue com cinco campos).
  `toSubjectConversationSummary(row, officeReadAt?, transcriptionUpdatedAt?)` (lista e `/open` do motorista).
- **Consultas por página (Postgres real, `driver-subject-conversation-transcription.integration.ts`):** mensagens sem áudio **7**;
  com 1, 10 e 30 áudios (todos com linha) **9, 9, 9** (+1 configuração, +1 linhas); empresa desligada **8** (a das linhas não roda). Lista de
  conversas do motorista: **5 → 6** com 1, 10 e 30 (`driver-subject-conversation-scale`, ajustado de propósito: a agregação `transcriptionUpdatedAt`
  é a 6ª, em lote, sem junção).
- **Integração (0 fail, nada pulado):** estados do contrato (ready/pending/too_long/expurgado/`engine_failed`/sem linha) e `durationMs` com reserva da
  medida do worker; anexo de imagem com `duration_ms` não ganha campo; `disabled` com empresa desligada **sem nenhuma linha**, e com linha pronta o texto
  não vaza; `transcriptionUpdatedAt` ausente → presente (pending) → **maior** após `pending → ready` → igual sem escrita (lista e `/open`);
  eco de `send` (escritório) e `reply` (motorista) com áudio real; BOLA (outra empresa, outra viagem da mesma empresa, id de anexo e de conversa
  alheios consultados pela empresa errada voltam vazios).
- **Contrato (fakes):** `conversation-audio-enrichment.contract.ts` — 0 consultas sem áudio, 2 com áudio (1, 10, 30) só com ids de áudio e a empresa do
  contexto, 1 se desligada, não-áudio intocado; texto de fonte: só os 4 casos de uso importam a etapa (depois de assinar), `signConversationAttachments`
  não cita os campos, todo `.set({...})` da escrita leva `` updatedAt: sql`now()` ``.
- **Mutação (todas reprovam, arquivos restaurados e conferidos com `cmp`):** N+1 (consulta por anexo) → 1 fail (contagem); junção que perde `enabled`
  → 2 fail; `updated_at` não gravado → 2 fail (contrato de fonte + `transcriptionUpdatedAt` não muda); campo vazando para não-áudio → 6 fail; campo
  vazando em `signConversationAttachments` (rota antiga) → 4 fail.
- **Gates (apps/api-transportada):** `bun run typecheck` limpo · `bun run lint` limpo (`--max-warnings=0`) ·
  `bun --env-file=../../.env.test test --timeout 120000` → **11502 pass, 25 skip, 0 fail** (11527 testes; antes 11489 pass + 25 skip = 11514) ·
  integração dos 10 arquivos tocados/vizinhos → 45 pass, 0 fail · `bun run db:check` "Everything's fine".
- **Divergências / observações:**
  1. O alvo "≥11514 pass" é pass+skip: a base da T2.2 já era 11489 pass + 25 skip; esta task soma 13 pass.
  2. Os testes foram escritos junto da implementação, não antes: a prova de que pegam o defeito é a mutação acima.
  3. `contract.md` §5.2 lista `reply`/`send` como casos de uso de **mensagem**; o `open` só ganhou o `transcriptionUpdatedAt` do resumo (§5.3), não anexos.
  4. As duas suítes novas entraram na lista explícita `test:integration` do `package.json` (a lista é explícita).
  5. Os fakes de porta das três suítes de contrato ganharam `...NO_TRANSCRIPTIONS` (`test/fixtures/no-transcription.fixture.ts`), porque a porta nova é obrigatória.

## T2.4 — `GET/PUT /v1/company-settings/audio-transcription` (2026-10-12)

- **Código (`apps/api-transportada/src/companies/`):** `application/audio-transcription-settings.{port,use-case}.ts`,
  `infrastructure/drizzle-audio-transcription-settings.repository.ts`, `presentation/audio-transcription-settings.{routes,schema}.ts`,
  `domain/audio-transcription.constant.ts`; rota em `API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH` e em `main.ts`; lock por empresa
  `acquireAudioTranscriptionLock`; `AUDIO_TRANSCRIPTION_MAX_DURATION_MS` no schema de env (padrão 600000, `.env.example`, `ApiEnvironment`).
- **Comportamento:** `settings.manage` escopo company; corpo `{enabled}` `.strict()` (400 com todos os erros, `INVALID_REQUEST`);
  transação com lock consultivo + `select … for update` + `insert … on conflict do update`, `now()` do banco em `updated_at`/`enabled_since`;
  auditoria (`company-audio-transcription.changed`, antes/depois `{enabled}`, `metadata.ipAddress`, `correlationId`) **só se o valor muda**;
  religar regrava `enabled_since`; `routine_started_at` nunca é tocado; desligar não toca nas linhas de transcrição.
- **Contrato:** `test/companies/audio-transcription-settings.contract.ts` (24 casos: corpo estrito, ator/IP/correlação, BOLA, lista branca,
  tabela de rotas, 403 por papel, texto de fonte do repositório, env). **Integração (Postgres real, 6 casos, 0 pulado):** `GET` sem linha ligado
  e sem gravar; primeiro `PUT` cria a linha + 1 auditoria; mesmo valor não audita nem muda `updated_at`; religar regrava `enabled_since` e mantém
  `routine_started_at`; 3 `PUT` concorrentes → 1 linha e 1 auditoria; outra empresa não lê nem escreve.
- **Mutação (todas reprovam, arquivos restaurados e conferidos com `cmp`):** auditar sem mudança → 3 fail; religar sem regravar `enabled_since` → 1;
  `companyId` do corpo → 1; `.strict()` removido → 3; sem lock consultivo → 2 (incl. a concorrência); sem `FOR UPDATE` → 1 (só o teste de fonte).
- **Limite documentado:** o teste de concorrência **não distingue** o `FOR UPDATE` — o lock consultivo já serializa as escritas (é o que cobre a
  linha inexistente). O `FOR UPDATE` fica como defesa em profundidade, preso pelo texto de fonte.
- **Gates (apps/api-transportada):** `bun run typecheck` limpo · `bun run lint` limpo · `bun --env-file=../../.env.test test --timeout 120000` →
  **11522 pass, 25 skip, 0 fail** (11547 testes; antes 11502+25) · integração dos 11 arquivos (45 vizinhos + a nova + `server`/`auth-me`) → 49 pass,
  0 fail, 0 pulado · `bun run db:check` "Everything's fine". Nenhuma migration nova.
- **Divergências do contrato:**
  1. `contract.md` §5.1 diz que o `PUT` "faz upsert"; sem linha e `enabled: true` o valor já é o atual, então **nada é gravado** (nem linha, nem auditoria):
     é a leitura literal de "PUT igual ao atual: nada muda, nada audita" e mantém `updatedAt: null` "enquanto nenhuma pessoa mudou". A linha nasce no primeiro `PUT enabled:false`.
  2. O contrato nomeia `AUDIO_TRANSCRIPTION_MAX_DURATION_MS` "no schema de env da API"; entrou com `min 1000`/`max 3600000` e vazio = padrão. A linha em `.railway/railway.ts` (mesmo valor do worker) fica para a T3.2, que cria a variável do worker.
  3. Os testes foram escritos junto da implementação, não antes (como nas T2.2/T2.3): a prova de que pegam o defeito é a mutação acima.

## T2.5 — documentação da API (2026-10-12)

- **Criado:** `api-contract.md` nesta pasta (estado implementado até a T2.4, conferido contra o código: rotas reais, campos, erros, auditoria, custo medido na T2.3, ordem de publicação).
- **Acrescentado:** `docs/ai-context/api-transportada.md`, seção "Contrato da conversa por assunto e configuração da transcrição (spec 264 T2.4–T2.5)". A seção da T2.3 não foi repetida.
- **Gates:** `bunx prettier --check` nos dois `.md` → ok; `bun run format:check` na raiz → "All matched files use Prettier code style!".
- **Divergências do que o código sustenta:**
  1. O pedido falava em `/v1/company-settings/audio-transcription` e nas rotas por assunto com `/v1`. O código não tem esse prefixo: `API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH = '/company-settings/audio-transcription'` e o `main.ts` monta os módulos sem `basePath` (só notificação, usuário e portal agregado têm base própria). O `api-contract.md` documenta os caminhos reais. O `/v1` da T2.4 em `tasks.md` continua como está (é texto de tarefa, não foi reescrito).
  2. `pending`, `ready` e `failed/too_long` não são gravados por nenhum caminho de produção nesta branch (`insertPendingTranscription` e `writeExposedTranscription` só têm chamadas em testes). O documento diz isso em §0.
  3. Não foi tocado `apps/api-transportada/CLAUDE.md`, que o `tasks.md` T2.5 também cita como "núcleo". O pedido listou só `api-contract.md` e `docs/ai-context/api-transportada.md`; fica pendente se for desejado.
- **Sem alteração de código, teste ou migration.**

## T3.1 — cópia por valor no worker + contrato de paridade

Commit do código: `a859b255d` (`feat(264)`), em `work/spec-264`.

Arquivos (cópia por valor da API, só colunas e constantes; CHECK, FK e índice ficam na API):

- `apps/worker-transportada/src/database/occurrence-conversation-audio-transcription.schema.ts` (20 colunas, espelho de
  `apps/api-transportada/src/database/occurrence-conversation-audio-transcription.schema.ts`).
- `apps/worker-transportada/src/database/company-audio-transcription-settings.schema.ts` (6 colunas).
- `apps/worker-transportada/src/shared/conversation-audio-transcription.constant.ts` (status, códigos de falha, teto de
  20 000 code points, teto de duração padrão; espelho da constante da API).
- Contrato: `apps/worker-transportada/test/occurrence-conversation/audio-transcription-schema-parity.contract.ts`, ligado ao
  entrypoint existente `test/occurrence-conversation.contract.test.ts` (já na lista do `package.json`).

Paridade: colunas da cópia iguais às da API linha a linha (igualdade exata das listas extraídas); nome da tabela e colunas
que o worker grava/lê conferidos por `getTableConfig`; constantes comparadas código a código sem comentários.

Mutação (aplicada e revertida):

- `leaseToken: uuid('lease_token')` → `uuid('lease_tokn')` na cópia do worker: 2 falhas (igualdade de colunas e presença de
  `lease_token`).
- `AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS = 20_000` → `20_001` na cópia do worker: 1 falha (paridade das constantes).

Gates (worker, primeiro plano):

- `bun run typecheck` → exit 0.
- `bun run lint` → exit 0.
- `bun run test` (script do `package.json`) → antes: 2333 pass, 0 fail, 103 arquivos; depois: 2337 pass, 0 fail, 103 arquivos.
- `prettier --check` nos cinco arquivos tocados → exit 0.

Ordem: os arquivos da cópia foram escritos antes do contrato, e não o contrato visto vermelho antes da implementação. A
prova de que o contrato reprova veio pela mutação acima.

Sem alteração de API, tabela, coluna ou migration. Divergências: nenhuma entre cópia e API no momento do teste.

## T3.2

Porta, gateway do motor local, ambiente e sonda de duração no worker. Sem rotina, sem `main.ts` (T3.4), sem binário
real do whisper, sem rede.

Pacote: `@adatechnology/audio-transcription-provider` **0.1.0** (versão exata; npm `latest`, licença MIT, repositório de
bibliotecas do dono; `bun.lock` atualizado, `README`/fonte do `origin/main` conferidos contra o `dist` instalado). API
real usada: `createWhisperLocalTranscriber` de `.../whisper-local` com `{ modelPath, binaryPath, threads, timeoutMs,
languageHint }` (`ffmpegPath` fica no padrão), `AudioTranscriber.transcribe({ buffer, mimeType, languageHint })` →
`{ text, engine, language? }`, e as classes `TranscriptionError`, `TranscriptionRateLimitError`,
`TranscriptionUnsupportedError`, mais `isRetriableTranscriptionFailure`.

Arquivos (`apps/worker-transportada/src/conversation-audio-transcription/`): `speech-to-text.port.ts`,
`speech-to-text.error.ts` (`SpeechToTextError { kind, code }`, mensagem = só o código, sem `cause`),
`speech-to-text-error.classifier.ts` (tabela), `whisper-local-speech-to-text.gateway.ts`, `audio-duration-probe.port.ts`,
`ffprobe-audio-duration-probe.gateway.ts`, `run-command-with-timeout.ts` (`Bun.spawn` + `kill` no prazo, injetável),
`audio-transcription-configured.policy.ts` (`isAudioTranscriptionConfigured`), `audio-transcription-engine.constant.ts`.
Ambiente: `src/config/audio-transcription-environment.schema.ts` (encaixado no schema; `environment.audioTranscription`
só existe com `AUDIO_TRANSCRIPTION_MODEL_PATH`), tipo em `src/shared/worker.types.ts`, linhas no `.env.example`.

Classificação (`{ kind, code }`, nunca a mensagem): rate limit → retriável `engine_failed`; `TranscriptionUnsupportedError`
→ definitivo `unsupported_format`; erro cuja `cause.killed === true` (prazo do `execFile`, inclusive a conversão que o
pacote marca como não retriável) → retriável `engine_timeout`; `TranscriptionError` retriável → `engine_failed`; não
retriável (binário ausente) → definitivo `engine_failed`; erro desconhecido → retriável `engine_failed` (limite: 3
tentativas, como o pacote e a D8); áudio vazio → definitivo `empty_audio` antes de chamar o motor. Sonda: `ffprobe`
15 s; sem duração no cabeçalho, `ffmpeg -t <teto+1 s> -f null` 60 s lendo `out_time_us`; prazo → retriável
`engine_timeout`; `ffprobe`/`ffmpeg` recusa o arquivo → definitivo `unsupported_format`; saída sem tempo ou binário
ausente → definitivo `engine_failed`.

Contrato: `test/audio-transcription-engine.contract.test.ts` (na lista do `package.json`) → 42 testes: tabela de erros e
ausência da mensagem, ambiente (padrões, vazio = padrão, limites, modelo ausente), gateway com transcritor falso
(config repassada, dica, vazio, aborto), sonda com executor falso e o executor real contra `sleep`/`echo`.

Mutação (aplicada e revertida): copiar `error.message` para a falha → 4 falhas; rate limit retriável → definitivo → 1
falha; ignorar o timeout da sonda → 2 falhas; erro desconhecido retriável → definitivo → 3 falhas. Base: 42 pass.

Gates (worker, primeiro plano): `typecheck` exit 0; `lint` exit 0; `test` → 2379 pass, 0 fail, 104 arquivos (antes 2337);
`build` exit 0; `prettier --write` nos arquivos tocados.

Divergências: (1) plano § d dá `AUDIO_TRANSCRIPTION_THREADS` = vCPU − 1 (mínimo 1), não 7 fixo — segui o plano
(`availableParallelism() - 1`). (2) `AUDIO_TRANSCRIPTION_RECOVERY_WINDOW` é inteiro em **horas** (1 a 720, padrão 72), como
`FLEET_VEHICLE_CATALOG_CACHE_HOURS`; o contrato não fixa a unidade. (3) §5.8 pede abortar o filho por `AbortSignal`, mas o
pacote 0.1.0 não aceita sinal: o aborto só solta quem espera e o filho termina no `timeoutMs` do motor — a soltura graciosa
da T3.4 devolve a tentativa mesmo assim. (4) §5.6 não diz o que fazer com saída ilegível da medida: decidi definitivo
(`engine_failed`), porque repetir não conserta arquivo corrompido. (5) O pacote não distingue "áudio vazio" nem "prazo" por
classe: o vazio é barrado no gateway e o prazo é lido de `cause.killed`.

## T3.3 — contratos e integração da rotina de transcrição (2026-10-12)

Arquivos de teste (`apps/worker-transportada/test/`): `conversation-audio-transcription.contract.test.ts` (entrypoint, na
lista do `package.json`) → `conversation-audio-transcription/{text-policy,line-processing,line-logging,runner,cycle,
job-run-isolation,wiring}.contract.ts` (51 testes); `integration/conversation-audio-transcription.integration.ts` (18
testes, Postgres real, na lista do `test:integration`); dublês em `fixtures/audio-transcription-{harness,graph}.fixture.ts`
(fila em memória com a semântica de posse, transcritor que só termina quando o teste solta, sonda, leitor de objeto,
relógio, captura de log; e o grafo SQL empresa → conversa → mensagem → objeto → anexo).

Ordem honesta: o contrato foi escrito **depois** do primeiro rascunho da implementação (no mesmo ciclo), não antes; o
vermelho foi provado por **mutação** (abaixo), não por ausência de código. Cada comportamento da lista da T3.3 tem teste:
marco/janela/`PUT` antes da rotina sem backfill, `on conflict do nothing`, duas execuções concorrentes (só a dona do
`lease_token` grava), backoff 1/5 min e `attempts_exhausted` na 3ª, definitivo, `too_long` (`duração >= teto`) sem chamar o
transcritor, `company_disabled` fora do alerta (log `info`, não `error`), `sha256_mismatch`, `object_missing`, expurgo
(`ready` sem texto, `generated_at` preservado), nenhum texto/mensagem de erro/`process.env` em log, reivindicação filtra
`attempts < 3`, varredura fecha `attempts >= 3` com lease vencido (três reivindicações com lease vencido → varredura →
`attempts_exhausted`; lease vivo da 3ª tentativa **não** é varrido), lease por linha, U+0000, timeout de sonda retriável,
`updated_at` maior após `ready`/varredura/expurgo, e o isolamento do consumidor serial (invólucro `createJobCycle` de
verdade): com o transcritor preso, o ciclo de `conversation.audio.transcribe` fecha `completed`, o de `trip.canhoto.read`
publicado depois fecha `succeeded` antes de a transcrição terminar, e um segundo ciclo fecha `already_running` (desfecho
conhecido, não `unexpected_error`); o ciclo seguinte grava `processed/ready/...` da execução anterior.

Mutação (aplicada e revertida; contrato + integração): reivindicar sem `attempts < 3` → 2 falhas; gravar `ready` sem
`lease_token` → 1; `release` sem devolver tentativa → 1; `start()` ignorando a trava → 3; `close()` sem soltar a linha →
1; logar o texto → 2; `too_long` chamando o transcritor antes → 7; `>` no lugar de `>=` → 1; U+0000 não removido → 2;
`company_disabled` no alerta → 1; backoff sempre 1 min → 2; erro do laço sem captura → 1.

SQL por ciclo: **6** instruções (marco = 2 [insert das empresas sem linha + update do `routine_started_at` nulo],
varredura de esgotados, descoberta, expurgo, contagem de reivindicáveis). Por linha: **2** (reivindicação com `FOR UPDATE
SKIP LOCKED` + `RETURNING` unido a anexo/objeto/configuração numa instrução só; escrita guardada por `lease_token`) + 1
reivindicação vazia que encerra o laço (medido: 6 + 2 + 1 = 9 para um áudio; o teste conta `database.execute`).

## T3.4 — rotina `conversation.audio.transcribe` e executor (2026-10-12)

`apps/worker-transportada/src/conversation-audio-transcription/` (cada arquivo ≤ 200 linhas, funções ≤ 40):
`audio-transcription-runtime.constant.ts`, `-queue.port.ts` (duas portas: ciclo e linha), `-retry.policy.ts` (lease =
timeout do motor + 15 s + 60 s + 60 s + 60 s; backoff; idade máxima da trava = `BATCH_SIZE × lease`), `-text.policy.ts`
(U+0000, corte por code point em fronteira de palavra, nome do modelo), `-summary.ts`, `-line.{types,outcome,persistence,
processor}.ts`, `audio-transcription.runner.ts` (executor: uma execução por vez, `AbortController`, soltura graciosa),
`conversation-audio-transcribe.routine.ts` (ciclo só-SQL), `drizzle-audio-transcription-{cycle,line}.repository.ts`,
`build-audio-transcription-runtime.ts`. `main.ts`: registra só com `isAudioTranscriptionConfigured(config)`; o executor é o
primeiro dos `closeables` (antes de storage, error tracker, logger, e do banco) e também fecha no `catch` de boot.
Catálogo nas quatro cópias (worker, API, cron, painel) ao lado de `trip.canhoto.read`, `JOB_TICK_INTERVAL_SECONDS` (5
min), vocabulário `completed | already_running | runner_lock_expired`. Métricas/alerta: não há stack de métricas no worker;
o resumo da execução anterior vira **contadores do job-run** (`processed/ready/failed/retried/disabled/purged/runnerError`
e `failed<Código>` por código, `claimable/created/exhausted/purgedText` no ciclo) e o alerta é log `error`
`audio_transcription_line_failed` por linha (nunca `company_disabled`, que é `info`).

Gates (worker, primeiro plano): `typecheck` exit 0; `lint` exit 0; `test` → **2430 pass, 0 fail**, 105 arquivos (antes
2379/104); `build` exit 0; `prettier --write` e `bun run format:check` na raiz verdes. Integração do worker
(`test:integration` contra o Postgres descartável `transportada_worker_integration` já migrado): **309 pass, 1 fail**; a
falha é `osrm-routing-matrix.integration.test.ts` ("ponto fora da área", `Expected 4511.2 / Received 1143650`) — serviço
OSRM local com dataset diferente do esperado, não toca a transcrição; a transcrição passa 18/18 três vezes seguidas.
`make worker-integration` **não rodou limpo aqui**: o Postgres local `55432` tem `transportada_worker_integration` com
migrations parciais de outra sessão (`column "latitude" ... already exists`); o mesmo alvo foi reproduzido à mão no Postgres
descartável `65432`.
API: `typecheck` ok; `test` → 11511 pass, **2 fail** (`drizzle snapshot chain > the latest snapshot matches the TypeScript
schema` e `job catalog > accepts every interval the migration already seeded`) — **ambos exigem a migration** que semeia
`job_schedules('conversation.audio.transcribe', 300)` e amplia `job_executions_job_check`/`job_schedules_job_check`
(molde: `20261002120000_trip_canhoto_read_job`); a tarefa proibiu migration nova, então fica **bloqueio aberto** (sem ela o
cron nem agenda a rotina e o `INSERT` em `job_schedules` seria recusado). Cron: `typecheck` e 101 testes verdes. Painel:
`typecheck` e 1332 testes verdes. `make check` na raiz: vermelho **só** pelos dois testes da API acima.

Divergências do contrato: (1) §5.6 linha 470 lista backoff `1 / 5 / 30 min`, mas com a 3ª falha já fechando em
`attempts_exhausted` o 30 min nunca é usado — a tabela o guarda e o teste de política o cobre. (2) "empresa desligada ao
final": a verificação é no momento da reivindicação (a configuração vem no `RETURNING`), não de novo depois do motor —
economiza uma consulta e o texto de empresa que desligou no meio do áudio só é exibido como `disabled` pela API. (3) O
painel só tem rótulos por desfecho para a distribuição de NF-e (`nfeWorkspace.*.locale.json`); as demais rotinas
mostram o código, então não inventei rótulo pt-BR/en para os três desfechos — o "rótulo" do painel é a entrada do
catálogo. (4) Texto vazio do motor é gravado como `''` (silêncio é resultado, spec RF/tabela de estados), `ready`.

## T3.4 — migration do catálogo (2026-10-12)

Autorizada pelo coordenador (necessária à T3.4; a proibição de migration era contra migration não prevista).
`apps/api-transportada/drizzle/20261012154238_conversation_audio_transcribe_job/` (`migration.sql`, `rollback.sql`,
`snapshot.json` por `db:generate`): (1) `job_executions_job_check` e `job_schedules_job_check` ampliadas com
`'conversation.audio.transcribe'` (`NOT VALID` + `VALIDATE`, molde da canhoto/252); (2) semente `('conversation.audio.transcribe',
300, now(), false, now(), 'system')` — **nasce pausada**, a mesma representação da `holiday.provider.pull`: o operador liga em
Operações depois do deploy do worker com modelo e imagem; (3) `rollback.sql` apaga `job_executions` e `job_schedules` do
job (regra da canhoto), restaura as duas CHECK sem ele e sai do journal com guarda `ROW_COUNT`.

Registros: `SEED_MIGRATIONS` (`test/job-catalog/catalog.contract.ts`), lista de pastas
(`static-migration.contract.ts`), contrato estático novo `conversation-audio-transcribe-job.static.contract.ts`
(aditiva, semente pausada, rollback), asserção de integração `conversation-audio-transcribe-job.assertion.ts` (semente
pausada em 300 s, CHECK aceita o job novo nas duas tabelas e recusa `bogus.job` com 23514) ligada em
`database-migration.integration.ts`, e `conversation-audio-transcribe-job-rollback.assertion.ts`: as asserções que desfazem
migrations anteriores (feriados, canhoto, calendário) desfazem esta primeiro, senão a CHECK antiga recusaria a linha do
relógio (primeira tentativa falhou assim: `job_schedules_job_check ... violated by some row`).

Gates: API `typecheck` e `lint` exit 0; `bun --env-file=../../.env.test test --timeout 120000` → 11525 pass, 0 fail;
`db:generate` → `no_changes`; `db:check` → "Everything's fine"; `make migration-test` → **207 pass, 0 fail** (rollback
incluído); `make check` na raiz → exit 0 (API 11516, worker 2430, cron 101, painel 1332, ...). Uma rodada de `make check` sob carga
reprovou dois testes de API por timeout de 5 s (`deploy.contract`, `composition.contract`), sem relação; passam
isolados e na rodada seguinte.

Histórico: o commit `49c9411c9` (catálogo) deixa a API vermelha sozinho (2 testes) até a migration, que entra no commit
seguinte (sem amend/reset, como pedido); o intervalo vermelho é só entre esses dois commits.

OSRM: `osrm-routing-matrix.integration.test.ts` ("ponto fora da área", esperado 4511.2, recebido 1143650) falha **igual**
no checkout principal em `6ab142933` (sem nenhuma mudança da 264): 3 pass, 1 fail. É o serviço OSRM local, não a
transcrição. `make worker-integration` não roda limpo nesta máquina (banco `55432` com migrations parciais de outra sessão);
o mesmo alvo foi rodado à mão no Postgres descartável `65432`: 309 pass, 1 fail (a do OSRM).

## T3.4 — correções da revisão opus (2026-10-12)

Achado → onde foi resolvido (teste vermelho por mutação depois de cada correção; "mut" = mutação aplicada e revertida).

| Achado                                                    | Resolução                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Prova                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 integração instável (`updated_at` estrito no mesmo ms) | `backdateUpdatedAt` recua `updated_at` 1 min antes da escrita (`audio-transcription-integration.support.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 7 execuções seguidas das suítes da transcrição no Postgres descartável `65432`: **22 pass / 0 fail em 7/7**                                                                                 |
| H2 `catch {}` do leitor virava `object_missing`           | `storage-audio-object-reader.gateway.ts`: existência vem do `head` (o pacote de storage colapsa todo erro do `get` em "indisponível"); erro de transporte lança retriável; o leitor compartilhado das outras rotinas **não mudou**                                                                                                                                                                                                                                                                                                                                                  | `storage-reader.contract.ts`; `line-failures`: leitor lança ⇒ `pending` com backoff de 1 min; mut: `head` com erro ⇒ `undefined` → 3 falhas                                                 |
| H3 sem verificação no boot; ENOENT definitivo             | `audio-transcription-tooling.policy.ts` + `registerAudioTranscriptionRuntime`: sem `whisper-cli`, `ffprobe`, `ffmpeg` ou modelo a rotina **não é registrada** e o boot segue verde, com log `error` só com os nomes (molde RF16/252: `job_run_routine_missing`; derrubar o boot tiraria todas as outras rotinas do worker por causa de uma opcional, que já nasce pausada). ENOENT/`spawn_failed` virou kind `infrastructure`: `pending` em 30 min e a tentativa **volta** (`attempts - 1`), log `error`                                                                            | `tooling.contract.ts` (cada ferramenta ausente sozinha, log sem caminho), classificador e sonda; mut: verificação sempre ok → 5 falhas; mut: infra gasta tentativa → 1 (unitário) e 1 (SQL) |
| H4 lease com 1× o timeout do motor                        | `computeLeaseMilliseconds = 2 × timeout + 15 + 60 + 60 + 60 s`; trava = `BATCH × LEASE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `lease-package-binding.contract.ts` lê o `dist` instalado e exige exatamente 2 usos de `timeout: timeoutMs`; mut: 1× → 2 falhas                                                             |
| M1 `close()` não aborta o filho                           | o `signal` chega à sonda (`Bun.spawn` morto por `kill`, desfecho `aborted` retriável). **Divergência:** o pacote `whisper-local` 0.1.0 não aceita `signal`; o `whisper-cli` termina no timeout do motor (até 2× o `timeoutMs`). O shutdown do worker **não** chama `process.exit` (`shutdown-signals.service.ts`): o processo só sai quando o filho do `execFile` termina, então o filho não fica órfão, mas o desligamento pode esperar. **Follow-up:** abrir issue no pacote para aceitar `AbortSignal`                                                                           | `duration-probe.contract.ts` (sinal chega ao comando; `sleep 30` morre ao abortar)                                                                                                          |
| M2 `completed` em `failureOutcomes`                       | o ciclo devolve `succeeded`; `failureOutcomes: ['already_running','runner_lock_expired']` nas **quatro** cópias e nos três contratos de paridade; `contract.md` §5.8, `plan.md` e `tasks.md` emendados                                                                                                                                                                                                                                                                                                                                                                              | `cycle`/`job-run-isolation`/catálogos                                                                                                                                                       |
| M3 empresa desligada no meio                              | `markReady` leva `not exists (... not enabled)`; com 0 linhas a linha fecha `failed/company_disabled` e o texto não é gravado. Decisão registrada em `spec.md` D9 e `contract.md` §5.6                                                                                                                                                                                                                                                                                                                                                                                              | integração (`writes`) + `line-failures`; mut: sem a guarda → 1 falha                                                                                                                        |
| M4 download sem timeout                                   | `AbortSignal.timeout(60 s)` combinado com o do worker na leitura; teto de 100 MiB (declarado pelo `head` e contado no fluxo)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `storage-reader.contract.ts` (prazo ⇒ `engine_timeout` retriável; teto)                                                                                                                     |
| M5 expurgo varre tudo                                     | migration aditiva `20261012161504_conversation_audio_transcription_purge_index` (índice parcial `(company_id, attachment_id) where status='ready' and text is not null`) + rollback + snapshot (`db:generate` = `no_changes`, `db:check` ok); o `update` parte das linhas `ready` com texto e junta por chave primária. **Não coube:** expurgo dirigido por evento (o ciclo ainda percorre as linhas `ready` com texto a cada 5 min — O(áudios transcritos), com junção por PK); janela por `deleted_at` foi descartada porque áudio apagado por retenção longa ficaria sem expurgo | `static` + integração (o índice existe, parcial)                                                                                                                                            |
| M6 threads                                                | padrão `min(7, max(1, availableParallelism() − 1))`. **Não coube:** `AUDIO_TRANSCRIPTION_THREADS=7` no `.railway/railway.ts` — as variáveis `AUDIO_TRANSCRIPTION_*` ainda não estão lá (entram com a T3.5, `preserve()` à mão) e nada foi aplicado no Railway                                                                                                                                                                                                                                                                                                                       | `environment.contract`; mut: sem teto → 1 falha                                                                                                                                             |
| L1 `takeSummary()` antes do SQL                           | lido **depois** do SQL; a execução de trava vencida soma seu resumo ao da nova (`mergeRunSummaries`) em vez de descartá-lo                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `cycle.contract` (SQL falha ⇒ resumo preservado); mut: mover de volta → 1 falha                                                                                                             |
| L2 `close()` durante `claimNext`                          | `claiming` e `releasing` guardados; `close()` aguarda a reivindicação e a soltura antes de o banco fechar                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `runner-lifecycle.contract` (soltura lenta de 15 ms); mut: sem aguardar → 1 falha                                                                                                           |
| L3 backoff                                                | `contract.md` §5.6 passo 6 emendado: 1 / 5 min (a 3ª falha fecha); 30 min só para falha de ambiente                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | texto + `text-policy.contract`                                                                                                                                                              |
| L4 duração em todo caso medido                            | `MeasuredDuration` acompanha a etapa; `scheduleRetry`/`markFailed` gravam `audio_duration_ms` mesmo se o motor falhar                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `line-failures` (7 000 ms mantidos) + integração (4 200 ms)                                                                                                                                 |
| L5 protocolo/bytes                                        | `-protocol_whitelist file,pipe` em `ffprobe` e `ffmpeg` da sonda e teto de bytes do download. **Não coube:** o `ffmpeg` do pacote `whisper-local` não aceita opções extras (fora do nosso controle)                                                                                                                                                                                                                                                                                                                                                                                 | `duration-probe.contract`                                                                                                                                                                   |
| L6 estilo                                                 | fábricas divididas (`AudioTranscriptionRunnerService` em classe com métodos ≤ 40 linhas; repositórios em claim/write/cycle; sonda em funções), `XParams` em `*.types.ts`, `UNKNOWN_ERROR_NAME`, nenhum arquivo `src/` da transcrição > 200 linhas; testes divididos: integração em 6 arquivos + suporte, harness em fila e dublês, `line-processing` em três, `runner` em dois — nenhum arquivo de teste novo > 200 linhas                                                                                                                                                          | `wc -l`                                                                                                                                                                                     |
| L7 ramo "abortado não grava" e junção frágil              | teste do aborto (mut: tirar `if (signal.aborted)` → 1 falha); reivindicação com `left join` (objeto sem registro vira `missing` ⇒ `object_missing`, a linha alugada nunca devolve `undefined`)                                                                                                                                                                                                                                                                                                                                                                                      | `line-failures`, integração `claim`                                                                                                                                                         |

Gates: worker `typecheck` e `lint` exit 0; `test` → **2457 pass, 0 fail** (antes 2430); `build` exit 0. API `typecheck`/`lint` exit 0 e `bun --env-file=../../.env.test test --timeout 120000` → 11527 pass, 0 fail; `db:generate` → `no_changes`; `db:check` ok. `make migration-test` → **209 pass, 0 fail** (a primeira rodada travou 901 s no teste fiscal de migração, sem sessão aberta no banco — contenção do Postgres local compartilhado com outras sessões; a repetição passou em 41 s). Integração do worker (`test:integration` no Postgres descartável `65432`): 313 pass, 1 fail — a do OSRM, pré-existente e de ambiente (falha igual em `6ab142933`). `make check` na raiz: exit 0.

### N1 — prazo real do download (2ª revisão opus, 2026-10-12)

O prazo de 60 s só era conferido entre pedaços do fluxo: fluxo que parava depois do 1º pedaço, ou `head`/`get` que nunca respondiam, seguiam presos. `storage-audio-object-reader.gateway.ts` agora corre `headObject`, `getObjectStream` e cada `reader.read()` contra a MESMA promessa de aborto do sinal (prazo do download ou desligamento), cancela o leitor ao sair (solta o fluxo parado no storage) e remove o listener no `finally`. O aborto vira falha retriável (`engine_timeout` no prazo, `engine_failed` no desligamento): a linha volta a `pending` com backoff, nunca `object_missing`. O teste antigo do prazo (`AbortSignal.abort()` já disparado) era tautológico; os novos usam prazo real de 200 ms.

Prova: os 4 testes novos (fluxo que para após o 1º pedaço e é cancelado; `head` pendurado; `get` pendurado; aborto de desligamento) **reprovaram antes da correção** (4 falhas por timeout de 4 s) e passam depois (10/10). Mutação: tirar o `cancel` → 1 falha; trocar a corrida do `read()` por `read()` puro → 1 falha.

### Follow-ups registrados (não implementados)

- **N2** — a falha de infraestrutura (binário ausente) reagenda em 30 min sem devolver a tentativa e sem teto de dias; o alerta existe (log `error` por linha e contador `infrastructure` no job-run), então o operador é avisado, mas a linha segue tentando até a janela de recuperação de 72 h passar.
- **N3** — o provedor de storage colapsa `NoSuchBucket` (e todo erro do `get`) em "indisponível", e o `head` trata `NoSuchBucket` como objeto ausente: um banco restaurado de outro ambiente (bucket inexistente) queimaria as linhas como `object_missing` definitivo. Não dá para distinguir a ausência do BUCKET sem mudar o pacote antes de ele colapsar; fica registrado — tratar como transporte exigiria um `headBucket` ou um código novo no provedor.
- **N4** — o `whisper-cli` não aceita `signal` e pode atrasar o desligamento do worker em até 2 × `AUDIO_TRANSCRIPTION_TIMEOUT_MS`; a T3.5 deve configurar um prazo de drenagem do serviço coerente com isso.

## T3.5 — imagem do worker com whisper-cli, modelo e ffmpeg (2026-10-12)

**Contrato antes (visto falhando):** `apps/worker-transportada/test/build-entrypoints.contract.test.ts` ganhou o bloco
"worker image audio transcription contract" (4 testes: estágio `whisper-build` com tag `v1.9.4`, commit
`927cfce34f31707e17f2bff35c349632fb9e2c3a`, `rev-parse HEAD` e `-DGGML_NATIVE=OFF`; estágio `models` com URL oficial
`huggingface.co/ggerganov/whisper.cpp` e `sha256sum -c` do hash completo da ADR-0103; estágio final com binário, modelo,
`ffmpeg` e `libstdc++`, sem `cmake|g++|gcc|make|git|build-base|curl`; `ENV AUDIO_TRANSCRIPTION_MODEL_PATH` e `USER
transportada` depois da cópia). Antes do Dockerfile: 2 pass / 4 fail; depois: 6 pass / 0 fail.

**Imagem:** três estágios novos no `apps/worker-transportada/Dockerfile` (`whisper-build` em `oven/bun:1.3.14-alpine`, mesma
musl do runtime; `models` em `alpine:3.22` com `curl`); o runtime ganhou `apk add ffmpeg libstdc++ libgomp` (o `ldd` do
binário pede os dois; `ffmpeg` traz `ffprobe`), `/usr/local/bin/whisper-cli`, `/models/ggml-small-q5_1.bin` e
`ENV AUDIO_TRANSCRIPTION_MODEL_PATH`. `AUDIO_TRANSCRIPTION_BINARY_PATH` não é definida: o padrão do schema é `whisper-cli`
no PATH.

**Prova local** (`docker build --platform linux/amd64 -f apps/worker-transportada/Dockerfile .` da raiz, Mac arm64, amd64
emulado):

- build a frio (inclui compilar o whisper.cpp sob emulação): **105 s**;
- `whisper-cli --help` imprime o uso; `ffprobe version 6.1.2`; usuário `uid=1001(transportada)`;
- modelo `-rw-r--r-- root 190085487` e `sha256sum` dentro da imagem = `ae85e4a9…11bb` (o da ADR);
- `which cmake g++ make git curl gcc` no runtime: nada;
- tamanho (`docker image inspect`, sem compressão): **389 051 058 B** contra **156 163 249 B** da imagem anterior do
  worker (mesmo contexto, Dockerfile de `HEAD`) = **+232,9 MB** (modelo 190 MB + ffmpeg/libs + binário);
- transcrição real do áudio TTS sintético `d010-clean.ogg` (13,6 s, Opus): o `whisper-cli` não decodifica Opus, então o
  `ffmpeg` do contêiner converteu para WAV 16 kHz mono e o `whisper-cli -m $AUDIO_TRANSCRIPTION_MODEL_PATH -l pt -t 7`
  devolveu, palavra por palavra, o texto-fonte ("Bom dia, pessoal do escritório, aqui é o motorista da carreta que saiu
  ontem à noite do centro de distribuição. Já cheguei no primeiro cliente e estou esperando a liberação da doca para
  começar a descarga."); **9,3 s** de relógio total (ffmpeg + modelo + inferência) sob emulação amd64;
- `docker run` sem variáveis: o entrypoint sobe e para em `worker_startup_failed` (configuração ausente), não por binário.
- imagens `worker-t35` e `worker-t35-old` removidas.

**Railway (só edição, nada aplicado):** `.railway/railway.ts`, serviço `worker` (vale para staging e production, o
objeto é um só): `AUDIO_TRANSCRIPTION_{BATCH_SIZE=2, LANGUAGE=pt, MAX_DURATION_MS=600000, RECOVERY_WINDOW=72,
THREADS=7, TIMEOUT_MS=300000}` como valor literal (convenção do arquivo para o que não é segredo, como
`NFSE_PROVIDER_API_VERSION`) e `deploy.drainingSeconds: 600` (N4: até 2 × 300 s). `tsc --noEmit` do arquivo: limpo.
`docs/spec/railway.md` registra a drenagem.

**Não provado local:** x86 real (AVX2 sob emulação; o tempo de 9,3 s não vale como medida de produção, a T0.2 mediu 0,17 de
fator no runner); o comportamento do Railway com `drainingSeconds` (o campo só existe no tipo `DeployConfig` do SDK; não
rodei `railway config plan`, que toca a conta; os `railway.json` não o declaram e o schema online não pôde ser
conferido); build no builder do Railway.

**Divergências do plano § d:** as variáveis não são `preserve()` mas valores literais (não são segredo, e `preserve()` de
variável que ainda não existe não a cria); `MODEL_PATH` vive só na imagem; `BINARY_PATH` não é declarada (PATH);
`libgomp` entra além de `libstdc++`; a API não declara `AUDIO_TRANSCRIPTION_*` (o padrão de `MAX_DURATION_MS` basta).

## T3.6 — documentação da rotina (2026-10-12)

Só documentação: `docs/ai-context/worker-transportada.md` ganhou a seção "A rotina `conversation.audio.transcribe` (spec 264)"
(ciclo, executor, lease e trava, classificação de erro, leitor do storage, variáveis, registro condicional, imagem,
privacidade, divergências N2–N4, operação) e a contagem de `src/database/` foi corrigida: **38** `*.schema.ts` (mais o
`sql-timestamptz-parameter.support.ts`), não "quatorze". `apps/worker-transportada/CLAUDE.md` ganhou o núcleo da rotina
nas invariantes, com a mesma contagem corrigida. Cada afirmação foi conferida no código (`conversation-audio-transcription/**`,
`config/audio-transcription-environment.schema.ts`, `main.ts`, `Dockerfile`, `.railway/railway.ts`) e na migração
`20261012154238`. Divergência encontrada entre a evidência T3.4 e o código: o N2 dizia que a infraestrutura para na janela
de 72 h, mas o código não fecha `pending` por idade (a janela só filtra a descoberta); a seção descreve o código e
registra a divergência.

Gates: `bunx prettier --check` nos dois `.md` → ok; `bun run format:check` na raiz → exit 0.
