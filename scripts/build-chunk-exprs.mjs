import { readFileSync, writeFileSync } from 'node:fs';

const chunks = JSON.parse(readFileSync('scripts/.sql-chunks.json', 'utf8'));
chunks.forEach((c, i) => {
  const expr = `(()=>{window.__NEXLE_SQL__=(window.__NEXLE_SQL__||'')+${JSON.stringify(c)};return window.__NEXLE_SQL__.length;})()`;
  writeFileSync(`scripts/.chunk-${i}.json`, JSON.stringify({ expression: expr, returnByValue: true }));
});
const finalize = `(()=>{const sql=window.__NEXLE_SQL__||'';const m=monaco.editor.getModels()[0];m.setValue(sql);return {len:m.getValue().length, starts:m.getValue().slice(0,40)};})()`;
writeFileSync('scripts/.chunk-final.json', JSON.stringify({ expression: finalize, returnByValue: true }));
console.log('wrote', chunks.length, 'chunks + final');
