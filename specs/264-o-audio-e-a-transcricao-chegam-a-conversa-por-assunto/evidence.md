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
