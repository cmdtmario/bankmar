// Lógica pura da checagem mensal de benefícios (testada em src/lib/cartoes.test.ts).

/** HTML -> texto limpo, uma frase por linha (sem scripts, menus repetidos nem espaços). */
export function textoDaPagina(html: string): string {
  const semCodigo = html.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ');
  const texto = semCodigo.replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr|section)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const linhas = texto.split(/\n|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length >= 3);
  return [...new Set(linhas)].join('\n');
}

export function diffTexto(antigo: string, novo: string): { removidas: string[]; adicionadas: string[] } {
  const a = new Set(antigo.split('\n')); const b = new Set(novo.split('\n'));
  return { removidas: [...a].filter((l) => !b.has(l)), adicionadas: [...b].filter((l) => !a.has(l)) };
}

