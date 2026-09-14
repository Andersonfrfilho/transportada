-- Spec 102 D3: solta a carga das viagens **já canceladas**.
--
-- Até a spec 102, `markCancelled` só trocava `trips.status` — não tocava em `trip_documents`. E quem
-- decide se uma nota está disponível olha `released_at`, nunca o status da viagem. Toda viagem
-- cancelada antes desta migration segurava a carga dela para sempre, e cancelar de novo não
-- resolvia: o caso de uso é idempotente e devolve `unchanged` sem escrever.
--
-- ⚠️ **Marca, não apaga.** A linha permanece com `released_at` preenchido — ela é a única prova de
-- que aquela nota chegou a ser carregada naquela viagem, e é o histórico que o produto promete.
--
-- ⚠️ **`stop_id` não é zerado**, pela mesma razão do caminho de runtime: a viagem cancelada não vai
-- ser reordenada, e manter a referência preserva o roteiro como ele foi planejado. Zerar produziria
-- paradas vazias na tela e todas as notas no balde "Sem parada".
--
-- ⚠️ **Nota entregue não volta ao pool** (`delivered_at is null`): ela chegou ao destino, e
-- devolvê-la a ofereceria para uma segunda entrega da mesma carga. O CHECK da tabela também proíbe
-- ter `delivered_at` e `released_at` na mesma linha.
--
-- ⚠️ `updated_at` **não** é tocado de propósito: ele é o carimbo da operação, e mexer nele em massa
-- faria toda nota antiga parecer alterada hoje, poluindo qualquer leitura por recência.
update trip_documents as td
set released_at = now()
from trips as t
where t.company_id = td.company_id
  and t.id = td.trip_id
  and t.status = 'cancelled'
  and td.released_at is null
  and td.delivered_at is null;
