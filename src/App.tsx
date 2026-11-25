import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { supabase, configurado } from './lib/supabase';
import { semearSeVazio } from './lib/dados';
import { Login } from './paginas/Login';
import { Mes } from './paginas/Mes';
import { Contas } from './paginas/Contas';
import { Faturas } from './paginas/Faturas';
import { Pessoas, PessoaDetalhe } from './paginas/Pessoas';
import { Categorias } from './paginas/Categorias';
import { Mais } from './paginas/Mais';
import { Compartilhado } from './paginas/Compartilhado';
import { CadastrosProvider, Carregando } from './ui/comum';

// RF-03: só leva ao cofre; o sistema não lê nem guarda nada dele.
export const URL_COFRE = 'https://vault.bitwarden.com/';

function Area() {
  const [estado, setEstado] = useState<'verificando' | 'fora' | 'dentro'>('verificando');
  const loc = useLocation();
  useEffect(() => {
    const checar = async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setEstado(data?.currentLevel === 'aal2' ? 'dentro' : 'fora');
    };
    checar();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { checar(); });
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (estado === 'dentro') semearSeVazio().catch(() => {}); }, [estado]);
  if (estado === 'verificando') return <main><Carregando /></main>;
  // caso 13: qualquer rota sem login (e sem 2 etapas) vai para o login; nenhum dado é buscado antes
  if (estado === 'fora') return loc.pathname === '/' ? <Login onPronto={() => setEstado('dentro')} /> : <Navigate to="/" replace />;
  return (
    <CadastrosProvider>
      <header className="topo">
        <div className="marca"><img src="/monograma.png" alt="" /><span>BankMaR</span></div>
        <div className="linha">
          <a href={URL_COFRE} target="_blank" rel="noopener noreferrer"><button>🔐 Abrir cofre</button></a>
          <button onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Mes />} />
        <Route path="/contas" element={<Contas />} />
        <Route path="/faturas" element={<Faturas />} />
        <Route path="/pessoas" element={<Pessoas />} />
        <Route path="/pessoas/:id" element={<PessoaDetalhe />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/mais" element={<Mais />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <nav className="abas">
        <NavLink to="/" end>Mês</NavLink>
        <NavLink to="/faturas">Faturas</NavLink>
        <NavLink to="/contas">Contas</NavLink>
        <NavLink to="/pessoas">Pessoas</NavLink>
        <NavLink to="/categorias">Gastos</NavLink>
        <NavLink to="/mais">Mais</NavLink>
      </nav>
    </CadastrosProvider>
  );
}

export default function App() {
  if (!configurado) return <main><div className="erro">Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente.</div></main>;
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/c/:token" element={<Compartilhado />} />
        <Route path="*" element={<Area />} />
      </Routes>
    </BrowserRouter>
  );
}
