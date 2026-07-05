// Codice PRD deterministico per prodotto: usato sia per anonimizzare l'invio a Sito B
// (titolo + slug) sia per mostrarlo nella colonna "Codice" su Sito A. Stesso input → stesso output,
// così Sito A e Sito B mostrano lo stesso identificativo.
export function prdCodeFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  const n = (Math.abs(h) % 90000) + 10000; // 10000..99999
  return `PRD-${n}`;
}
