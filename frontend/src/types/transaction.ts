export interface Transaction {
  id: string;
  user_id: string;
  type: 'despesa' | 'receita';
  amount: number;
  category: string;
  description: string;
  installments: number;
  raw_message: string;
  created_at: Date;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: import('firebase/auth').User }
  | { status: 'unauthenticated' };
