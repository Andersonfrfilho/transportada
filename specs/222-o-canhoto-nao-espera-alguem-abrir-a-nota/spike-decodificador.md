# Spike T4.1 — decodificar imagem no servidor

Medido em 2026-10-01, Bun 1.3.14, macOS (Darwin 25.5.0), num diretório descartável fora do
repositório — nenhuma dependência entrou no `package.json` de nenhuma app para fazer esta medição.

## O que foi exercitado

Ponta a ponta, o caminho que a Fase 6 vai percorrer: **bytes da foto → luminância → zxing
`Code128Reader` → chave de acesso**. O gerador do código de barras é o do próprio produto
(`apps/frontend-transportada/src/components/ui/code128.service.ts`, `encodeCode128C`), então a
chave lida é comparada com a chave que desenhou a imagem — `casou=true` significa igualdade exata
dos 44 caracteres, não "achou algum código".

Chave usada: `35240912345678000199550010000123451876543212` (a mesma do fixture do frontend).

## Candidatos

| Biblioteca                 | Natureza         | JPEG  | PNG   | WebP  |
| -------------------------- | ---------------- | ----- | ----- | ----- |
| `sharp` 0.35.5             | nativo (libvips) | 12 ms | 15 ms | 20 ms |
| `@jsquash/{jpeg,png,webp}` | wasm             | 22 ms | 24 ms | 27 ms |

Imagem chapada de 2400x1800 (4,3 MP), mediana de 5 execuções, processo principal. Os dois casaram
a chave nos três formatos.

## No `worker_thread`, com foto de peso de câmera

ADR-0053 exige a decodificação fora do event loop, então a medição que vale é esta — `@jsquash` em
`worker_thread`, foto de 3024x4032 (12,2 MP):

| Formato  | Bytes   | decode + leitura | Com o spawn do worker | RSS do worker | Casou |
| -------- | ------- | ---------------- | --------------------- | ------------- | ----- |
| JPEG q85 | 1,1 MB  | 101 ms           | 115 ms                | ~209 MB       | sim   |
| PNG      | 10,7 MB | 179 ms           | 194 ms                | ~300 MB       | sim   |
| WebP q85 | 3,9 MB  | 312 ms           | 323 ms                | ~271 MB       | sim   |

E com os **flags de empacotamento do worker** (`bun build --target=bun --packages=external`), que é
como ele sobe no Railway: 107 ms, casou. O `.wasm` resolve de `node_modules` em tempo de execução,
sem passo de build próprio e sem binário por plataforma.

## Um achado que muda a Fase 6

A primeira foto sintética **não casou em JPEG** (casou em PNG e WebP). A causa não é o decodificador:
eu havia preenchido as próprias barras com granulado aleatório, e o JPEG com perda destrói esse
ruído de alta frequência. Com **barras sólidas e papel levemente granulado** — que é como um canhoto
fotografado se parece — o mesmo JPEG q85 de 12 MP casou em 101 ms.

Consequências para a T6.4:

- O fixture do contrato tem de ser um **JPEG realista** (barra sólida, fundo granulado leve). Um
  fixture chapado esconde o caso ruim; um fixture com ruído dentro da barra inventa um defeito.
- Foto que o leitor não decodifica **não é defeito**: fica `pending` (RF-B7). A régua do que é
  aceitável já existe e é o navegador — ele lê o mesmo JPEG hoje.

## Decisão (entra na T4.2 / ADR-0092)

**`@jsquash/{jpeg,png,webp}` (wasm)**, não `sharp`. O `sharp` é ~2x mais rápido e isso não decide
nada aqui: 101 ms numa foto de 12 MP dá ~4 s de CPU para um ciclo de quarenta canhotos, contra uma
batida de 300 s. O que decide é o `bun install --frozen-lockfile` da CI e do Railway não depender de
binário nativo por plataforma — o `sharp` traz um pacote de prebuild por sistema e arquitetura, e é
exatamente esse tipo de dependência que falha no ambiente em que ninguém testou.

`sharp` fica anotado como alternativa se algum dia a rotina precisar **redimensionar** (recorte,
miniatura) e não só decodificar.

## Teto de bytes (RNF3)

O PNG de 12 MP deu 10,7 MB, e o RSS do worker chegou a ~300 MB decodificando-o. O teto de bytes
precisa existir antes do decode e ser lido do `stored_objects` (tamanho gravado), não do download.
Partir de **8 MB** cobre JPEG e WebP de câmera com folga e corta o PNG gigante, que é raro no
caminho do motorista.
