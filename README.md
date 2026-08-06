# Vrielink AI — Assistente de Finanças Pessoais

Aplicativo de finanças pessoais que recebe mensagens em português pelo **Telegram**, interpreta com **Gemini AI**, salva transações no **Firebase Firestore** e exibe um dashboard web completo.

---

## Como funciona

1. Você envia uma mensagem para o bot no Telegram — ex: `"45 academia"` ou `"salario 5000"`
2. O Gemini interpreta a mensagem e extrai valor, tipo e categoria
3. A transação é salva no Firestore
4. O dashboard atualiza automaticamente (a cada 30 segundos) com KPIs, gráficos e lista de transações

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI (Python) |
| Frontend | Next.js 16 (TypeScript, static export) |
| Banco de dados | Firebase Firestore |
| Autenticação | Firebase Auth (e-mail e senha) |
| NLP | Gemini API (Google AI Studio) |
| Mensageria | Telegram Bot (python-telegram-bot) |
| Deploy | Docker (backend), Static Site (frontend) |

---

## Estrutura do projeto

```
├── backend/               # API FastAPI
│   ├── main.py
│   ├── routers/
│   ├── services/          # Gemini, Firestore, Telegram
│   ├── models/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/              # Dashboard Next.js
│   ├── src/
│   │   ├── app/           # Páginas (login, transactions)
│   │   ├── components/    # KpiCard, FilterBar, Charts...
│   │   ├── contexts/      # AuthContext
│   │   └── lib/firebase/  # Client SDK
│   └── package.json
└── docker-compose.yml     # Ambiente local
```

---

## Rodando localmente

### Pré-requisitos
- Docker e Docker Compose
- Conta Firebase com Firestore e Auth habilitados
- Chave da API Gemini (Google AI Studio)
- Bot no Telegram (via @BotFather)

### 1. Variáveis de ambiente

Crie `backend/.env`:
```env
GEMINI_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_URL=
TELEGRAM_OWNER_ID=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Crie `frontend/.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
```

### 2. Subir os serviços

```bash
docker compose up
```

- Backend: http://localhost:8000
- Frontend: http://localhost:3000

---

## Exemplos de mensagens para o bot

| Mensagem | Resultado |
|----------|-----------|
| `45 academia` | Despesa R$ 45,00 — saúde |
| `salario 5000` | Receita R$ 5.000,00 — renda |
| `paguei janta 60` | Despesa R$ 60,00 — alimentação |
| `3x 150 sapato` | Despesa parcelada R$ 150,00 × 3 — vestuário |

---

## Firestore — configuração necessária

**Índice composto** na coleção `transactions`:
- `user_id` — Ascending
- `created_at` — Descending

**Coleção `users`** — mapeamento Telegram → Firebase:
```json
{
  "telegram_user_id": "SEU_ID_TELEGRAM",
  "firebase_uid": "SEU_UID_FIREBASE"
}
```

**Security Rules:**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /transactions/{txId} {
      allow read: if request.auth != null
                  && resource.data.user_id == request.auth.uid;
      allow write: if false;
    }
  }
}
```

---

> Este projeto foi desenvolvido com o auxílio do [Claude](https://claude.ai) (Anthropic) — utilizado para arquitetura, geração de código, especificações e revisão.
