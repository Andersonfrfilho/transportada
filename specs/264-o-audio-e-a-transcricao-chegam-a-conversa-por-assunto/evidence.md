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

## T2.1 — tabelas da transcrição e migration aditiva (2026-10-12)

- Schema: `apps/api-transportada/src/database/conversation-audio-transcription.schema.ts`
  (`occurrenceConversationAudioTranscriptions`, `companyAudioTranscriptionSettings`) e índice parcial
  `occurrence_conversation_attachments_audio_created_idx (created_at) where content_type like 'audio/%'` em
  `occurrence-conversation.schema.ts`. Vocabulário em `src/shared/conversation-audio-transcription.constant.ts`.
- `failure_code` (CHECK fechado): `unsupported_format`, `too_long`, `empty_audio`, `object_missing`, `sha256_mismatch`,
  `engine_timeout`, `engine_failed`, `attempts_exhausted`, `company_disabled`. `status`: `pending|ready|failed|purged`.
- Migration `drizzle/20261012155134_conversation_audio_transcription/` (`migration.sql`, `rollback.sql`, `snapshot.json`).
  Rollback derruba o índice e as duas tabelas, tira a linha do journal com guarda de `ROW_COUNT`.
- Registrada em `test/database-migration.contract.test.ts` (estático), `database-migration.integration.ts` (assertion contra
  Postgres) e na lista de pastas de `static-migration.contract.ts`; contrato de schema/tenant-safety em
  `test/occurrence-conversation-schema/audio-transcription.contract.ts` (toda FK composta com `company_id`).
- `bun run db:generate --name zz_probe` → `{"status":"no_changes"}`; `bun run db:check` → "Everything's fine".
- `bun test ./test/database-migration.contract.test.ts ./test/occurrence-conversation-schema.contract.test.ts
  ./test/migration-chain.contract.test.ts` (`--timeout 180000`): 199 pass / 1 fail. O 1 fail é
  `schema-snapshot` "latest snapshot matches the TypeScript schema", causado pelo `conversation.audio.transcribe` que **outra
  tarefa** acrescentou ao `job-catalog.constant.ts` (CHECK de `job_executions`/`job_schedules`) e ainda não tem migration;
  o `db:generate` da T2.1, feito antes, deu `no_changes`.
- Migration contra Postgres real (contêiner `postgres:18-alpine` descartável, `DRIZZLE_TEST_DATABASE_URL`):
  `bun test ./test/database-migration.contract.test.ts` → "Drizzle migration integration" **passa** (1792 expects), incluindo
  a assertion nova (CHECKs, FKs compostas, unicidade, rollback, reaplicação). Na máquina de Windows+WSL ele leva ~100 s, acima
  do teto fixo de 30 s do teste: rodado com o teto subido só localmente (revertido), por lentidão de ambiente.
- `bunx prettier --check` nos arquivos novos: limpo. `bun run typecheck`: os arquivos da T2.1 sem erro; restam 2 erros em
  `test/job-catalog/catalog.contract.ts` da outra tarefa (catálogo de jobs).

## T3.1 — cópia por valor do schema no worker e contrato de paridade (2026-10-12)

- `apps/worker-transportada/src/database/conversation-audio-transcription.schema.ts`: `occurrenceConversationAudioTranscriptions`,
  `companyAudioTranscriptionSettings` e as constantes `CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES`,
  `CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES`, `CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH` (mais os tipos
  `ConversationAudioTranscriptionStatus` e `ConversationAudioTranscriptionFailureCode`). A cópia de
  `occurrenceConversationAttachments` já tinha `durationMs` e `createdAt`: nada a acrescentar.
- Contrato `test/conversation-audio-transcription-schema/parity.contract.ts` (entrada `…-schema.contract.test.ts`, registrada no
  script `test` do `package.json`): coluna a coluna contra a API (20 + 6), nomes e ordem das colunas, vocabulário de `status` e
  `failure_code` contra a constante da API **e** contra o CHECK de `migration.sql`, e o teto de 20 000. Mutação provada: trocar
  `max_duration_ms` por `max_duration_x` na cópia reprova dois testes.
- `bun test --timeout 120000 ./test/conversation-audio-transcription-schema.contract.test.ts` → 4 pass / 0 fail.
- `bun run typecheck` (worker) → limpo. `bunx eslint` nos arquivos novos → limpo. `prettier --write` aplicado.

## T2.2 — contratos da transcrição nas rotas por assunto (2026-10-12)

- **Vermelho primeiro.** Com os contratos escritos e antes de existir `participant-transcription.*` / porta de leitura,
  `bun test ./test/occurrence-conversation.contract.test.ts` → `0 pass / 1 fail / 1 error`:
  `Cannot find module '../../src/occurrence-conversation/domain/participant-transcription.constant.js'`.
- **Verde.** Mapper puro `toParticipantTranscription(row | undefined, enabled)` e `toParticipantDurationMs` em
  `occurrence-conversation/domain/participant-transcription.policy.ts`; tabela espelhada em
  `participant-transcription.constant.ts`; porta `AudioTranscriptionReaderPort` (+ tipos) e
  `enrichAudioAttachments` (`conversation-audio-enrichment.service.ts`), chamado **depois** de `signConversationAttachments` nos
  quatro casos de uso (`list-my-subject-messages`, `reply-my-subject-conversation`, `list-office-subject-messages`,
  `send-office-subject-message`). `readConversationAttachments`, `signConversationAttachments` e a tela antiga não mudam.
  Leitura Postgres em `drizzle-conversation-audio-transcription.reader.ts` (a prova contra banco é da T2.3).
- Contratos novos (todos registrados em `test/occurrence-conversation.contract.test.ts`):
  - `participant-transcription-mapper.contract.ts`: onze casos da tabela do contract §5.2 (ausente, empresa desligada com e sem
    linha, `pending`, `ready` com/sem idioma e motor, idioma fora de `/^[a-z]{2,3}$/` some, `failed` `too_long` com teto,
    `failed` de outro código e `company_disabled`, `purged`), nulo nunca vira `null`, texto só em `ready`, duração (anexo vence
    a da rotina, inteiro positivo até 86 400 000 ms).
  - `participant-transcription-parity.contract.ts`: cada saída do mapper passa em `participantTranscriptionSchema` de
    `@adatechnology/conversation-contracts@0.6.0` e volta idêntica; tabela espelhada confere com as constantes do pacote
    (estados, `too_long`, 40 000, 86 400 000, regex do idioma); texto de 20 000 pontos astrais (emoji) cabe nos 40 000 UTF-16;
    contrato de texto de fonte: nenhum `src/**` importa o pacote, e ele está só em `devDependencies`, em versão exata.
  - `subject-audio-transcription.contract.ts`: os quatro casos de uso trazem `durationMs`/`transcription` só no anexo de áudio;
    página sem áudio = 0 consultas; com áudio = configuração + linhas (uma vez, todos os áudios); empresa desligada = só a
    configuração e `disabled`.
  - `audio-transcription-old-routes-golden.contract.ts`: bytes de `/me/.../occurrences/**` (motorista), leitura do painel da
    ocorrência e `/client/**` (portal) com um anexo de áudio, sem `transcription` nem `durationMs`.
  - `audio-transcription-source.contract.ts`: "transcrição fora de log" e "a conversa nunca decide", com os detectores
    exercitados contra texto adulterado (mutação) antes de varrer `src/**`.
- Pacote `@adatechnology/conversation-contracts`: `0.6.0` é a versão publicada que exporta `participantTranscriptionSchema`
  (`npm view` → 0.2.0…0.6.0; `0.5.0` não tem). Entrou como `devDependency` exata da API; `bun.lock` com **só** as 5 linhas
  novas (entrada do workspace, `@transportada/api/@adatechnology/conversation-contracts` e o `zod@3.25.76` aninhado dele),
  pois o `bun install` do Bun 1.4.3 reescrevia entradas alheias (removia `lightningcss*`, movia
  `audio-transcription-provider` da API para o worker) e foi revertido. `bun install --frozen-lockfile` → "no changes".
  ⚠️ As apps frontend seguem em `0.5.0` (a subida conjunta é da T4.1).
- `bun test ./test/occurrence-conversation.contract.test.ts` → 472 pass / 0 fail.

## T2.3 — leitura em lote da transcrição e `transcriptionUpdatedAt` (2026-10-12)

- **Vermelho primeiro (resumo).** Os dois testes de contrato novos em `driver-subject-conversation.contract.ts`
  (`transcriptionUpdatedAt` na lista e no `open`) rodaram antes da implementação: `472 pass / 2 fail` em
  `./test/occurrence-conversation.contract.test.ts`. A leitura em lote dos anexos já estava na T2.2 (contratos de unidade
  verdes lá); aqui entram a agregação e a prova contra Postgres.
- `toSubjectConversationSummary(row, officeReadAt?, transcriptionUpdatedAt?)` acrescenta `transcriptionUpdatedAt` (ISO) ao
  resumo de `GET /me/trips/current/conversations` e de `POST …/open`, lido por
  `transaction.audioTranscriptions.readTranscriptionUpdatedAtByConversation` (um `select conversation_id, max(updated_at) …
  group by conversation_id` com `inArray` das conversas da página, só `company_id` + `conversation_id`, sem junção;
  índice `occurrence_conversation_audio_transcriptions_conv_updated_idx`).
- Integração `test/integration/audio-transcription-subject-read.integration.ts` (Postgres 18 descartável, `./test/integration/…`):
  - consultas constantes medidas por `countQueries`: a página sem áudio é a base `B`; com 1 áudio **e** com 6 áudios é `B + 2`
    (configuração + linhas); com a empresa desligada é `B + 1` (só a configuração);
  - empresa com `enabled = false` e **nenhuma** linha de transcrição lê `{ status: 'disabled' }` no áudio; a imagem do mesmo
    mensagem não ganha `transcription` nem `durationMs`;
  - `transcriptionUpdatedAt` ausente sem linha, igual ao `updated_at` com a linha `pending` (10 min) e passa a 20 min quando
    a mesma linha vira `ready`; a contagem de consultas da lista não depende de haver linhas;
  - `durationMs` do anexo (1000…1005) sai; `durationMs: 4200` vem de `audio_duration_ms` da transcrição quando o anexo não tem.
- `driver-subject-conversation-scale.integration.ts`: a lista passa de 5 para **6** consultas (1, 10 e 30 conversas — constante) e
  o teto da lista mista de 7 para 8.
- Resultado: `bun --env-file=../../.env.test test --timeout 300000 ./test/integration/audio-transcription-subject-read.integration.ts`
  → 3 pass / 0 fail.
- Desvio documentado: o `durationMs` vindo de `attachments.duration_ms` só é lido na consulta das linhas (a mesma que traz a
  transcrição, `left join` pelos anexos pedidos); com a empresa desligada essa consulta não roda (contagem pedida pela spec) e
  o áudio sai só com `transcription: { status: 'disabled' }`.

## T2.4 — `GET`/`PUT /company-settings/audio-transcription` (2026-10-12)

- **Vermelho primeiro.** Contrato `test/companies/audio-transcription-settings.contract.ts` e integração
  `test/integration/audio-transcription-settings.integration.ts` escritos antes do código. Com a implementação removida
  (renomeada só para a prova): `bun test ./test/companies.contract.test.ts` → `0 pass / 1 fail / 1 error`
  (`Cannot find module '../../src/companies/application/audio-transcription-settings.use-case.js'`) e a integração →
  `0 pass / 1 fail / 1 error`. Restaurada a implementação: verde (abaixo).
- Rota (`companies/presentation/audio-transcription-settings.routes.ts`): `API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH`
  (`/company-settings/audio-transcription`), `{ permission: 'settings.manage', scope: 'company' }` nos dois verbos, `no-store`,
  corpo `{ enabled }` `.strict()` (`companyId`, `maxDurationMs` e `updatedAt` no corpo = 400, todos os erros de uma vez),
  resposta `{ data: { enabled, maxDurationMs, updatedAt|null } }` em lista branca (isca de campos extras no objeto do
  repositório não vaza). Empresa, usuário e IP vêm do contexto e do `resolveClientIp` (o `X-Forwarded-For` forjado não chega
  ao repositório). Montada em `main.ts` ao lado da retenção de posição.
- `AUDIO_TRANSCRIPTION_MAX_DURATION_MS` no schema de env da API (padrão `600000`, entre 1 000 e 3 600 000, igual ao worker),
  em `ApiEnvironment.audioTranscriptionMaxDurationMs`, no `.env.example` e nos dois montadores de `ApiEnvironment` das integrações.
  ⚠️ Não declarei a variável em `.railway/railway.ts`: o bloco do worker ainda não tem as `AUDIO_TRANSCRIPTION_*`, e declarar só
  na API faria os dois divergirem; fica para quem declarar o worker (ambos têm o mesmo padrão).
- Repositório (`DrizzleAudioTranscriptionSettingsRepository`): lock consultivo por empresa (`acquireAudioTranscriptionLock`,
  `FOR UPDATE` não trava linha inexistente) + `FOR UPDATE` da linha anterior; `PUT` igual ao atual não escreve nem audita (inclui
  sem linha + `enabled: true`); mudança faz _upsert_ com `updated_at = now()`, `enabled_since = now()` ao ligar e
  `updated_by_user_id`, e grava `audit_logs` (`company-audio-transcription.changed`, ator, empresa, `{ enabled }` antes/depois,
  `correlationId`, `metadata.ipAddress`, permissão `settings.manage`) na mesma transação. `updatedAt` é `null` enquanto só a rotina escreveu.
- Integração contra Postgres 18 descartável: sem linha ligada e `PUT true` não cria linha nem auditoria; desligar grava com o
  relógio do banco (diferença para `now()` < 60 s) e uma linha de auditoria completa; repetir o valor não mexe em `updated_at` nem audita;
  religar audita de novo e renova `enabled_since`; dois `PUT` simultâneos na primeira escrita auditam **uma** vez; linha criada pela
  rotina (`updated_by_user_id` nulo) lê `updatedAt: null` e desligar audita contra "ligada"; a outra empresa fica intacta.
  `bun test … ./test/integration/audio-transcription-settings.integration.ts` → 4 pass / 0 fail.
- Contrato: `bun test ./test/companies.contract.test.ts ./test/occurrence-conversation.contract.test.ts ./test/config` → 722 pass / 0 fail.
- `bunx tsc --noEmit` → exit 0; `bunx eslint <arquivos> --max-warnings=0` → limpo; `prettier --check` → limpo; `bun run db:check` → "Everything's fine".
- Suíte de contrato inteira (`bun --env-file=../../.env.test test --timeout 180000`, ≈5 min): 11 466 pass / 34 skip / 3 fail. Os 3 fails
  são de **outra tarefa em curso na mesma árvore**: apareceu `drizzle/20261012180000_occurrence_contractor_reply/` (só com `.omc/`, sem
  `migration.sql` nem `snapshot.json`), e reprovam `static-migration` (lista de pastas), `schema-snapshot` ("ships a snapshot.json") e o
  `fiscal-schema` (lê o `migration.sql` dela). Nenhum toca arquivo desta tarefa.

## T2.5 — documentação das rotas e dos campos (2026-10-12)

- `specs/264-*/api-contract.md` (novo; o `tasks.md` o cita e a 263 tem o seu): rotas `GET`/`PUT /company-settings/audio-transcription`,
  campos `durationMs`/`transcription` do anexo de áudio das quatro rotas por assunto (tabela de situações, consultas constantes por página,
  enriquecimento depois de `signConversationAttachments`) e `transcriptionUpdatedAt` do resumo.
- `docs/ai-context/api-transportada.md` § "Spec 264 (Fase 2)" e nota curta em `apps/api-transportada/CLAUDE.md` (seção da conversa).
- `bunx prettier --check` nos três arquivos de documentação: limpo.

## T3.5 — imagem do worker com `whisper-cli`, `ffmpeg` e modelo (2026-10-13)

- **Contratos primeiro (vermelho de verdade):** `apps/worker-transportada/test/audio-transcription-image.contract.test.ts` (novo, na lista
  do `package.json`) criado antes de tocar o `Dockerfile` e o `.railway/railway.ts`: `bun test` → **1 pass / 8 fail** (tag fixada,
  commit conferido, flags, sha256, `ffmpeg` no estágio final, sem ferramentas de build, as seis `AUDIO_TRANSCRIPTION_*` no worker e a
  da API). Depois do `Dockerfile` e do `railway.ts`: 10 pass / 0 fail junto com `build-entrypoints.contract.test.ts`.
- **`Dockerfile`:** estágio `whisper` (mesma base `oven/bun:1.3.14-alpine`) clona `ggml-org/whisper.cpp` `--branch v1.9.4`, confere
  `git rev-parse HEAD` contra `927cfce34f31707e17f2bff35c349632fb9e2c3a` (falha o build se divergir), `cmake` Release com
  `-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DBUILD_SHARED_LIBS=OFF`, só o alvo `whisper-cli`; baixa
  `ggml-small-q5_1.bin` do Hugging Face e confere `sha256sum -c` contra `ae85e4a9…11bb` (a ADR-0103 e a T0.2 registram o valor).
  Estágio final: `apk add --no-cache ffmpeg libgomp libstdc++`, `whisper-cli` em `/usr/local/bin`, `/models` copiado com
  `--chown=transportada:transportada`; sem `build-base`/`cmake`/`git`/`curl`; `USER transportada` e `CMD` intactos.
- **`.railway/railway.ts`:** worker ganha `BATCH_SIZE '2'`, `MAX_DURATION_MS '600000'`, `TIMEOUT_MS '300000'`,
  `RECOVERY_WINDOW_HOURS '72'`, `THREADS preserve()` e `MODEL_PATH` = `/models/ggml-small-q5_1.bin` **só em staging**
  (`isProduction ? preserve() : …`: produção segue inerte até aprovação humana); a API ganha `MAX_DURATION_MS '600000'`. Nenhum teste do
  repositório compara `railway.ts` com `deploy/worker/railway.json` (o `railway.json` do worker não declara variáveis), então o
  contrato novo cobre a paridade com os nomes do `environment.schema.ts` do worker. O job segue **pausado pela migration**.
- **Build local** (Docker Desktop 29.8.2, Windows; contexto = cópia limpa só dos arquivos versionados que o `Dockerfile` usa, porque o
  `node_modules` do checkout é de links do WSL e o envio de contexto do Docker Desktop falha com "Não é possível o acesso ao arquivo"):

```sh
docker.exe build --progress=plain -f apps/worker-transportada/Dockerfile -t worker-t35:local .
#  real 3m31s (sem cache da compilação; whisper-cli: 87 s; build do worker e instalação do bun: o restante)
docker.exe images worker-t35:local  # 1.4GB (o mesmo bun alpine + node_modules + ffmpeg + modelo 182 MB + whisper-cli 3,2 MB)
```

- **Dentro do contêiner** (`--entrypoint sh`, usuário `transportada` uid 1001):
  - `whisper-cli --help` → `usage: whisper-cli [options] file0 file1 ...` / `supported audio formats: flac, mp3, ogg, wav`.
  - `ffprobe -version` → `ffprobe version 6.1.2`.
  - `ls -ld /models` → `drwxr-xr-x transportada transportada`; `ggml-small-q5_1.bin` 190 085 487 bytes, mesmo dono.
  - `ldd whisper-cli` → só `libgomp`, `libstdc++`, `libgcc_s` e musl (os três pacotes `apk` do estágio final).
  - `which gcc cmake git make` → nada (sem ferramentas de build). `bun --version` → 1.3.14 (entrypoint do worker intacto).
- **Transcrição de um áudio sintético** (nenhuma voz real): TTS do Windows, voz `Microsoft Maria Desktop` (pt-BR), via
  `System.Speech.Synthesis.SpeechSynthesizer` → WAV de 11,3 s com o texto "Bom dia. Aqui é o motorista. Cheguei na doca três e estou
  aguardando a liberação da nota fiscal para descarregar." Os mesmos passos do motor do pacote:
  `ffmpeg -nostdin -i teste-sintetico.wav -ar 16000 -ac 1 -y a.wav` e
  `whisper-cli --model /models/ggml-small-q5_1.bin --file a.wav --no-timestamps --language pt --max-context 0 --threads 4`
  → **"Bom dia. Aqui é o motorista. Cheguei na Doca 13 e estou aguardando a liberação da nota fiscal para descarregar."**
  (a única troca é "três" → "13"; o resto é literal). `ffmpeg` também gerou um tom de 3 s (`sine=440`), e o `ffprobe` mediu 3,000000 s.
  Tempo de parede não foi medido aqui (o `date` do busybox não tem `%N`); a medida do fator de tempo real está na T0.2, no runner.
- **Gates** (`apps/worker-transportada`, via WSL): `bunx tsc --noEmit` → 0; `eslint` do teste novo `--max-warnings=0` → 0; `prettier --check`
  do teste, do `railway.ts`, do `package.json`, do `CLAUDE.md` e do `docs/ai-context/worker-transportada.md` → limpo.

## T3.6 — documentação da rotina (2026-10-13)

- `docs/ai-context/worker-transportada.md` § "A transcrição do áudio da conversa é rotina daqui": motor e imagem, inércia sem o modelo,
  job pausado pela migration, executor em processo, lease que cobre o motor duas vezes (795 s com `TIMEOUT_MS` 300000), `SIGTERM` que
  aborta o motor e devolve a tentativa, trava velha que aborta o laço antigo, janela de 72 h, fila/estados/códigos, nunca log de texto.
- Núcleo em `apps/worker-transportada/CLAUDE.md` (invariante nova, ao lado da conversa da ocorrência e dos feriados).

## T4.1 — a subida do SDK nas três apps (2026-10-13)

- **O que subiu** (versão exata, as duas juntas): `@adatechnology/conversations-ui` 0.9.0 → **0.10.0** e
  `@adatechnology/conversation-contracts` 0.5.0 → **0.6.0** em `frontend-driver`, `frontend-transportada` e `frontend-client`. A API já
  declarava o contracts **0.6.0** como `devDependency` exata (`apps/api-transportada/package.json`); conferido, nada a subir. `bun.lock`:
  as três linhas de workspace, a entrada do UI (0.10.0, com o `sha512` do npm) e a do contracts (0.6.0, o `sha512` que a API já usava), e
  **saíram** as duas entradas aninhadas `@transportada/api/@adatechnology/conversation-contracts` (e o `zod` dela), que viraram a cópia
  única da raiz. `bun install` (Bun 1.4.3) reescreveu mais coisa (poda de `lightningcss*`, mudança de `@adatechnology/audio-transcription-provider`
  de lugar entre API e worker): descartado com `git checkout bun.lock` e refeito à mão só com essas linhas;
  `bun install --frozen-lockfile` → "Checked 814 installs across 942 packages (no changes)".
- **Contrato do pacote lido do tarball** (`npm pack` 0.10.0 / 0.6.0, `dist/participant/index.d.ts` + README): a prop é
  `audioRecording?: ParticipantAudioRecordingOptions` (`maxDurationMs?`, `maxSizeBytes?`, `onCaptureChange?`); os rótulos novos são
  `Partial<ParticipantAudioLabels>` dentro de `ParticipantConversationsLabels` (todos opcionais), com os 25 nomes do `contract.md` §4;
  `participantTranscriptionSchema`, `PARTICIPANT_AUDIO_DURATION_MAX_MS` e `PARTICIPANT_TRANSCRIPTION_*` saem de `conversation-contracts`.
- **Rótulos** (14 chaves do player e da transcrição, sem as do gravador, que entram na T4.3): `conversation.locale.json` e
  `conversation.en.locale.json` do motorista (`labels.*`); `subjectConversation.locale.json` e `.en` do painel (`thread.labels.*`) mais as
  mesmas chaves em `SUBJECT_THREAD_LABEL_KEYS` (a lista `satisfies keyof ParticipantConversationsLabels`). O portal só usa o pacote do
  operador (`DateDivider`, `MessageText`, `resolveMaxAttachmentSizeBytes`), não a visão do participante: subiu a versão e nada mais.
- **Vermelho primeiro.** Contratos novos, rodados contra `package.json`/locales sem a subida: motorista
  `test/conversation/conversation-sdk-audio-labels.contract.ts` → **156 pass / 3 fail** (versões, pt-BR, en); painel (acrescentado a
  `subject-thread-api.contract.ts`) → **128 pass / 4 fail** (versões, repasse ao SDK, pt-BR, en); portal
  `test/shared/conversation-sdk-versions.contract.ts` → **28 pass / 1 fail** (versões). Com a subida: motorista 159 pass / 0 fail.
- **Testes que prendiam o markup antigo (`<audio controls>`):** nenhum nas três apps. A busca por `<audio`/`controls` em `apps/**` só acha
  o `ConversationAudioPlayer` e o `ConversationAudioRecorder` do painel (a tela **antiga** da ocorrência, componentes próprios e
  intocados), o `<audio>` nativo do portal (`OccurrenceConversation.component.tsx`, tela do operador do pacote antigo) e comentários.
  Nenhum golden/teste das apps renderiza o `ParticipantAttachmentItem` do pacote. Sem teste atualizado nesta task.
- **Gates por app** (via WSL, cwd = a app):
  - `frontend-driver`: `tsc --noEmit` → 0; `eslint` nos `.ts` tocados → limpo; `prettier --check` → limpo; `bun run test` → **1694 pass / 0 fail**;
    `bun run build` (`vite build` + `dist.contract`) → ok, 6 pass.
  - `frontend-client`: `tsc` → 0; `eslint` → limpo; `prettier --check` → limpo; `bun run test` → **91 pass / 0 fail** (o contrato novo de versões incluído);
    `bun run build` → ok. Portal sem mudança de código.
  - `frontend-transportada`: `tsc` → 0; `eslint` nos `.ts` tocados → limpo; `prettier --check` → limpo; `bun run build` → ok (3m34s).
    `bun run test` (script do `package.json`, nunca `bun test` cru): **7972 pass / 15 fail**, e os 15 são todos _timeout_ de varredura de
    `src/` no `/mnt/c` (5 000 ms a 22 s), com três gates rodando em paralelo: o catálogo de ocorrência órfão, classes de CSS Module, a CSP
    (origem externa ×2), mapa antigo removido, tokens CSS, design system (botão), pending state de mutação, OpenCV, `sendBeacon`, regex
    `(?i:)`, `VITE_*` ×3 e o writer de Excel. Nenhum falha por asserção. Repetido sozinho com `--timeout 120000` (o mesmo script, a
    mesma lista): **7987 pass / 0 fail** em 281 s (+ o segundo `bun test` do script, 1332 pass / 0 fail).
  - API (paridade da transcrição, só `devDependency`): `bun --env-file=../../.env.test test ./test/occurrence-conversation/participant-transcription-parity.contract.ts`
    → **29 pass / 0 fail**, com o contracts 0.6.0 da raiz do `bun.lock` (a cópia aninhada saiu).
- **Smoke do portal:** sem mudança de código nem de CSP no portal; só a versão de duas dependências que o portal usa em `DateDivider`,
  `MessageText` e `resolveMaxAttachmentSizeBytes`. O smoke Playwright do portal exige o stack local (Keycloak, API) e Chromium e **não foi
  executado** nesta sessão (ver o fim da T4.4).

## T4.2 — contratos do app do motorista, vistos vermelhos (2026-10-13)

Contratos escritos **antes** de qualquer código da T4.3, e rodados contra a árvore sem ele (os 18 arquivos de código da T4.3 e o
`scripts/` da demonstração foram devolvidos ao `HEAD` para a medida). Todos entram nos agregadores existentes
(`test/conversation.contract.test.ts` e `test/shared.contract.test.ts`), que já estão na lista do `package.json`.

| Contrato                                                                  | Prende                                                                                                                                                                                                                                                                                                                                                                                                               | Vermelho                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `test/shared/security-headers.contract.ts` (editado)                      | `Permissions-Policy` exato `camera=(self), geolocation=(self), microphone=(self)`                                                                                                                                                                                                                                                                                                                                    | 1 fail                                                      |
| `test/shared/content-security-policy.contract.ts` (editado)               | `media-src 'self' blob: <storage>`; sem bucket, `media-src 'self' blob:`                                                                                                                                                                                                                                                                                                                                             | 2 fail                                                      |
| `test/conversation/driver-conversations-transcription.contract.ts`        | por anexo: `participantTranscriptionSchema.safeParse` (6 formas válidas passam; status desconhecido, texto > 40 000, `generatedAt` sem fuso, `text` não-string e valor que não é objeto fazem **o campo** sumir e a página seguir); `durationMs` por guarda (negativo, zero, fracionário, texto, > 24 h somem); `transcriptionUpdatedAt` no snapshot e no `diffConversationSnapshots`, sem vazar ao resumo do pacote | 15 fail / 1 pass                                            |
| `test/conversation/conversation-outbox-limit.contract.ts`                 | `CONVERSATION_OUTBOX_LIMIT = { 100, 48 MiB }`; texto entra até 100 mesmo com 48 MiB de áudio; 101ª recusada; 30 + 18 MiB + 1 recusado e 30 + 18 MiB aceito; `QuotaExceededError` vira recusa e outro erro do IndexedDB continua erro; recusada nunca esteve na fila e o "Sair" descarta só o que estava                                                                                                              | falha de carga (`CONVERSATION_OUTBOX_LIMIT` não existe)     |
| `test/conversation/driver-audio-recording.contract.ts`                    | `audio` em `CAPTURE_KINDS`, ponte `onCaptureChange` → `captureRegistry` sem empilhar; a página liga `audioRecording` sem teto próprio; aviso `outboxFull` até algo sair da fila; `outboxFull` em pt-BR e en                                                                                                                                                                                                          | falha de carga (serviços novos não existem)                 |
| `test/conversation/conversation-sdk-audio-labels.contract.ts` (estendido) | os 11 rótulos do gravador em pt-BR e en, com `{elapsed}` e `{limit}`                                                                                                                                                                                                                                                                                                                                                 | 2 fail / 1 pass                                             |
| `test/conversation/driver-preview-audio.contract.ts`                      | demonstração: quatro estados de transcrição, `__debug/transcription-ready` avança `pending → ready` e muda o `transcriptionUpdatedAt`, áudio enviado nasce `pending`, WAV tocável                                                                                                                                                                                                                                    | falha de carga (módulo de áudio da demonstração não existe) |

- **Alteração deliberada de teste existente** (`driver-preview-conversations.contract.ts`): a lista de tipos de assunto do resumo ganha uma
  segunda nota (`NF 900202 · Áudios`, a conversa semeada com os quatro estados); `conversation-refresh.contract.ts`: o auxiliar de
  snapshot passa a levar `transcriptionUpdatedAt: null`, campo novo do `ConversationSnapshotEntry`.
- Rodado: `bun test ./test/conversation/<arquivo>.contract.ts` por arquivo (a falha de carga de um deles derruba o agregador inteiro, então
  o vermelho fino vem de cada um) e `bun test ./test/shared.contract.test.ts -t "media-src|microfone"` → 3 fail / 0 pass.
- `tsc` e `eslint` ficam vermelhos de propósito neste commit (imports de módulos que a T4.3 cria); fecham na T4.3.

## T4.3 — o app do motorista grava, valida e enfileira com teto (2026-10-13)

- **Verde nos contratos da T4.2** (`apps/frontend-driver`, via WSL): `test/conversation.contract.test.ts` **193 pass / 0 fail** (eram 8 fail
  na primeira rodada com a implementação: o candidato do anexo levava `transcription: undefined` e `durationMs: undefined` como **chave
  presente** — o zod 3 as devolve, e o tipo do contracts (`exactOptionalPropertyTypes`) as recusaria —, e o protocolo semeado `A7U1` tinha um
  `1`, fora do alfabeto do protocolo; corrigidos com `...(valor === undefined ? {} : { valor })` e `A7U2`). Suíte inteira do app
  (`bun run test`, o script do `package.json`): **1730 pass / 0 fail**; `bun run build` (`vite build` + `dist.contract`) → ok, 6 pass, o
  precache segue dentro de 1,5 MiB (o gravador e o player vêm no chunk preguiçoso do pacote).
- **Gates:** `tsc --noEmit` → 0; `eslint scripts server.ts src test/conversation test/shared` → limpo; `prettier --check` → limpo. Paridade
  da transcrição na API com o contracts 0.6.0 da raiz (`participant-transcription-parity.contract.ts`) → 29 pass / 0 fail.
- **Cabeçalhos:** `server.ts` emite `camera=(self), geolocation=(self), microphone=(self)`; `buildContentSecurityPolicy` ganha
  `media-src 'self' blob: <storage>` (origem do bucket por `VITE_OBJECT_STORAGE_URL`, a mesma do `connect-src` e do `img-src`; sem bucket,
  `'self' blob:`). O `vite.config.ts` não muda: a política sai do mesmo `buildContentSecurityPolicy` no build, no `preview` e no `dev`.
- **Adapter** (`driverConversationsMapper.service.ts`): `readTranscription` (`participantTranscriptionSchema.safeParse`, `null`/ausente/inválido
  somem) e `readDurationMs` (inteiro positivo ≤ `PARTICIPANT_AUDIO_DURATION_MAX_MS`) por anexo; `readTranscriptionUpdatedAtBySubject` lê o
  campo do payload da lista, `ConversationSnapshotEntry` ganha `transcriptionUpdatedAt` e o `diffConversationSnapshots` o compara. O
  campo não entra no resumo do pacote (o schema não o conhece), como o `officeReadAt`.
- **Fila** (`conversationOutboxLimit.service.ts`, `conversationOutbox.service.ts`): `CONVERSATION_OUTBOX_LIMIT = { maxCount: 100, maxFileBytes: 48 MiB }`
  (`driverConversation.constant.ts`) conferido **antes** de `store.put`; `maxFileBytes` só soma e só vale com mensagem com arquivo; a contagem é
  do aparelho inteiro (`store.readAll()`, todos os donos), porque a cota do IndexedDB também é. Recusa (teto ou `QuotaExceededError` do `put`)
  emite `enqueue-refused` e lança `DriverConversationRequestError('DRIVER_CONVERSATION_OUTBOX_FULL')`; o pacote trata o `sendMessage` que lança
  como "Falhou — toque para reenviar" (a bolha local, só na memória). `useConversationOutbox` guarda o aviso (`conversationOutboxNotice.service.ts`)
  até uma mensagem sair da fila, e a página o mostra como `role="alert"` acima da conversa (`outboxFull`). O "Sair" segue
  `conversationOutboxDiscard.service.ts`, sem mudança: a recusada nunca esteve no store.
- **Gravação:** `audio` em `CAPTURE_KINDS`; `createAudioCaptureBridge(captureRegistry)` (`driverAudioCapture.service.ts`) liga o
  `onCaptureChange` ao `open`/`close('audio')` sem empilhar aviso repetido; `DriverConversations.page.tsx` passa
  `audioRecording={AUDIO_RECORDING}` (objeto de módulo, sem `maxDurationMs`/`maxSizeBytes`: valem os do pacote, 5 min e 16 MiB).
- **Locales:** os 11 rótulos do gravador e `outboxFull` em `conversation.locale.json` e `.en`.
- **Demonstração** (`scripts/driver-preview-*`): conversa de nota `NF 900202 · Áudios` (`00000000-0000-4000-8000-000000000299`) com quatro
  áudios do escritório, um por estado (`audio-pending`, `audio-ready`, `audio-failed` com `too_long` e 600 000 ms, `audio-disabled`); áudio
  enviado pelo app nasce `pending`; `POST /__debug/conversations/transcription-ready` `{attachmentId?}` avança `pending → ready` e muda o
  `transcriptionUpdatedAt` do resumo; o storage da demonstração serve um WAV mudo de 3 s para `audio/*`. Ela ficou numa **nota** (não
  numa 7ª ocorrência) para não mudar a contagem da rota antiga, que só lista ocorrências.
- **Desvios:** (1) o aviso `outboxFull` é um banner da página, não texto do pacote — o SDK não tem slot para isso; (2) a recusa por teto
  conta todas as mensagens do aparelho (não só as do dono da sessão). Nenhum teste existente foi enfraquecido; mudanças deliberadas já
  registradas na T4.2.
