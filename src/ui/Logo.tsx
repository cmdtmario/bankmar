// Logo do banco, corretora ou programa de pontos ao lado do nome, para identificar de relance.
// A imagem é o ícone do próprio site da instituição, carregado direto de lá (nada passa por serviço de terceiros).
// Se não carregar, aparece uma sigla na cor da instituição.
import { useState } from 'react';

interface Marca { dominio: string; sigla: string; cor: string; texto?: string }
// Ordem importa: bancos antes de programas ("Itaú Azul" é Itaú, "Santander Gol" é Santander).
const MARCAS: [RegExp, Marca][] = [
  [/\bita[uú]|personnalit/, { dominio: 'itau.com.br', sigla: 'It', cor: '#EC7000' }],
  [/\bcaixa\b/, { dominio: 'caixa.gov.br', sigla: 'Cx', cor: '#005CA9' }],
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
  [/mercado ?pago/, { dominio: 'mercadopago.com.br', sigla: 'MP', cor: '#00B1EA' }],
  [/genial/, { dominio: 'genialinvestimentos.com.br', sigla: 'G', cor: '#0F2A4A' }],
  [/rico\b/, { dominio: 'rico.com.vc', sigla: 'R', cor: '#FF5A00' }],
  [/brasilprev/, { dominio: 'brasilprev.com.br', sigla: 'BP', cor: '#F5C300', texto: '#1A3C8A' }],
  [/icatu/, { dominio: 'icatuseguros.com.br', sigla: 'Ic', cor: '#003B71' }],
  [/sicoob/, { dominio: 'sicoob.com.br', sigla: 'Sc', cor: '#003641' }],
  [/sicredi/, { dominio: 'sicredi.com.br', sigla: 'Sc', cor: '#3FA110' }],
  [/smiles?\b/, { dominio: 'smiles.com.br', sigla: 'Sm', cor: '#FF7020' }],
  [/latam/, { dominio: 'latamairlines.com', sigla: 'LA', cor: '#1B0088' }],
  [/tudo ?azul|\bazul\b/, { dominio: 'voeazul.com.br', sigla: 'Az', cor: '#1A3C8A' }],
  [/livelo/, { dominio: 'livelo.com.br', sigla: 'Lv', cor: '#E3007E' }],
  [/esfera/, { dominio: 'esfera.com.vc', sigla: 'Es', cor: '#EC0000' }],
  [/\bcopa\b|\btap\b/, { dominio: 'copaair.com', sigla: 'Cp', cor: '#0E3A73' }],
  [/iupp/, { dominio: 'iupp.com.br', sigla: 'Iu', cor: '#5B2D90' }],
  [/\bpda\b|p[aã]o de a[cç]/, { dominio: 'paodeacucar.com', sigla: 'PA', cor: '#00A651' }],
  [/accor/, { dominio: 'all.accor.com', sigla: 'Ac', cor: '#1E1852' }],
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
      <span className="logo sigla" style={{ ...estilo, background: m?.cor ?? '#2a2723', color: m?.texto ?? '#fff', fontSize: tamanho * (m && m.sigla.length > 2 ? 0.36 : 0.45) }} aria-hidden="true">
        {m?.sigla ?? (nome ?? '?').trim().slice(0, 1).toUpperCase()}
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
