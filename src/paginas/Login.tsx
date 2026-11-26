// RF-01 / RF-02: e-mail + senha e verificação em duas etapas (TOTP) obrigatória.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Erro, useAcao } from '../ui/comum';

type Etapa = 'senha' | 'cadastrar2fa' | 'codigo';

export function Login({ onPronto }: { onPronto: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>('senha');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [fatorId, setFatorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<string | null>(null);
  const { erro, ocupado, rodar } = useAcao();

  const decidirSegundaEtapa = async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') return onPronto();
    const { data: fatores } = await supabase.auth.mfa.listFactors();
    const totp = fatores?.totp?.find((f) => f.status === 'verified');
    if (totp) { setFatorId(totp.id); setEtapa('codigo'); return; }
    // primeiro acesso: cadastra o app autenticador
    for (const f of fatores?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'BanKMar' });
    if (error) throw error;
    setFatorId(data.id); setQr(data.totp.qr_code); setSegredo(data.totp.secret); setEtapa('cadastrar2fa');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) rodar(decidirSegundaEtapa); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entrar = () => rodar(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error('E-mail ou senha inválidos.');
    await decidirSegundaEtapa();
  });

  const verificar = () => rodar(async () => {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId!, code: codigo.trim() });
    if (error) throw new Error('Código inválido. Confira o horário do celular e tente de novo.');
    onPronto();
  });

  return (
    <main style={{ maxWidth: 420 }}>
      <img className="login-logo" src={`${import.meta.env.BASE_URL}logo.jpg`} alt="BankMaR — Private Banking, Gestão Patrimonial" />
      <div className="card">
        {etapa === 'senha' && (
          <form onSubmit={(e) => { e.preventDefault(); entrar(); }} className="campos" style={{ gridTemplateColumns: '1fr' }}>
            <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Senha<input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
            <button className="pri" disabled={ocupado}>Entrar</button>
          </form>
        )}
        {etapa === 'cadastrar2fa' && (
          <div>
            <p>Primeiro acesso: leia o QR code no seu app autenticador (Google ou Microsoft Authenticator) e digite o código de 6 dígitos.</p>
            {qr && <img src={qr} alt="QR code do autenticador" style={{ width: 200, height: 200 }} />}
            {segredo && <p className="sub">Ou digite a chave: <code>{segredo}</code></p>}
          </div>
        )}
        {(etapa === 'cadastrar2fa' || etapa === 'codigo') && (
          <form onSubmit={(e) => { e.preventDefault(); verificar(); }} className="linha">
            <input inputMode="numeric" autoComplete="one-time-code" placeholder="Código de 6 dígitos" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={6} required />
            <button className="pri" disabled={ocupado}>Verificar</button>
          </form>
        )}
        <Erro msg={erro} />
      </div>
    </main>
  );
}
