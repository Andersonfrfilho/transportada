function n(t){return t.replace(/\D/g,"")}function o(t){const e=n(t);return e.length>8?e:e.replace(/^(\d{5})(\d)/,"$1-$2")}function r(t){return n(t).length===8}export{o as f,r as i,n as s};
