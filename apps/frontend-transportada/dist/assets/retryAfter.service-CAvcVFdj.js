function n(e){return Math.max(1,Math.ceil(e/60))}function a(e){const t=e.get("retry-after");if(t===null)return;const r=Number(t);return Number.isFinite(r)&&r>=0?r:void 0}export{n as a,a as r};
