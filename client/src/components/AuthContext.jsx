import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const verificarSessao = useCallback(() => {
    return api.auth.me()
      .then(setUsuario)
      .catch(() => setUsuario(null));
  }, []);

  useEffect(() => {
    verificarSessao().finally(() => setCarregando(false));
  }, [verificarSessao]);

  useEffect(() => {
    function aoExpirar() {
      setUsuario(null);
    }
    window.addEventListener('auth:unauthorized', aoExpirar);
    return () => window.removeEventListener('auth:unauthorized', aoExpirar);
  }, []);

  async function login(usuarioDigitado, senha) {
    const dados = await api.auth.login(usuarioDigitado, senha);
    setUsuario(dados);
  }

  async function logout() {
    await api.auth.logout().catch(() => {});
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
