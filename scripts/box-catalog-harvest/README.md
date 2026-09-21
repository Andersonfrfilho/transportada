# box-catalog-harvest

Coleta local da dimensão de caixa master pela página pública do Cosmos, **assistida no seu
navegador** (userscript) com gravação em JSONL local. **Não escreve no banco.**

## Por que captura assistida e não automação

A página pública do Cosmos (e até o `robots.txt`) responde `403` com o desafio do Cloudflare para
acesso automatizado (medido em 2026-09-21). A spec 161 (RF04) não contorna o desafio — o cron de
amanhã detecta e para com `BLOCKED_BY_CHALLENGE`. Enquanto a automação não existe, a captura
assistida aproveita a **sua** sessão de navegador (onde o Cloudflare já deixou passar) e o fluxo
paralelo de dados em produção segue andando sem token nem cota.

Observação: quem preferir coletar por API vale lembrar que a API oficial do Cosmos devolve o mesmo
dado de caixa (token grátis, 25 consultas/dia) — foi a tentativa anterior, abandonada pela fila de
produção ser maior que a cota diária.

## Como roda

0. `scripts/box-catalog-harvest/export-pending-queue.sh` — o Postgres de produção **não tem proxy
   público** (e não deve ter), então a fila sai por `railway ssh` no serviço `api`, numa transação
   `READ ONLY`, para `~/.config/transportada/pending-gtins.json` (só GTIN da caixa e contagem).
   Rode de novo quando quiser atualizar a fila.
1. `bun scripts/box-catalog-harvest/assisted-capture-server.ts` — sobe em `http://127.0.0.1:53999`,
   lê a fila do arquivo acima (ou de `DATABASE_URL`, se não houver arquivo) e imprime o token.
2. Instale `cosmos-capture.user.js` no Tampermonkey e, no menu do script, cole o token uma vez.
3. O servidor abre a primeira página. O userscript lê a ficha técnica, extrai a dimensão da caixa e
   envia ao servidor; **o avanço é sempre um clique ou Alt+N seu** — nada navega sozinho.
4. Cada envio grava uma linha no JSONL; o servidor pula GTIN já capturado e ignora envio fora da
   fila.

Componentes:

- `cosmos-capture.user.js` — userscript (Tampermonkey) que lê o DOM da página aberta e posta o
  resultado no servidor local. Não contorna desafio (`if (document.title.includes('Just a moment'))
return`).
- `assisted-capture-server.ts` — `Bun.serve` local com token (`~/.config/transportada/capture-token`,
  `0600`), entrega `/next`, recebe `/capture` (valida `unitGtin`, `status`, `pageUrl`).
- `harvest-queue.ts` — fila de GTINs pendentes (produção, `READ ONLY`), derivação GTIN-14 → GTIN-13
  da unidade e o JSONL de saída.

## Quando o Cosmos não tem a medida

O painel mostra **Buscar GTIN** e **Buscar ficha logística** (abrem o Google numa aba nova) e
**Pular (Alt+N)**. Achou a medida em qualquer site (fabricante, distribuidor, PDF aberto no Chrome):
**selecione o texto** e aperte **Alt+C**. Vale `47,4 x 24,7 x 24,0 cm` ou Comprimento/Largura/Altura.
A linha entra como `found_manual`, com `source` = domínio da página, e o painel oferece
**Voltar para a fila (Alt+N)**. O userscript roda em todo site, mas só age no Alt+C e só envia o
texto selecionado.

## Comportamento

- `found` **não é medida validada**: o Cosmos grava cm no lugar de mm e kg no lugar de g com
  frequência (ver fixture da spec 160). A checagem de sanidade da 160 decide antes de qualquer
  promoção.
- Status possíveis no JSONL: `found`, `no_dimensions`, `not_found` (e `carton_mismatch` registrado
  quando a página não corresponde à fila).

Saída: `~/Library/Application Support/transportada/box-catalog-harvest.jsonl`.
Log: saída do `Bun.serve` no terminal.
