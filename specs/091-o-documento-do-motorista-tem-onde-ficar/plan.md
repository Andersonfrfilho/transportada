# Plano — 091 O documento do motorista tem onde ficar

## Ordem, e por que ela é esta

A D1 manda a cifra vir antes do arquivo. O motivo é irreversibilidade: coluna em claro se migra com
um `UPDATE`; arquivo em bucket, não. Cada documento que entrar antes da cifra é uma cópia do CPF que
depois precisa ser reescrita objeto a objeto, com o bucket já espalhado por ambiente.

Por isso a Fase 1 **não é** desta feature — é a ADR-0039, decidida em 20/08/2026 e nunca executada.
Ela entra aqui porque esta é a primeira feature que a torna bloqueante em vez de recomendável.

## Fase 1 — A ficha do motorista se criptografa (ADR-0039)

> 🤖 Modelo: `opus` 🧠 — envelope, AAD e índice cego são decisões de segurança, e migração com perda
> não tem segunda chance.

Treze colunas para o envelope A256GCM, AAD `transportada:fleet-driver:v1:${companyId}:${driverId}`,
índice cego com HMAC para a CNH seguir única por empresa. `tax_id`, `linked_tax_id`, `name` e
`license_expires_at` ficam em claro por decisão registrada na ADR.

⚠️ Expansão e contração em migrations separadas, com rollback ao lado. A contração derruba as treze
colunas antigas e **não** volta com os valores.

## Fase 2 — A tabela e as rotas

> 🤖 Modelo: `sonnet` — CRUD com contrato de tenant, o padrão do repositório.

`fleet_driver_attachments`, as três rotas da R2, `fleet.reveal` no catálogo e nos papéis. A
permissão nova custa migration nos dois CHECKs de papel, como a `separator` custou.

## Fase 3 — A leitura do documento

> 🤖 Modelo: `sonnet` — o gateway já existe; aqui é fiação.

Reuso de `document-extraction.gateway.ts` e `extractCnhFields`. `worker_thread` para PDF, como a 070. Leitura que não reconhece nada grava `null` e fecha.

## Fase 4 — A ficha do motorista ganha os anexos

> 🤖 Modelo: `sonnet` — `FileField` já existe e o contrato já reprova input cru.

Lista com tipo, data e quem anexou sob `fleet.read`; anexar e substituir sob `fleet.manage`;
revelar sob `fleet.reveal`. A sugestão de preenchimento da CNH é oferta, nunca gravação.

## Fase 5 — Auditoria e descarte

> 🤖 Modelo: `sonnet`, com revisão `opus` no caminho de remoção 🧠.

Trilha em anexar, substituir, remover e **revelar**. Remoção do motorista apaga os objetos na mesma
transação — órfão em bucket é PII que ninguém sabe que existe.

## Riscos

- **A contração da Fase 1 é destrutiva.** Sem backup verificado antes, não roda.
- **`fleet.reveal` nasce sem consumidor até a Fase 4.** É o mesmo estado de `trip.read` hoje, e o
  `CLAUDE.md` já registra que permissão sem rota confunde quem lê depois — a Fase 2 declara isso.
- **O bucket de staging e o de produção não compartilham credencial** (`security.md` §7): o teste de
  remoção precisa rodar contra bucket descartável, não contra o de ninguém.
