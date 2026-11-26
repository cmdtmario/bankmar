// Movimento: um momento orquestrado (o mostrador do painel) e respostas às ações do usuário.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { brl } from '../lib/formato';

/** Valor em R$ que "conta" até o número final (respeita reduzir movimento). */
export function Contador({ valor, duracao = 0.9, formatar = brl }: { valor: number; duracao?: number; formatar?: (v: number) => string }) {
  const reduzir = useReducedMotion();
  const [v, setV] = useState(reduzir ? valor : 0);
  const anterior = useRef(reduzir ? valor : 0);
  useEffect(() => {
    if (reduzir) { setV(valor); return; }
    const c = animate(anterior.current, valor, { duration: duracao, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    anterior.current = valor;
    return () => c.stop();
  }, [valor, duracao, reduzir]);
  return <span className="num-tab">{formatar(v)}</span>;
}

/** Mostrador estilo relógio: quanto da renda já está comprometido. */
export function Mostrador({ pct, children }: { pct: number | null; children: ReactNode }) {
  const reduzir = useReducedMotion();
  const raio = 92;
  const arco = 0.75; // 270°
  const circ = 2 * Math.PI * raio;
  const p = pct == null ? 0 : Math.max(0, Math.min(1, pct));
  const excedeu = pct != null && pct > 1;
  const marcas = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div className="mostrador" role="img" aria-label={pct == null ? 'Renda do mês não informada' : `${Math.round(pct * 100)}% da renda comprometida`}>
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <defs>
          <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f3d891" />
            <stop offset="55%" stopColor="#d4ab5c" />
            <stop offset="100%" stopColor="#9c7330" />
          </linearGradient>
        </defs>
        <g transform="rotate(135 110 110)">
          {marcas.map((i) => {
            const a = (i / (marcas.length - 1)) * arco * 2 * Math.PI;
            const r1 = 104, r2 = i % 3 === 0 ? 98 : 101;
            return <line key={i} x1={110 + r1 * Math.cos(a)} y1={110 + r1 * Math.sin(a)} x2={110 + r2 * Math.cos(a)} y2={110 + r2 * Math.sin(a)} stroke="#4a3f2c" strokeWidth={i % 3 === 0 ? 1.4 : 0.8} />;
          })}
          <circle cx="110" cy="110" r={raio} fill="none" stroke="#211d16" strokeWidth="10" strokeDasharray={`${circ * arco} ${circ}`} strokeLinecap="round" />
          <motion.circle
            cx="110" cy="110" r={raio} fill="none" stroke={excedeu ? 'var(--erro)' : 'url(#ouro)'} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${circ * arco} ${circ}`}
            initial={{ strokeDashoffset: reduzir ? circ * arco * (1 - p) : circ * arco }}
            animate={{ strokeDashoffset: circ * arco * (1 - p) }}
            transition={{ duration: reduzir ? 0 : 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          />
        </g>
      </svg>
      <div className="mostrador-centro">{children}</div>
    </div>
  );
}

/** Lista cujos itens entram em sequência curta (usada só uma vez por tela). */
export function Sequencia({ children, className }: { children: ReactNode[]; className?: string }) {
  const reduzir = useReducedMotion();
  return (
    <motion.div className={className} initial="o" animate="v" variants={{ v: { transition: { staggerChildren: reduzir ? 0 : 0.05, delayChildren: 0.35 } } }}>
      {children.map((c, i) => (
        <motion.div key={i} variants={{ o: { opacity: 0, y: reduzir ? 0 : 6 }, v: { opacity: 1, y: 0, transition: { duration: 0.28 } } }}>{c}</motion.div>
      ))}
    </motion.div>
  );
}

/** Bloco de carregamento com o formato do conteúdo. */
export const Esqueleto = ({ altura = 72, largura = '100%' }: { altura?: number; largura?: string | number }) => (
  <div className="esqueleto" style={{ height: altura, width: largura }} aria-hidden="true" />
);
