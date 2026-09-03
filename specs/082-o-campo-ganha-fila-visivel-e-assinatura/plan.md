# Plano — spec 082

Ordem de execução casada com o goal (`.omc/ultragoal/plans/1788457587718-.../goals.json`).
Worktree: `transportada-wt/driver-pwa` (branch `work/driver-pwa`).

## Fase 1 — ADRs e contratos (G001, fecha com esta spec)

> 🤖 Modelo: `opus`/`fable` 🧠

- ADR-0057: o comprovante é configurável, e o documento do recebedor entra com envelope
  (revisa ADR-0045 §7; nomeia campos, AAD, máscara, retenção).
- ADR-0058: o motorista abre a porta do despacho (revisa quem chama `dispatch`; a máquina não muda).

## Fase 2 — API (G002)

> 🤖 Modelo: `sonnet` (schema/criptografia 🧠 validar com `opus`)

1. `company_delivery_proof_settings` + exceções por CNPJ (migration aditiva, CHECKs, tenant).
2. Rotas `GET/PUT /company-settings/delivery-proof[...]` (`settings.manage`) + leitura pelo app
   embutida no snapshot de `/me/trips/current` (o app não ganha rota de settings própria).
3. `proof` aceita `receiverDocument` quando a configuração pede; envelope + máscara nas leituras.
4. `POST /me/trips/current/dispatch` (vínculo próprio, `route_planned`, idempotente, snapshot).
5. Contratos: tenant-safety das tabelas novas, negativo de log do documento, integração
   `me-trip.integration.ts` estendida (dispatch → entrega com assinatura → ocorrência).

## Fase 3 — Worker (G003)

> 🤖 Modelo: `sonnet`

1. Chaves `OCCURRENCE_*` em `NOTIFICATION_TEMPLATE_KEY` (por motivo de ocorrência).
2. Disparo pelo trilho `notification.v1` no processamento da ocorrência; sem template → só grava.
3. Contrato de paridade das chaves (api/worker/frontend, cópia por valor).

## Fase 4 — Shell do app (G004)

> 🤖 Modelo: `sonnet`

1. `driver-trip` ganha navegação interna (Viagem · Perfil), header com marca/empresa/foto do
   motorista, barra de progresso derivada das paradas. Radius 0; contratos de design system.

## Fase 5 — Fila offline visível (G005)

> 🤖 Modelo: `sonnet` (modelo de dados da fila 🧠)

1. Fila passa a aceitar anexo (arquivo no IndexedDB, teto declarado, descarte anunciado).
2. Tela de eventos pendentes: lista, causa de falha, envio manual por evento e em lote.

## Fase 6 — Entrega (G006)

> 🤖 Modelo: `sonnet`

1. Distância haversine + Abrir no Maps na parada.
2. Assinatura em canvas + tela inteira landscape com lock (fallback iOS por CSS).
3. Recorte do comprovante no aparelho (detecção de bordas + ajuste manual).
4. Campos do comprovante dirigidos pela configuração (D4).

## Fase 7 — Ocorrência (G007)

> 🤖 Modelo: `sonnet`

1. Motivo por chips → prévia do template renderizado; fotos local/carga pela fila.

## Fase 8 — Gate (G008)

> 🤖 Modelo: `sonnet` + revisão `opus`

`make check`, contratos novos listados nos `package.json`, evidência em `evidence.md`,
ai-slop-cleaner + verificação + code review; publicar `git push origin HEAD:staging` após aprovação.
