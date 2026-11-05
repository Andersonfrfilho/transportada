# Copyright (c) 2026 Ada Technology. MIT License.
# Protótipo do spike T4.8b (spec 294): sonda linear sobre a MobileNetV3, validação cruzada repetida. Descartável.
import json, sys, numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RepeatedStratifiedKFold
D = sys.argv[1]
feats = json.load(open(D + '/meta/features.json'))
meta = json.load(open(D + '/meta/prod.json'))
ids, y, groups = [], [], []
for k in sorted(feats):
    if k[0] == 'p':
        if meta[str(int(k[1:]))]['review'] != 'approved': continue
        y.append(1)
    else: y.append(0)
    ids.append(k); groups.append(k[0])
y = np.array(y); groups = np.array(groups)
def norm(v):
    v = np.array(v, dtype=np.float32); return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-8)
views = {k: norm(feats[k]['views']) for k in ids}
rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=0)
probs = {k: [] for k in ids}
for tr, te in rskf.split(ids, y):
    X = np.concatenate([views[ids[i]] for i in tr]); Y = np.concatenate([[y[i]] * 8 for i in tr])
    clf = LogisticRegression(C=float(sys.argv[2]) if len(sys.argv) > 2 else 1.0, class_weight='balanced', max_iter=2000).fit(X, Y)
    for i in te:
        probs[ids[i]].append(clf.predict_proba(views[ids[i]][:4])[:, 1].mean())
p = np.array([np.mean(probs[k]) for k in ids])
out = {'n_pos': int(y.sum()), 'n_neg_staging': int((groups == 's').sum()), 'n_neg_synth': int((groups == 'n').sum())}
for t in (0.5, 0.7, 0.9):
    pred = p >= t
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum())
    out[f't{t}'] = {'tp': tp, 'fp': fp, 'fp_staging': int((pred & (groups == 's')).sum()), 'fp_synth': int((pred & (groups == 'n')).sum()),
                    'precision': round(tp / max(1, tp + fp), 3), 'recall': round(tp / int(y.sum()), 3)}
# fração de positivos com prob < 0.5 → incerto
out['pos_p_quantiles'] = [round(float(q), 3) for q in np.quantile(p[y == 1], [0.05, 0.25, 0.5])]
out['neg_p_quantiles'] = [round(float(q), 3) for q in np.quantile(p[y == 0], [0.5, 0.75, 0.95, 1.0])]
print(json.dumps(out))
json.dump({k: float(v) for k, v in zip(ids, p)}, open(D + '/meta/b-probs.json', 'w'))
