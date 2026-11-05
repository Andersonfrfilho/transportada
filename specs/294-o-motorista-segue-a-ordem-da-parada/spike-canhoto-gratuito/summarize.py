# Copyright (c) 2026 Ada Technology. MIT License.
# Métricas a partir do JSONL de eval-ocr.ts / eval-florence.ts.
import json, sys, statistics as st
rows = [json.loads(l) for l in open(sys.argv[1])]
pos = [r for r in rows if r['label'] == 1]; neg = [r for r in rows if r['label'] == 0]
def q(v, p): v = sorted(v); return v[min(len(v) - 1, int(p * len(v)))]
out = {'n_pos': len(pos), 'n_neg': len(neg), 'n_neg_stg': sum(r['id'][0] == 's' for r in neg), 'n_neg_syn': sum(r['id'][0] == 'n' for r in neg)}
for k in (1, 2, 3):
    tp = sum(r['markers'] >= k for r in pos); fp = sum(r['markers'] >= k for r in neg)
    out[f'markers>={k}'] = {'tp': tp, 'fp': fp, 'fp_ids_group': [r['id'][0] for r in neg if r['markers'] >= k]}
out['pos_markers_hist'] = {m: sum(r['markers'] == m for r in pos) for m in range(6)}
out['extracted_ok'] = sum(r['extractedOk'] for r in pos); out['extracted_any'] = sum(r['extractedAny'] for r in pos)
out['truth_seen_in_digits'] = sum(r['truthSeen'] for r in pos)
for s in ('trip', 'stop'):
    out[s] = {k: sum(r[s + 'Kind'] == k for r in pos) for k in ('exact', 'fuzzy', 'ambiguous', 'none')}
    out[s]['correct'] = sum(r[s + 'Ok'] for r in pos)
    out[s]['wrong'] = sum(r[s + 'Kind'] in ('exact', 'fuzzy') and not r[s + 'Ok'] for r in pos)
    out[s]['neg_false_match'] = sum(r[s + 'Kind'] in ('exact', 'fuzzy') for r in neg)
# regra combinada: canhoto se markers>=2 OU (casou nota da viagem)
comb_tp = sum(r['markers'] >= 2 or r['tripKind'] in ('exact', 'fuzzy') for r in pos)
comb_fp = sum(r['markers'] >= 2 or r['tripKind'] in ('exact', 'fuzzy') for r in neg)
out['combined_markers2_or_tripmatch'] = {'tp': comb_tp, 'fp': comb_fp}
ms = [r['ms'] for r in rows]
out['ms_p50'] = q(ms, .5); out['ms_p95'] = q(ms, .95); out['ms_max'] = max(ms)
print(json.dumps(out, indent=0))
