// Tema "Ouro Noturno" (skill theme-factory): a fonte única das cores usadas fora do CSS (gráficos, SVG).
// Os mesmos valores existem como variáveis CSS em index.css — mude nos dois lugares juntos.
export const TEMA = {
  nome: 'Ouro Noturno',
  fundo: '#080808',
  cartao: '#121212',
  trilho: '#211d16', // trilhos e fundos de barras
  marca: '#4a3f2c', // marcações discretas, "parte dos outros"
  texto: '#ece4d2',
  textoSuave: '#a39a88',
  ouroClaro: '#f3d891',
  ouro: '#d4ab5c',
  ouroEscuro: '#9c7330',
  renda: '#8fa3b8', // linha de renda: tom frio para contrastar com o ouro
  ok: '#6fcf97',
  alerta: '#f2b84b',
  erro: '#ef7d6d',
  /** Série categórica dos gráficos (do mais claro ao mais escuro, mais diferenças de luz que de tom). */
  serie: ['#f3d891', '#d4ab5c', '#a9792f', '#cbbfa6', '#7d6a4a', '#5c5345'],
  fontes: { titulos: 'Cinzel', texto: 'Inter' },
} as const;
