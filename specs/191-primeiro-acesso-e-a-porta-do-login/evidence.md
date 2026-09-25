## T7.3 — chave `RATE_LIMIT_SUBJECT_HMAC_KEY` (2026-09-25)

O usuário criou a chave nos dois ambientes com `railway variables --service api --set
"RATE_LIMIT_SUBJECT_HMAC_KEY=$(openssl rand -hex 32)"`. O orquestrador conferiu, sem imprimir os
valores: staging e produção têm 64 caracteres hexadecimais (32 bytes) e valores distintos. A chave
de produção foi gerada duas vezes, e vale a segunda. Nenhum código a lia ainda.
