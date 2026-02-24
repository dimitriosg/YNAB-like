# Web App Planning Template: YNAB-Style Budget Tracker

## 1. Requirements Clarification

**Core Question:** What problem are we solving?
Help users practice zero-based budgeting: assign every dollar a job, track spending in real-time, and adjust categories as life happens.[^1]

### Key Questions to Answer

- **Target Users:** Personal finance beginners, or power users who want envelope budgeting?
- **Core Budget Philosophy:** Zero-based budgeting (YNAB method) or flexible tracking?
- **Bank Integration:** Manual entry only, or automatic transaction import?
- **Multi-user:** Single-user budgets, or shared household budgets?
- **Platforms:** Web-first, mobile-first, or both simultaneously?

---

## 2. Scope Definition

### MVP (Phase 1) – Core Budgeting

**Must-Have Features:**

- User authentication (email/password, OAuth)
- Create/edit/delete budget categories[^1]
- Assign available money to categories (zero-based allocation)
- Add transactions manually (date, payee, amount, category)
- Real-time category balance updates[^1]
- View available-to-budget amount (money not yet assigned)
- Basic dashboard: current month overview
- Account management (checking, savings, credit cards)[^2]

**Core Rule Enforcement:**

- Can't spend unassigned money
- Overspending must be covered from another category[^1]

### Phase 2 – Enhanced Features

- Bank sync (via Plaid or similar) with manual transaction matching[^1]
- Goal tracking (save $X by date, monthly funding goals)
- Multi-month view and carryover balances[^2]
- Reports (spending trends, category history)
- Mobile app (React Native or Flutter)[^3][^1]

### Phase 3 – Advanced

- Shared budgets (multi-user households)
- Recurring transactions/templates
- Budget templates by category type
- Export data (CSV/PDF)

---

## 3. Recommended Tech Stack

| Layer | Technology | Justification |
| :-- | :-- | :-- |
| **Frontend** | Next.js 15 + React + TypeScript | Server-side rendering, type safety, fast iteration [^3][^4] |
| **Styling** | Tailwind CSS | Utility-first, rapid UI development [^3] |
| **State Management** | TanStack Query (React Query) | Server state syncing, caching, real-time updates [^3] |
| **Backend** | Node.js + Nest.js (or Express) | JavaScript full-stack, API-first architecture [^1] |
| **Database** | PostgreSQL | ACID compliance for financial data, handles complex queries [^5][^4] |
| **Auth** | NextAuth.js or Clerk | OAuth + JWT support [^4] |
| **Hosting** | Vercel (frontend) + AWS RDS (database) | Automatic deployments, scalable database [^4] |
| **Bank Sync (optional)** | Plaid API | Industry standard for secure bank connections [^1] |

**Alternative Stack:**
Spring Boot + Java + PostgreSQL (backend) if you prefer a strongly-typed backend[^4][^3]

---

## 4. Architecture Overview

### High-Level Structure

```text
┌─────────────────┐
│  Next.js App    │  ← Web UI (Vercel)
│  (SSR + Client) │
└────────┬────────┘
         │ REST API
┌────────▼────────┐
│   Node.js API   │  ← Business Logic (AWS EC2/Lambda)
│  (Nest.js)      │
└────────┬────────┘
         │
┌────────▼────────┐
│  PostgreSQL     │  ← Persistent Data (AWS RDS)
└─────────────────┘
```

### Key Components

- **Budget Engine:** Core service enforcing zero-based rules (can't assign unallocated money, must cover overspending)
- **Transaction Service:** CRUD operations, category assignment, balance recalculation
- **Sync Service:** (Phase 2) Fetch bank transactions, match with manual entries[^1]
- **Real-time Updates:** WebSocket or polling for multi-device sync

### API Design

RESTful endpoints:

- `POST /api/auth/login`
- `GET/POST /api/accounts`
- `GET/POST/PATCH /api/categories`
- `GET/POST /api/transactions`
- `POST /api/budget/assign` (assign money to category)
- `GET /api/budget/available` (unassigned money)

---

## 5. Data Modeling

### Core Entities

```sql
users
├── id (uuid, PK)
├── email (unique)
├── password_hash
└── created_at

accounts
├── id (uuid, PK)
├── user_id (FK → users)
├── name (e.g., "Checking", "Visa")
├── type (checking, savings, credit)
├── balance (decimal)
└── updated_at

categories
├── id (uuid, PK)
├── user_id (FK → users)
├── name (e.g., "Groceries")
├── group (e.g., "Monthly Bills")
├── assigned_amount (decimal) ← Money budgeted this month
├── spent_amount (decimal) ← Running total
└── month (date) ← Categories per month

transactions
├── id (uuid, PK)
├── account_id (FK → accounts)
├── category_id (FK → categories, nullable)
├── date
├── payee
├── amount (decimal, negative for spending)
├── memo
├── cleared (boolean)
└── created_at

budget_months
├── id (uuid, PK)
├── user_id (FK → users)
├── month (date, e.g., 2026-02-01)
├── available_to_budget (decimal) ← Unassigned income
└── carryover_from_previous (decimal)
```

**Key Relationships:**

- User → Accounts (1:N)
- User → Categories (1:N), per month
- Account → Transactions (1:N)
- Category → Transactions (1:N)

**Business Logic Notes:**

- When a transaction is added, update `categories.spent_amount`[^1]
- Track income as positive transactions; assign to `available_to_budget`
- Carryover unspent category amounts month-to-month[^2]

---

## 6. UI/UX Outline

### Main Views

1. **Dashboard (Home)**
   - Current month at-a-glance
   - Available to budget (highlight if negative)
   - Quick-add transaction button
   - Summary cards: Total budgeted, Total spent, Remaining
2. **Budget Screen**
   - Table of categories with columns:
     - Category name
     - Assigned this month
     - Spent
     - Available (Assigned - Spent)
   - Input field to assign money to each category[^1]
   - Visual indicator for overspent categories (red)
3. **Accounts Screen**
   - List all accounts (checking, savings, credit cards)
   - Show cleared vs. uncleared balances
   - Add/edit account modal
4. **Transactions Screen**
   - Filterable table (by account, category, date)
   - Add transaction form (inline or modal)
   - Match imported transactions (Phase 2)[^1]
5. **Reports (Phase 2)**
   - Spending trends by category (bar/line charts)
   - Income vs. expenses over time
   - Net worth tracker

### User Journey

1. **Onboarding:** Create account → Add first account → Input starting balance → Add income transaction → Assign money to "Rent" category
2. **Daily Use:** Add spending transaction → See category balance update instantly → Reallocate if overspent
3. **Monthly Review:** Check reports → Adjust next month's category assignments based on actual spending

---

## 7. Task Breakdown

### Phase 1: MVP (8-10 weeks)

**Week 1-2: Setup & Auth**

- [ ] Initialize Next.js + TypeScript project
- [ ] Set up PostgreSQL database (local + RDS staging)
- [ ] Configure Nest.js backend with JWT auth
- [ ] Implement user registration/login
- [ ] Create database schema and migrations

**Week 3-4: Core Data Models**

- [ ] Build API endpoints for accounts (CRUD)
- [ ] Build API endpoints for categories (CRUD, per month)
- [ ] Implement "available to budget" calculation logic
- [ ] Write unit tests for budget engine rules

**Week 5-6: Transactions & Budget Logic**

- [ ] Transactions API (add, edit, delete)
- [ ] Link transactions to categories and accounts
- [ ] Real-time balance updates (spent_amount, available)
- [ ] Enforce overspending coverage logic[^1]

**Week 7-8: Frontend Build**

- [ ] Dashboard page (Tailwind + React components)
- [ ] Budget screen with assign-money interface
- [ ] Accounts screen with add/edit forms
- [ ] Transactions table with filters

**Week 9-10: Polish & Deploy**

- [ ] End-to-end testing (Playwright or Cypress)
- [ ] Error handling and validation
- [ ] Deploy frontend to Vercel
- [ ] Deploy backend to AWS EC2/Lambda + RDS[^4]
- [ ] Set up CI/CD pipeline (GitHub Actions)

### Phase 2: Enhanced Features (6-8 weeks)

- [ ] Integrate Plaid for bank sync[^1]
- [ ] Build transaction matching UI
- [ ] Goal tracking module (savings goals, monthly targets)
- [ ] Spending reports (charts with Recharts or Chart.js)
- [ ] Multi-month navigation and carryover logic[^2]

### Phase 3: Mobile & Scaling (8-12 weeks)

- [ ] Build React Native or Flutter mobile app[^3][^1]
- [ ] Implement push notifications for overspending
- [ ] Add shared budgets (multi-user permissions)
- [ ] Optimize database queries (indexing, caching with Redis)
- [ ] Add data export (CSV/PDF reports)

---

## 8. Risks & Considerations

### Technical Challenges

- **Real-time Sync:** Ensuring balances update instantly across devices without race conditions (use optimistic updates + TanStack Query)[^3]
- **Financial Precision:** Use `DECIMAL` types in PostgreSQL, never `FLOAT`, to avoid rounding errors
- **Bank Integration:** Plaid requires legal compliance (data privacy, user consent) and costs scale with usage[^1]
- **Transaction Matching:** Auto-matching imported transactions with manual entries is complex—YNAB uses fuzzy logic[^1]

### Scalability

- **Database:** PostgreSQL can handle millions of transactions; use indexes on `user_id`, `account_id`, `category_id`, `date`
- **Caching:** Cache category balances per month (Redis) to reduce recalculations
- **Multi-tenancy:** Ensure row-level security (each query filters by `user_id`)

### Security

- **Auth:** Use httpOnly cookies for JWT tokens, never localStorage[^4]
- **Bank Data:** Store Plaid access tokens encrypted (AWS KMS or Vault)
- **Input Validation:** Sanitize all user inputs (Zod validation on both frontend and backend)

### User Adoption

- **Learning Curve:** Zero-based budgeting requires mindset shift—provide onboarding tutorial[^1]
- **Mobile-First?** Many users budget on-the-go; prioritize responsive web or native mobile early[^3]

---

## Next Steps

1. **Validate Assumptions:** Confirm target users and whether bank sync is must-have or nice-to-have
2. **Design Mockups:** Sketch wireframes for Budget Screen and Transaction flow (use Figma)
3. **Set Up Repository:** Initialize monorepo (Turborepo) or separate frontend/backend repos[^3]
4. **Start with Auth + Accounts:** Build foundation before tackling complex budget logic

Would you like me to expand on any specific section (e.g., detailed API specs, database migration scripts, or component architecture)?

---

[^1]: https://miracuves.com/blog/what-is-the-ynab-app-and-how-does-it-work/
[^2]: https://stackoverflow.com/questions/34404137/how-can-i-model-budget-data-for-a-budget-application
[^3]: https://www.youtube.com/watch?v=b4-PSSRSp58
[^4]: https://www.youtube.com/watch?v=mVePsC78h_8
[^5]: https://himalayas.app/companies/you-need-a-budget/tech-stack
