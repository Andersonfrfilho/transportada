# Plano técnico — 079

## Contexto e premissas

O detalhe da viagem (`TripDetail.component.tsx`) já mostra situação, paradas, notas e ações. Esta
spec **acrescenta leitura**, não escrita: o motorista já grava comprovante e ocorrência por
`/me/current-trip/...`, e a reordenação de paradas já existe com `@dnd-kit`.

Duas premissas que vêm das decisões da spec e mandam no plano:

- **P2 e P3 estão atrás de dependência externa** — a ADR do contato do destinatário e a feature de
  consentimento do motorista. Elas não entram no `tasks.md` daqui.
- **Nada de origem externa nova.** Mapa e animação são SVG nosso; a CSP declara `frame-src 'none'`
  desde a ADR-0037, e o contrato de CSP varre `https://` no código.

## Arquitetura e arquivos afetados

Frontend, módulo `trip`. A regra pura mora em `shared/*.service.ts` porque **o teste desta app não
tem DOM**: o comportamento se prova na função, e a fiação se cobra por texto de fonte.

```
trip/shared/cargoWeightOrigin.service.ts    origem do peso (declarado · itens · volume · ausente)
trip/shared/tripProgress.service.ts         progresso e previsão, derivados das notas
trip/shared/deliveryProof.service.ts        o que a entrega concluída expõe
trip/shared/tripRouteMap.service.ts         projeção das paradas para o SVG
trip/components/TripVehiclePanel.component.tsx    ocupação + desenho do veículo
trip/components/TripProgressBar.component.tsx     barra e porcentagem
trip/components/TripRouteMap.component.tsx        mapa das paradas
trip/components/TripDeliveryProof.component.tsx   prova da entrega
```

⚠️ **A API precisa devolver o que a tela lê.** O comprovante hoje é gravado e não é servido ao
operador: falta rota de leitura em `trips/presentation/`. É a única parte de backend desta spec.

## Contratos/API/eventos

| rota                                         | quem         | por quê                         |
| -------------------------------------------- | ------------ | ------------------------------- |
| `GET /trips/:id/documents/:documentId/proof` | `fleet.read` | serve o comprovante ao operador |

O corpo devolve **URL assinada**, nunca o binário nem link permanente — mesmo padrão do anexo do
agregado. Comprovante é foto de porta de cliente: link eterno num histórico é vazamento com prazo
indeterminado.

## Dados, migration e rollback

**Nenhuma migration.** Tudo que a tela lê já existe: `trip_documents` (estados e horários),
`delivery_proofs`, `nfe_volumes`, `nfe_addresses`, `geocoded_addresses`.

O peso por item é o único que pode faltar coluna — a **T007** confere antes de assumir; se o item
da NF-e não estiver persistido com peso, a decisão da spec cai sozinha em volume, sem migration.

## Segurança e tenant

- Toda consulta nova leva `context.companyId`, e o contrato de isolamento em
  `test/*-schema/tenant-safety.contract.ts` é obrigatório na rota nova.
- **Nenhum campo sob a ADR-0039 aparece** (CA5). Um contrato varre a tela por `birthDate`, `phone` e
  `licenseNumber` e reprova se algum entrar.
- A URL do comprovante é assinada e de vida curta.

## Idempotência e concorrência

Leitura pura: não há efeito a repetir. A previsão de término é derivada a cada render, nunca
persistida — número guardado envelhece e passa a mentir sem ninguém notar.

## Observabilidade

Nada novo. A rota do comprovante herda o `correlationId` do router.

## Estratégia de testes

1. **Regra pura primeiro**, com contrato antes da implementação.
2. **Fiação por texto de fonte**, como `test/trip/scan-link.contract.ts` faz.
3. **Smoke em 375px** para o painel novo, com a asserção de ausência de rolagem horizontal que os
   casos existentes já usam.
4. **Prova por mutação** de cada contrato novo: quebrar a regra e ver o contrato reprovar.

## Riscos

⚠️ **O roteiro não enxerga a coordenada refinada.** Medido em staging em 2026-09-02: nove endereços
refinados com sucesso pelo Google (`outcome: refined`), e a sugestão seguinte manteve `1.6 km` e
remarcou as doze paradas como "endereço errado". **O mapa desta spec lê a mesma fonte** — se o
defeito for na junção `geocoded_addresses` × parada, o mapa nasce com o mesmo buraco. **T009 confere
isso antes de desenhar**, e para a spec se o defeito estiver lá.

⚠️ **Animação sem informação é enfeite com custo.** A task declara por escrito o que ela comunica
além da barra, e um contrato guarda `prefers-reduced-motion`.

⚠️ **Previsão de término com dado ruim vira promessa.** Sem entregas medidas, o tempo de parada é o
padrão da empresa (600s) — a tela diz isso, como a de roteiro já faz.
