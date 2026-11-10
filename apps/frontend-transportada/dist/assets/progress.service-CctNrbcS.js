function e(r){if(r.total<=0)return 0;const t=r.completed/r.total;return t<=0?0:t>=1?100:Math.round(t*100)}export{e as r};
