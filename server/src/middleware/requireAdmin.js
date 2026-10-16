// Must run after requireAuth, which populates req.usuario.
export function requireAdmin(req, res, next) {
  if (req.usuario?.papel !== 'admin') {
    return res.status(403).json({ erro: 'Apenas administradores podem acessar isto' });
  }
  next();
}
