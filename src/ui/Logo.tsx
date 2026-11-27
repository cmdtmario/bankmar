// Logo do banco, corretora ou programa de pontos ao lado do nome, para identificar de relance.
// A imagem é o ícone do próprio site da instituição, carregado direto de lá (nada passa por serviço de terceiros).
// Se não carregar, aparece uma sigla na cor da instituição.
import { useState } from 'react';

interface Marca { dominio: string; sigla: string; cor: string; texto?: string }
// Ordem importa: bancos antes de programas ("Itaú Azul" é Itaú, "Santander Gol" é Santander).
const MARCAS: [RegExp, Marca][] = [
  [/\bita[uú]|personnalit/, { dominio: 'itau.com.br', sigla: 'It', cor: '#EC7000' }],
  [/\bcaixa\b|\bcef\b/, { dominio: 'caixa.gov.br', sigla: 'Cx', cor: '#005CA9' }],
  [/\bbrb\b/, { dominio: 'brb.com.br', sigla: 'BRB', cor: '#0055A5' }],
  [/\bnu\b|nubank|ultravioleta|nu invest/, { dominio: 'nubank.com.br', sigla: 'Nu', cor: '#820AD1' }],
  [/\binter\b|banco inter/, { dominio: 'inter.co', sigla: 'In', cor: '#FF7A00' }],
  [/\bc6\b/, { dominio: 'c6bank.com.br', sigla: 'C6', cor: '#2B2B2B' }],
  [/santander/, { dominio: 'santander.com.br', sigla: 'S', cor: '#EC0000' }],
  [/\bbb\b|banco do brasil|ourocard/, { dominio: 'bb.com.br', sigla: 'BB', cor: '#FCFC30', texto: '#0038A8' }],
  [/bradesco/, { dominio: 'banco.bradesco', sigla: 'B', cor: '#CC092F' }],
  [/\bxp\b|xp invest/, { dominio: 'xpi.com.br', sigla: 'XP', cor: '#111111' }],
  [/\bbtg\b/, { dominio: 'btgpactual.com', sigla: 'BTG', cor: '#001E62' }],
  [/pic ?pay/, { dominio: 'picpay.com', sigla: 'PP', cor: '#21C25E' }],
  [/\bporto\b/, { dominio: 'portoseguro.com.br', sigla: 'P', cor: '#0046C0' }],
  [/\bmp\b|mercado ?pago/, { dominio: 'mercadopago.com.br', sigla: 'MP', cor: '#00B1EA' }],
  [/genial/, { dominio: 'genialinvestimentos.com.br', sigla: 'G', cor: '#0F2A4A' }],
  [/rico\b/, { dominio: 'rico.com.vc', sigla: 'R', cor: '#FF5A00' }],
  [/brasilprev/, { dominio: 'brasilprev.com.br', sigla: 'BP', cor: '#F5C300', texto: '#1A3C8A' }],
  [/icatu/, { dominio: 'icatuseguros.com.br', sigla: 'Ic', cor: '#003B71' }],
  [/sicoob/, { dominio: 'sicoob.com.br', sigla: 'Sc', cor: '#003641' }],
  [/sicredi/, { dominio: 'sicredi.com.br', sigla: 'Sc', cor: '#3FA110' }],
  [/pag ?bank|pagseguro/, { dominio: 'pagbank.com.br', sigla: 'PB', cor: '#1BB99A' }],
  [/\bneon\b/, { dominio: 'neon.com.br', sigla: 'Ne', cor: '#00E5FF', texto: '#002B49' }],
  [/\bnext\b/, { dominio: 'next.me', sigla: 'Nx', cor: '#00FF5F', texto: '#0B0B0B' }],
  [/\bpan\b|banco pan/, { dominio: 'bancopan.com.br', sigla: 'Pan', cor: '#0E1C3D' }],
  [/original/, { dominio: 'original.com.br', sigla: 'Or', cor: '#00A857' }],
  [/safra/, { dominio: 'safra.com.br', sigla: 'Sf', cor: '#0C2340' }],
  [/\bclear\b/, { dominio: 'clear.com.br', sigla: 'Cl', cor: '#1E2C3A' }],
  [/orama|órama/, { dominio: 'orama.com.br', sigla: 'Ór', cor: '#00B3B3' }],
  [/avenue/, { dominio: 'avenue.us', sigla: 'Av', cor: '#3B2BE0' }],
  [/nomad/, { dominio: 'nomadglobal.com', sigla: 'Nm', cor: '#FFD200', texto: '#111' }],
  [/smiles?\b/, { dominio: 'smiles.com.br', sigla: 'Sm', cor: '#FF7020' }],
  [/latam/, { dominio: 'latamairlines.com', sigla: 'LA', cor: '#1B0088' }],
  [/tudo ?azul|\bazul\b/, { dominio: 'voeazul.com.br', sigla: 'Az', cor: '#1A3C8A' }],
  [/livelo/, { dominio: 'livelo.com.br', sigla: 'Lv', cor: '#E3007E' }],
  [/esfera/, { dominio: 'esfera.com.vc', sigla: 'Es', cor: '#EC0000' }],
  [/\bcopa\b|\btap\b/, { dominio: 'copaair.com', sigla: 'Cp', cor: '#0E3A73' }],
  [/iupp/, { dominio: 'iupp.com.br', sigla: 'Iu', cor: '#5B2D90' }],
  [/\bpda\b|p[aã]o de a[cç]/, { dominio: 'paodeacucar.com', sigla: 'PA', cor: '#00A651' }],
  [/accor/, { dominio: 'all.accor.com', sigla: 'Ac', cor: '#1E1852' }],
  [/\bgol\b/, { dominio: 'voegol.com.br', sigla: 'Gol', cor: '#FF7020' }],
  // contas do dia a dia
  [/neoenergia|\bceb\b/, { dominio: 'neoenergia.com', sigla: 'Ne', cor: '#00A859' }],
  [/caesb/, { dominio: 'caesb.df.gov.br', sigla: 'Ca', cor: '#0072BC' }],
  [/\bclaro\b|\bnet\b/, { dominio: 'claro.com.br', sigla: 'Cl', cor: '#DA291C' }],
  [/\bvivo\b/, { dominio: 'vivo.com.br', sigla: 'Vi', cor: '#660099' }],
  [/\btim\b/, { dominio: 'tim.com.br', sigla: 'TIM', cor: '#004691' }],
  [/\boi\b/, { dominio: 'oi.com.br', sigla: 'Oi', cor: '#F0047F' }],
  [/\bsky\b/, { dominio: 'sky.com.br', sigla: 'Sky', cor: '#E30613' }],
  [/netflix/, { dominio: 'netflix.com', sigla: 'N', cor: '#E50914' }],
  [/spotify/, { dominio: 'spotify.com', sigla: 'Sp', cor: '#1DB954' }],
  [/amazon|prime video/, { dominio: 'amazon.com.br', sigla: 'Am', cor: '#232F3E' }],
  [/youtube|google/, { dominio: 'google.com', sigla: 'G', cor: '#4285F4' }],
  [/apple|icloud/, { dominio: 'apple.com', sigla: 'Ap', cor: '#111111' }],
  [/unimed/, { dominio: 'unimed.coop.br', sigla: 'Un', cor: '#00995D' }],
  [/\bamil\b/, { dominio: 'amil.com.br', sigla: 'Am', cor: '#0060AE' }],
  [/sulamerica|sul america/, { dominio: 'sulamericaseguros.com.br', sigla: 'SA', cor: '#F47920' }],
  [/\buber\b/, { dominio: 'uber.com', sigla: 'U', cor: '#111111' }],
  [/ifood/, { dominio: 'ifood.com.br', sigla: 'iF', cor: '#EA1D2C' }],
  [/mercado ?livre/, { dominio: 'mercadolivre.com.br', sigla: 'ML', cor: '#FFE600', texto: '#2D3277' }],
  [/shopee/, { dominio: 'shopee.com.br', sigla: 'Sh', cor: '#EE4D2D' }],
  [/sem parar/, { dominio: 'semparar.com.br', sigla: 'SP', cor: '#E2001A' }],
];

export function marcaDe(nome: string | null | undefined): Marca | null {
  const t = (nome ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return null;
  for (const [re, m] of MARCAS) if (re.test(t)) return m;
  return null;
}

/** Logo pequeno. Sem instituição reconhecida, não mostra nada (ou a inicial, se `sempre`). */
export function Logo({ nome, tamanho = 20, sempre = false }: { nome: string | null | undefined; tamanho?: number; sempre?: boolean }) {
  const m = marcaDe(nome);
  const [fonte, setFonte] = useState(0); // 0 = ícone grande do site, 1 = favicon, 2 = sigla
  if (!m && !sempre) return null;
  const estilo = { width: tamanho, height: tamanho };
  if (!m || fonte >= 2) {
    return (
      <span className="logo sigla" style={{ ...estilo, background: m?.cor ?? corDe(nome), color: m?.texto ?? '#fff', fontSize: tamanho * ((m?.sigla ?? iniciais(nome)).length > 2 ? 0.36 : 0.45) }} aria-hidden="true">
        {m?.sigla ?? iniciais(nome)}
      </span>
    );
  }
  const src = fonte === 0 ? `https://${m.dominio}/apple-touch-icon.png` : `https://${m.dominio}/favicon.ico`;
  return (
    <span className="logo" style={estilo} aria-hidden="true">
      <img src={src} alt="" width={tamanho} height={tamanho} loading="lazy" referrerPolicy="no-referrer" onError={() => setFonte(fonte + 1)} />
    </span>
  );
}

/** Iniciais de um nome sem logo conhecido: "Condomínio SQN" -> "CS". */
function iniciais(nome: string | null | undefined) {
  const p = (nome ?? '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 || /\d/.test(w));
  return ((p[0]?.[0] ?? '?') + (p[1]?.[0] ?? '')).toUpperCase();
}
const PALETA = ['#7A5C3A', '#3F5A73', '#5B4A7A', '#3E6B5A', '#7A4A4A', '#5A6B3A', '#4A5A7A', '#6B5A3A'];
/** Cor estável por nome, para a sigla parecer um selo próprio. */
function corDe(nome: string | null | undefined) {
  let h = 0; for (const ch of nome ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
