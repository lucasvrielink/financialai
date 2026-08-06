const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/wrong-password':         'Senha incorreta. Tente novamente.',
  'auth/user-not-found':         'Nenhuma conta encontrada com este e-mail.',
  'auth/invalid-email':          'E-mail inválido.',
  'auth/invalid-credential':     'Credenciais inválidas. Verifique e-mail e senha.',
  'auth/too-many-requests':      'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  'auth/network-request-failed': 'Erro de conexão. Verifique sua internet e tente novamente.',
};

export function mapAuthError(code: string): string {
  return AUTH_ERROR_MESSAGES[code] ?? 'Erro ao entrar. Tente novamente.';
}
