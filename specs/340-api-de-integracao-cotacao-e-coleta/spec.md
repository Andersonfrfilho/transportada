# Spec 340 — API de integração: cotação e pedido de coleta

**Origem:** pedido do Anderson (2026-11-15): "essas cotações de frete seria bom disponibilizarmos para integração" e "a solicitação de viagem também", com doc só das rotas necessárias e worker para alto volume.

## Decisões

- **D1. Chave de API por empresa, não Keycloak.** O parceiro não tem usuário. `Authorization: Bearer tms_…` (256 bits). Só o hash SHA-256 fica no banco (`integration_api_keys`); a chave inteira aparece uma vez, na criação. Revogar marca `revoked_at`; nada se apaga (rastro).
- **D2. Capacidades por chave** (`quote`, `pickup`): a chave leva só o que o admin marcou. Sem a capacidade, 403.
- **D3. Rotas anônimas para o roteador** (`defineAnonymousRoute`): a credencial é a chave, resolvida no `parse`. A empresa vem da chave, nunca do corpo. Balde por IP e por chave, no Postgres (vale entre réplicas).
- **D4. O parceiro vê o mínimo.** Cotação devolve só `total`, `validUntil` (7 dias) e `currency`. Pedido devolve estado, janelas e `scheduled`; nunca contratante, viagem, documento ou a nota de aceite.
- **D5. O pedido é o da 339**, `source = 'integration'`, sem contratante (D4 da 339: cliente entra no cadastro só na aceitação). `pickup_requests.integration_key_id` limita quem lê e cancela: outra chave recebe 404.
- **D6. Volume.** As rotas só gravam; e-mail e WhatsApp saem pela caixa de saída entregue pelo worker (T4 da 339). A cotação é só cálculo em memória e uma leitura de parâmetros.
- **D7. Distância vem do parceiro (`distanceKm`).** Calcular por endereço exigiria geocodificação e rota na chamada pública; fica como decisão aberta.
- **D8. Webhook fora desta versão.** É opcional no contrato; exige segredo selado por chave, política anti-SSRF e entrega com tentativas no worker. Proposta para a próxima etapa.

## Fora de escopo

Tela de administração das chaves no painel (hoje `POST/GET /integration-keys`, `POST /integration-keys/:id/revoke`, `settings.manage`), webhook, rota de listagem de pedidos, cotação por endereço.
