// RF-15: leitura de boleto pela linha digitável (47 ou 48 dígitos) ou pelo código de barras (44 dígitos).
// Bancário: valor e vencimento (fator). Arrecadação (água, luz…, começa com 8): só valor.

export interface BoletoLido {
  tipo: 'bancario' | 'arrecadacao';
  valor: number | null;
  vencimento: string | null; // AAAA-MM-DD
  codigoBarras: string;
}

export class BoletoError extends Error {}

const mod10 = (num: string) => {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = Number(num[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  const r = soma % 10;
  return r === 0 ? 0 : 10 - r;
};

const mod11Banco = (num: string) => {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    soma += Number(num[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = 11 - (soma % 11);
  return r === 0 || r === 10 || r === 11 ? 1 : r;
};

const mod11Arrec = (num: string) => {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    soma += Number(num[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
};

/** Fator de vencimento. Base 07/10/1997; a contagem reiniciou em 1000 em 22/02/2025. */
export function dataDoFator(fator: number, referencia = new Date()): string | null {
  if (fator === 0) return null;
  const dia = 86400000;
  const antigo = Date.UTC(1997, 9, 7) + fator * dia;
  const novo = Date.UTC(2025, 1, 22) + (fator - 1000) * dia;
  const ref = referencia.getTime();
  const escolhido = Math.abs(novo - ref) < Math.abs(antigo - ref) ? novo : antigo;
  return new Date(escolhido).toISOString().slice(0, 10);
}

export function lerCodigoBoleto(entrada: string, referencia = new Date()): BoletoLido {
  const d = entrada.replace(/\D/g, '');
  if (d.length === 44) return d[0] === '8' ? arrecadacaoDeBarras(d) : bancarioDeBarras(d, referencia);
  if (d.length === 47) {
    const campos = [d.slice(0, 9), d.slice(10, 20), d.slice(21, 31)];
    const dvs = [d[9], d[20], d[31]];
    campos.forEach((c, i) => {
      if (String(mod10(c)) !== dvs[i]) throw new BoletoError(`Linha digitável inválida (dígito do campo ${i + 1}). Confira os números.`);
    });
    const barras = d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    return bancarioDeBarras(barras, referencia);
  }
  if (d.length === 48 && d[0] === '8') {
    const blocos = [0, 1, 2, 3].map((i) => d.slice(i * 12, i * 12 + 11));
    const dvs = [0, 1, 2, 3].map((i) => d[i * 12 + 11]);
    const usa10 = d[2] === '6' || d[2] === '7';
    blocos.forEach((b, i) => {
      const dv = usa10 ? mod10(b) : mod11Arrec(b);
      if (String(dv) !== dvs[i]) throw new BoletoError(`Linha digitável inválida (dígito do bloco ${i + 1}). Confira os números.`);
    });
    return arrecadacaoDeBarras(blocos.join(''));
  }
  throw new BoletoError('Código do boleto deve ter 47 ou 48 dígitos (linha digitável) ou 44 (código de barras).');
}

function bancarioDeBarras(b: string, referencia: Date): BoletoLido {
  const semDv = b.slice(0, 4) + b.slice(5);
  if (String(mod11Banco(semDv)) !== b[4]) throw new BoletoError('Código de barras inválido (dígito verificador geral).');
  const fator = Number(b.slice(5, 9));
  const valor = Number(b.slice(9, 19)) / 100;
  return { tipo: 'bancario', valor: valor || null, vencimento: dataDoFator(fator, referencia), codigoBarras: b };
}

function arrecadacaoDeBarras(b: string): BoletoLido {
  const usaReais = ['6', '8'].includes(b[2]);
  const valor = usaReais ? Number(b.slice(4, 15)) / 100 : null;
  return { tipo: 'arrecadacao', valor: valor || null, vencimento: null, codigoBarras: b };
}
