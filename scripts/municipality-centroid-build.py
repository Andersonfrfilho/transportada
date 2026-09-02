#!/usr/bin/env python3
"""Gera o centroide de cada município a partir da malha do IBGE (spec 069, T007).

Roda **uma vez**, à mão, e o resultado é versionado: o último degrau da cascata de geocodificação só
é consultado quando o provedor e o CEP já falharam, e é o pior lugar possível para depender de rede.

O centroide é o da **área** (fórmula do laço de sapato, com os furos subtraídos), não o centro da
caixa envolvente — que num município em forma de foice cai fora dele. Ilha e enclave entram como
polígonos do mesmo município e são somados por área, então a ilhota não puxa o ponto.

⚠️ O centroide de área ainda pode cair fora de um município muito côncavo. É aceito de propósito:
esta coordenada nasce com precisão `city` e **nunca entra na otimização** (ADR-0044 §5) — ela existe
para o endereço ter um ponto no mapa e para o conferente ver que aquilo é palpite, não parada.
"""

import gzip
import json
import sys
import time
import urllib.request

MESH_URL = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados'
STATES = [
    'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
    'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]
PAUSE_SECONDS = 1.0


def ring_area_and_centroid(ring):
    """Laço de sapato. Devolve (área com sinal, cx, cy) — o sinal diz se o anel é furo."""
    area2 = cx = cy = 0.0
    for index in range(len(ring) - 1):
        x0, y0 = ring[index][0], ring[index][1]
        x1, y1 = ring[index + 1][0], ring[index + 1][1]
        cross = x0 * y1 - x1 * y0
        area2 += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if area2 == 0:
        return 0.0, 0.0, 0.0
    return area2 / 2.0, cx / (3.0 * area2), cy / (3.0 * area2)


def polygons_of(geometry):
    kind = geometry['type']
    if kind == 'Polygon':
        return [geometry['coordinates']]
    if kind == 'MultiPolygon':
        return geometry['coordinates']
    raise ValueError(f'geometria inesperada: {kind}')


def centroid_of(geometry):
    total = weighted_x = weighted_y = 0.0
    for polygon in polygons_of(geometry):
        for index, ring in enumerate(polygon):
            area, cx, cy = ring_area_and_centroid(ring)
            # O primeiro anel é a borda; os seguintes são furos, e entram subtraindo.
            signed = abs(area) if index == 0 else -abs(area)
            total += signed
            weighted_x += cx * signed
            weighted_y += cy * signed
    if total == 0:
        return None
    return round(weighted_y / total, 7), round(weighted_x / total, 7)


def main():
    rows = []
    for state in STATES:
        url = (
            f'{MESH_URL}/{state}?formato=application%2Fvnd.geo%2Bjson'
            '&intrarregiao=municipio&qualidade=minima'
        )
        # ⚠️ O IBGE devolve gzip mesmo sem `Accept-Encoding`, e o `urllib` não descomprime sozinho:
        # sem isto o corpo chega como bytes e o JSON falha com "0x8b na posição 1".
        request = urllib.request.Request(url, headers={'Accept-Encoding': 'gzip'})
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read()
        if payload[:2] == b'\x1f\x8b':
            payload = gzip.decompress(payload)
        collection = json.loads(payload)

        for feature in collection['features']:
            code = str(feature['properties']['codarea'])
            centroid = centroid_of(feature['geometry'])
            if centroid is None:
                print(f'sem área: {code} ({state})', file=sys.stderr)
                continue
            latitude, longitude = centroid
            rows.append(
                {'cityCode': code, 'latitude': f'{latitude:.7f}',
                 'longitude': f'{longitude:.7f}', 'state': state}
            )
        print(f'{state}: {len(collection["features"])}', file=sys.stderr)
        time.sleep(PAUSE_SECONDS)

    rows.sort(key=lambda row: row['cityCode'])
    json.dump(rows, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
