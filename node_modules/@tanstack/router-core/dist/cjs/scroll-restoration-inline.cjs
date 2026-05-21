//#region src/scroll-restoration-inline.ts?script-string
var scroll_restoration_inline_default = "function(i){let l;try{l=JSON.parse(sessionStorage.getItem(i.storageKey)||\"{}\")}catch(e){console.error(e);return}const c=i.key||window.history.state?.__TSR_key,o=c?l[c]:void 0;let f=!1;if(o&&typeof o==\"object\")for(const e in o){const t=o[e];if(!t||typeof t!=\"object\")continue;const r=t.scrollX,s=t.scrollY;if(!(!Number.isFinite(r)||!Number.isFinite(s))){if(e===\"window\")window.scrollTo({top:s,left:r}),f=!0;else if(e){let n;try{n=document.querySelector(e)}catch{continue}n&&(n.scrollLeft=r,n.scrollTop=s)}}}if(f)return;const w=window.location.hash.split(\"#\",2)[1];if(w){const e=window.history.state?.__hashScrollIntoViewOptions??!0;if(e){const t=document.getElementById(w);t&&t.scrollIntoView(e)}return}window.scrollTo({top:0,left:0})}";
//#endregion
exports.default = scroll_restoration_inline_default;

//# sourceMappingURL=scroll-restoration-inline.cjs.map