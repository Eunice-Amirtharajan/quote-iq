# QuoteIQ

A B2B quotation management platform with AI-powered insights for sales teams.

Built in my free time to explore NestJS, GraphQL, and Gemini AI integration.

---

## Stack

**Backend:** NestJS · GraphQL (Apollo) · Prisma · PostgreSQL · Gemini AI  
**Frontend:** React · TypeScript · Tailwind CSS · Apollo Client  
**Auth:** JWT in HttpOnly cookies · Role-based access control  
**Infra:** Railway (backend) · Vercel (frontend) · Neon DB  

---

## Features

- Sales reps create and manage clients and quotations with line items and tax calculation
- Managers view team-wide pipeline with stats and filters
- AI-generated quotation summaries and recommendations per deal
- Conversion likelihood scoring on open quotations
- Win/loss pattern analysis across the team
- Natural language querying of the pipeline

---

## Getting Started

```bash
# Backend
cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npx prisma db seed
npm run start:dev

# Frontend
cd frontend
npm install
npm run dev
```

---

## Environment Variables

```bash
# backend/.env
DATABASE_URL=""
JWT_SECRET=""
JWT_EXPIRES_IN="7d"
GEMINI_API_KEY=""
PORT=4000
NODE_ENV="development"
```

---

## Project Structure

```
quote-iq/
├── .github/
│   └── workflows/
├── backend/
│   ├── prisma/
│   │   └── migrations/
│   ├── src/
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   ├── guards/
│   │   │   ├── logger/
│   │   │   └── middleware/
│   │   ├── modules/
│   │   │   ├── ai/
│   │   │   ├── auth/
│   │   │   ├── clients/
│   │   │   ├── dashboard/
│   │   │   ├── quotations/
│   │   │   └── users/
│   │   └── prisma/
│   └── test/
├── frontend/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── graphql/
│       ├── hooks/
│       ├── lib/
│       ├── pages/
│       └── test/
├── docs/
├── .gitignore
└── README.md
```

---

## Roles

| Role | Access |
|---|---|
| SALES_REP | Own clients and quotations |
| SALES_MANAGER | Full team visibility + AI features |
| ADMIN | Full access + user management |

---

## Seed Data

```bash
npx prisma db seed
```

Creates three users with sample quotations across multiple clients and statuses.

# Better — honest but not a security concern
Demo credentials are configured via SEED_PASSWORD in .env.
Default seed creates three users — manager, and two sales reps.
Run `npx prisma db seed` after setting up your environment.

## Diagrams

- [Architecture](docs/architecture.md)
- [Login Flow](docs/flow-login.md)
- [Protected Query Flow](docs/flow-protected-query.md)
- [Data Model](docs/data-model.md)