# BizLocate CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build internal sales CRM — customer/pipeline tracking, activity/task logging, in-app notifications, role-based access (Admin/Manager/Salesperson), admin console, personal settings.

**Architecture:** Next.js (App Router, TypeScript) monolith. API route handlers under `src/app/api/**`. Server-rendered pages under `src/app/(dashboard)/**`. PostgreSQL via Prisma ORM. Session-based auth (opaque token in httpOnly cookie, hash stored in DB) — no NextAuth, no OAuth providers needed for a single credential flow. In-app notifications delivered via Server-Sent Events (SSE).

**Tech Stack:** Next.js 14+ (TS), PostgreSQL, Prisma, bcryptjs (password hashing), Vitest (tests), Node's built-in `crypto` for session tokens. No CSS framework — plain CSS modules (small app, avoids extra dependency).

## Global Constraints

- Single company, no multi-tenancy. No fields/tables for tenant isolation.
- Roles are fixed: `ADMIN`, `MANAGER`, `SALESPERSON` — no configurable permission matrix.
- Notifications: in-app only (SSE + DB), no email/SMS/push.
- Out of scope for all phases: bulk import, self-add customers, external lead intake, mobile app.
- All passwords hashed with bcrypt (cost 10), never logged or returned in API responses.
- Every DB-backed API route must enforce role scoping server-side — never trust client-supplied role/user-id.
- Package manager: npm. Test runner: Vitest, run via `npm test`.
- Test DB: separate Postgres database, connection string in `DATABASE_URL` env when `NODE_ENV=test`. Tests truncate relevant tables between runs — never run against a database containing real data.

---

## Phase 1: Foundation (scaffold, schema, auth, route protection)

### Task 1: Project scaffold + Postgres connection

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/lib/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `prisma` — singleton `PrismaClient` export from `src/lib/db.ts`, used by every later data-access task.

- [ ] **Step 1: Scaffold the app**

```bash
npx create-next-app@latest . --typescript --app --no-tailwind --eslint --src-dir --import-alias "@/*"
npm install prisma @prisma/client bcryptjs
npm install -D vitest @types/bcryptjs dotenv
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Add `.env.example` and test script**

`.env.example`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/bizlocate"
```

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"db:migrate": "prisma migrate dev",
"db:seed": "tsx prisma/seed.ts"
```

- [ ] **Step 3: Create Prisma client singleton**

`src/lib/db.ts`:
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Write failing test**

`tests/db.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/db'

describe('db connection', () => {
  it('connects and can run a raw query', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`
    expect(result[0].ok).toBe(1)
  })
})
```

- [ ] **Step 5: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (no `DATABASE_URL` / no schema yet — connection error)

- [ ] **Step 6: Provision local Postgres, set `DATABASE_URL`, verify test passes**

Create a local Postgres DB named `bizlocate`, copy `.env.example` to `.env` with real credentials.
Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with Prisma + Postgres connection"
```

---

### Task 2: Core schema — User, Team, Session, PipelineStage

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Test: `tests/schema-phase1.test.ts`

**Interfaces:**
- Produces: Prisma models `User { id, name, email, passwordHash, role: Role, teamId, status: UserStatus, createdAt }`, `Team { id, name, managerId }`, `Session { id, userId, tokenHash, expiresAt }`, `PipelineStage { id, name, order, isDefault }`, enums `Role = ADMIN|MANAGER|SALESPERSON`, `UserStatus = ACTIVE|INACTIVE`. Consumed by every later task touching users/teams/auth/stages.

- [ ] **Step 1: Write schema**

`prisma/schema.prisma` (append to the generated header):
```prisma
enum Role {
  ADMIN
  MANAGER
  SALESPERSON
}

enum UserStatus {
  ACTIVE
  INACTIVE
}

model User {
  id           String     @id @default(cuid())
  name         String
  email        String     @unique
  passwordHash String
  role         Role
  status       UserStatus @default(ACTIVE)
  teamId       String?
  team         Team?      @relation("TeamMembers", fields: [teamId], references: [id])
  managedTeam  Team?      @relation("TeamManager")
  createdAt    DateTime   @default(now())
}

model Team {
  id        String  @id @default(cuid())
  name      String
  managerId String? @unique
  manager   User?   @relation("TeamManager", fields: [managerId], references: [id])
  members   User[]  @relation("TeamMembers")
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
}

model PipelineStage {
  id        String  @id @default(cuid())
  name      String
  order     Int
  isDefault Boolean @default(false)
}
```

- [ ] **Step 2: Write failing test**

`tests/schema-phase1.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '../src/lib/db'

describe('phase 1 schema', () => {
  it('creates a team, a manager user, and a pipeline stage', async () => {
    const team = await prisma.team.create({ data: { name: 'North Team' } })
    const manager = await prisma.user.create({
      data: {
        name: 'Manager One',
        email: 'manager1@bizlocate.com.my',
        passwordHash: 'x',
        role: 'MANAGER',
        teamId: team.id,
      },
    })
    await prisma.team.update({ where: { id: team.id }, data: { managerId: manager.id } })
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0, isDefault: true } })
    expect(manager.teamId).toBe(team.id)
    expect(stage.isDefault).toBe(true)
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (Prisma client not generated / tables don't exist)

- [ ] **Step 4: Migrate and run test**

```bash
npx prisma migrate dev --name phase1_core_schema
npm test
```
Expected: PASS

- [ ] **Step 5: Write seed script**

`prisma/seed.ts`:
```ts
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const stages = ['New', 'Contacted', 'Qualified', 'Won', 'Lost']
  for (const [i, name] of stages.entries()) {
    await prisma.pipelineStage.upsert({
      where: { id: `seed-stage-${i}` },
      update: {},
      create: { id: `seed-stage-${i}`, name, order: i, isDefault: true },
    })
  }

  const passwordHash = await bcrypt.hash('ChangeMe123!', 10)
  await prisma.user.upsert({
    where: { email: 'admin@bizlocate.com.my' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@bizlocate.com.my',
      passwordHash,
      role: 'ADMIN',
    },
  })
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 6: Run seed, confirm it succeeds**

Run: `npm run db:seed`
Expected: exits 0, no errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add core schema (User, Team, Session, PipelineStage) + seed"
```

---

### Task 3: Auth library — password hashing + session tokens

**Files:**
- Create: `src/lib/auth.ts`
- Test: `tests/lib/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` from `src/lib/db.ts` (Task 1), `Session`/`User` models (Task 2)
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>`, `createSession(userId: string): Promise<string>` (returns raw token), `getUserFromToken(token: string): Promise<User | null>`, `deleteSession(token: string): Promise<void>`, constant `SESSION_COOKIE = 'session_token'`. Consumed by Task 4 (login/logout routes) and Task 5 (route guard).

- [ ] **Step 1: Write failing tests**

`tests/lib/auth.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../src/lib/db'
import { hashPassword, verifyPassword, createSession, getUserFromToken, deleteSession } from '../../src/lib/auth'

beforeEach(async () => {
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
})

describe('password hashing', () => {
  it('hashes and verifies correctly', async () => {
    const hash = await hashPassword('secret123')
    expect(await verifyPassword('secret123', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})

describe('sessions', () => {
  it('creates a session and resolves the user from its token', async () => {
    const user = await prisma.user.create({
      data: { name: 'A', email: 'a@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' },
    })
    const token = await createSession(user.id)
    const resolved = await getUserFromToken(token)
    expect(resolved?.id).toBe(user.id)
  })

  it('returns null for a deleted session', async () => {
    const user = await prisma.user.create({
      data: { name: 'B', email: 'b@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' },
    })
    const token = await createSession(user.id)
    await deleteSession(token)
    expect(await getUserFromToken(token)).toBeNull()
  })

  it('returns null for a garbage token', async () => {
    expect(await getUserFromToken('not-a-real-token')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL (`src/lib/auth.ts` doesn't exist)

- [ ] **Step 3: Implement**

`src/lib/auth.ts`:
```ts
import bcrypt from 'bcryptjs'
import { randomBytes, createHash } from 'crypto'
import { prisma } from './db'

export const SESSION_COOKIE = 'session_token'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
  return token
}

export async function getUserFromToken(token: string) {
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!session || session.expiresAt < new Date()) return null
  return prisma.user.findUnique({ where: { id: session.userId } })
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add password hashing + session token library"
```

---

### Task 4: Login/logout API routes + login page

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/login/page.tsx`
- Test: `tests/api/auth.test.ts`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword`/`createSession`/`deleteSession`/`SESSION_COOKIE` from `src/lib/auth.ts` (Task 3)
- Produces: `POST /api/auth/login` (body `{ email, password }` → sets `session_token` cookie, 200 with `{ user: { id, name, email, role } }`, or 401), `POST /api/auth/logout` (clears cookie, 200). Consumed by Task 5 (guard) and login page.

- [ ] **Step 1: Write failing test**

`tests/api/auth.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'
import { POST as login } from '../../src/app/api/auth/login/route'

beforeEach(async () => {
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({
    data: {
      name: 'Sales One',
      email: 'sales1@bizlocate.com.my',
      passwordHash: await hashPassword('correcthorse'),
      role: 'SALESPERSON',
    },
  })
})

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and sets a session cookie', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'sales1@bizlocate.com.my', password: 'correcthorse' }),
    })
    const res = await login(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('session_token=')
  })

  it('rejects wrong password', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'sales1@bizlocate.com.my', password: 'wrong' }),
    })
    const res = await login(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (route file doesn't exist)

- [ ] **Step 3: Implement login route**

`src/app/api/auth/login/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, createSession, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: Request) {
  const { email, password } = await req.json()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }
  const token = await createSession(user.id)
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  return res
}
```

- [ ] **Step 4: Implement logout route**

`src/app/api/auth/logout/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { deleteSession, SESSION_COOKIE } from '@/lib/auth'

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) await deleteSession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Build login page**

`src/app/login/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    if (!res.ok) return setError('Invalid email or password')
    router.push('/customers')
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>BizLocate CRM Login</h1>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
      {error && <p role="alert">{error}</p>}
      <button type="submit">Log in</button>
    </form>
  )
}
```

- [ ] **Step 7: Manual browser verification**

Run: `npm run dev`, visit `/login`, log in as `admin@bizlocate.com.my` / `ChangeMe123!` (seeded Task 2). Confirm redirect to `/customers` (page not built yet — 404 is expected at this step, only the redirect + cookie set need to be confirmed via browser devtools Application tab).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add login/logout API routes and login page"
```

---

### Task 5: Auth guard + dashboard layout (route protection)

**Files:**
- Create: `src/lib/current-user.ts`
- Create: `src/app/(dashboard)/layout.tsx`
- Test: `tests/lib/current-user.test.ts`

**Interfaces:**
- Consumes: `getUserFromToken`, `SESSION_COOKIE` from `src/lib/auth.ts` (Task 3)
- Produces: `getCurrentUser(): Promise<User | null>` (reads cookie server-side), `requireUser(): Promise<User>` (throws redirect to `/login` if absent). Consumed by every dashboard page/route from Phase 2 onward for auth + role checks.

- [ ] **Step 1: Write failing test**

`tests/lib/current-user.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { createSession } from '../../src/lib/auth'

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (globalThis as any).__testCookie?.[name],
  }),
}))

import { getCurrentUser } from '../../src/lib/current-user'

beforeEach(async () => {
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
  ;(globalThis as any).__testCookie = {}
})

describe('getCurrentUser', () => {
  it('returns null when no cookie set', async () => {
    expect(await getCurrentUser()).toBeNull()
  })

  it('returns the user for a valid session cookie', async () => {
    const user = await prisma.user.create({
      data: { name: 'C', email: 'c@bizlocate.com.my', passwordHash: 'x', role: 'ADMIN' },
    })
    const token = await createSession(user.id)
    ;(globalThis as any).__testCookie = { session_token: { value: token } }
    const resolved = await getCurrentUser()
    expect(resolved?.id).toBe(user.id)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (`src/lib/current-user.ts` doesn't exist)

- [ ] **Step 3: Implement**

`src/lib/current-user.ts`:
```ts
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUserFromToken, SESSION_COOKIE } from './auth'

export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null
  return getUserFromToken(token)
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Build dashboard layout that enforces auth**

`src/app/(dashboard)/layout.tsx`:
```tsx
import { requireUser } from '@/lib/current-user'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div>
      <header>
        <span>{user.name} ({user.role})</span>
        <form action="/api/auth/logout" method="post"><button type="submit">Log out</button></form>
      </header>
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 6: Manual browser verification**

Visit `/customers` (route group, no page yet) while logged out → confirm redirect to `/login`. Log in, revisit → confirm layout renders (page content 404 until Phase 2, layout/header should still render around it).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add auth guard and protected dashboard layout"
```

---

## Phase 2: Customer Core (pipeline, activities, tasks)

### Task 6: Schema — Customer, Activity, Task, Notification

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/schema-phase2.test.ts`

**Interfaces:**
- Produces: `Customer { id, name, email, phone, assignedToId, stageId, createdById, createdAt }`, `Activity { id, customerId, userId, type: ActivityType, content, followUpDate, createdAt }`, `Task { id, customerId, userId, title, dueDate, done, createdAt }`, `Notification { id, userId, type, message, read, createdAt }`, enum `ActivityType = CALL|VISIT|NOTE`. Consumed by all remaining Phase 2/3/4 tasks.

- [ ] **Step 1: Write schema**

Append to `prisma/schema.prisma`:
```prisma
enum ActivityType {
  CALL
  VISIT
  NOTE
}

model Customer {
  id           String        @id @default(cuid())
  name         String
  email        String?
  phone        String?
  assignedToId String
  assignedTo   User          @relation(fields: [assignedToId], references: [id])
  stageId      String
  stage        PipelineStage @relation(fields: [stageId], references: [id])
  createdById  String
  createdAt    DateTime      @default(now())
  activities   Activity[]
  tasks        Task[]
}

model Activity {
  id           String       @id @default(cuid())
  customerId   String
  customer     Customer     @relation(fields: [customerId], references: [id])
  userId       String
  type         ActivityType
  content      String
  followUpDate DateTime?
  createdAt    DateTime     @default(now())
}

model Task {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  userId     String
  title      String
  dueDate    DateTime
  done       Boolean  @default(false)
  createdAt  DateTime @default(now())
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

Also add the reverse relation on `PipelineStage`: `customers Customer[]`.

- [ ] **Step 2: Write failing test**

`tests/schema-phase2.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/db'

describe('phase 2 schema', () => {
  it('creates a customer with activity and task', async () => {
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const user = await prisma.user.create({
      data: { name: 'S', email: `s-${Date.now()}@bizlocate.com.my`, passwordHash: 'x', role: 'SALESPERSON' },
    })
    const customer = await prisma.customer.create({
      data: { name: 'Acme Corp', assignedToId: user.id, stageId: stage.id, createdById: user.id },
    })
    await prisma.activity.create({
      data: { customerId: customer.id, userId: user.id, type: 'CALL', content: 'Intro call' },
    })
    await prisma.task.create({
      data: { customerId: customer.id, userId: user.id, title: 'Follow up', dueDate: new Date() },
    })
    const full = await prisma.customer.findUnique({ where: { id: customer.id }, include: { activities: true, tasks: true } })
    expect(full?.activities.length).toBe(1)
    expect(full?.tasks.length).toBe(1)
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (tables don't exist)

- [ ] **Step 4: Migrate, run test**

```bash
npx prisma migrate dev --name phase2_customer_core
npm test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Customer, Activity, Task, Notification schema"
```

---

### Task 7: Permission scoping library

**Files:**
- Create: `src/lib/permissions.ts`
- Test: `tests/lib/permissions.test.ts`

**Interfaces:**
- Consumes: `Role` enum, `User` type (Task 2/6)
- Produces: `customerScopeWhere(user: { id: string; role: Role; teamId: string | null }): Prisma.CustomerWhereInput` — returns a Prisma `where` clause scoping customers by role (ADMIN: all, MANAGER: `assignedTo.teamId === user.teamId`, SALESPERSON: `assignedToId === user.id`). Consumed by Task 8 (list/detail API) and all customer-mutation routes.

- [ ] **Step 1: Write failing test**

`tests/lib/permissions.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { customerScopeWhere } from '../../src/lib/permissions'

describe('customerScopeWhere', () => {
  it('admin sees everything', () => {
    expect(customerScopeWhere({ id: 'a1', role: 'ADMIN', teamId: null })).toEqual({})
  })

  it('manager scoped to own team', () => {
    expect(customerScopeWhere({ id: 'm1', role: 'MANAGER', teamId: 'team1' })).toEqual({
      assignedTo: { teamId: 'team1' },
    })
  })

  it('salesperson scoped to own assignments', () => {
    expect(customerScopeWhere({ id: 's1', role: 'SALESPERSON', teamId: 'team1' })).toEqual({
      assignedToId: 's1',
    })
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (file doesn't exist)

- [ ] **Step 3: Implement**

`src/lib/permissions.ts`:
```ts
import type { Role, Prisma } from '@prisma/client'

type ScopeUser = { id: string; role: Role; teamId: string | null }

export function customerScopeWhere(user: ScopeUser): Prisma.CustomerWhereInput {
  if (user.role === 'ADMIN') return {}
  if (user.role === 'MANAGER') return { assignedTo: { teamId: user.teamId } }
  return { assignedToId: user.id }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add role-based customer scoping helper"
```

---

### Task 8: Customer list + detail + create API

**Files:**
- Create: `src/app/api/customers/route.ts`
- Create: `src/app/api/customers/[id]/route.ts`
- Test: `tests/api/customers.test.ts`

**Interfaces:**
- Consumes: `customerScopeWhere` (Task 7), `getCurrentUser`/`requireUser` (Task 5), `prisma` (Task 1)
- Produces: `GET /api/customers` (role-scoped list), `POST /api/customers` (ADMIN/MANAGER only — creates customer, writes a `Notification` row for `assignedToId`), `GET /api/customers/:id` (404 if outside scope), consumed by Task 9/10/11 and the list/detail pages (Task 12/13).

- [ ] **Step 1: Write failing tests**

`tests/api/customers.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { GET as listCustomers, POST as createCustomer } from '../../src/app/api/customers/route'

beforeEach(async () => {
  await prisma.notification.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.team.deleteMany()
  await prisma.pipelineStage.deleteMany()
})

describe('GET /api/customers', () => {
  it('scopes results to the salesperson\'s own assignments', async () => {
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const s1 = await prisma.user.create({ data: { name: 'S1', email: 's1@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const s2 = await prisma.user.create({ data: { name: 'S2', email: 's2@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    await prisma.customer.create({ data: { name: 'Mine', assignedToId: s1.id, stageId: stage.id, createdById: s1.id } })
    await prisma.customer.create({ data: { name: 'Not mine', assignedToId: s2.id, stageId: stage.id, createdById: s2.id } })

    currentUser = { ...s1 }
    const res = await listCustomers()
    const body = await res.json()
    expect(body.customers.length).toBe(1)
    expect(body.customers[0].name).toBe('Mine')
  })
})

describe('POST /api/customers', () => {
  it('rejects a salesperson creating a customer', async () => {
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const s1 = await prisma.user.create({ data: { name: 'S1', email: 's1b@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    currentUser = s1
    const req = new Request('http://localhost/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'X', assignedToId: s1.id, stageId: stage.id }),
    })
    const res = await createCustomer(req)
    expect(res.status).toBe(403)
  })

  it('admin creates a customer and a notification is written for the assignee', async () => {
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin2@bizlocate.com.my', passwordHash: 'x', role: 'ADMIN' } })
    const s1 = await prisma.user.create({ data: { name: 'S1', email: 's1c@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    currentUser = admin
    const req = new Request('http://localhost/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Acme', assignedToId: s1.id, stageId: stage.id }),
    })
    const res = await createCustomer(req)
    expect(res.status).toBe(201)
    const notifications = await prisma.notification.findMany({ where: { userId: s1.id } })
    expect(notifications.length).toBe(1)
    expect(notifications[0].type).toBe('CUSTOMER_ASSIGNED')
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL (route files don't exist)

- [ ] **Step 3: Implement list + create route**

`src/app/api/customers/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { customerScopeWhere } from '@/lib/permissions'

export async function GET() {
  const user = await requireUser()
  const customers = await prisma.customer.findMany({
    where: customerScopeWhere(user),
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ customers })
}

export async function POST(req: Request) {
  const user = await requireUser()
  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { name, email, phone, assignedToId, stageId } = await req.json()
  const customer = await prisma.customer.create({
    data: { name, email, phone, assignedToId, stageId, createdById: user.id },
  })
  await prisma.notification.create({
    data: { userId: assignedToId, type: 'CUSTOMER_ASSIGNED', message: `You were assigned ${name}` },
  })
  return NextResponse.json({ customer }, { status: 201 })
}
```

- [ ] **Step 4: Implement detail route**

`src/app/api/customers/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { customerScopeWhere } from '@/lib/permissions'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const customer = await prisma.customer.findFirst({
    where: { id: params.id, ...customerScopeWhere(user) },
    include: { activities: true, tasks: true, stage: true },
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ customer })
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add role-scoped customer list/detail/create API"
```

---

### Task 9: Activity log API

**Files:**
- Create: `src/app/api/customers/[id]/activities/route.ts`
- Test: `tests/api/activities.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 5), `customerScopeWhere` (Task 7)
- Produces: `POST /api/customers/:id/activities` (body `{ type, content, followUpDate? }`, 403 if customer outside scope), `GET /api/customers/:id/activities`. Consumed by Task 13 (customer detail page).

- [ ] **Step 1: Write failing test**

`tests/api/activities.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { POST as createActivity } from '../../src/app/api/customers/[id]/activities/route'

beforeEach(async () => {
  await prisma.activity.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.pipelineStage.deleteMany()
})

describe('POST /api/customers/:id/activities', () => {
  it('logs an activity for an in-scope customer', async () => {
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const s1 = await prisma.user.create({ data: { name: 'S1', email: 's1d@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const customer = await prisma.customer.create({ data: { name: 'Acme', assignedToId: s1.id, stageId: stage.id, createdById: s1.id } })
    currentUser = s1
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ type: 'CALL', content: 'Talked' }) })
    const res = await createActivity(req, { params: { id: customer.id } })
    expect(res.status).toBe(201)
  })

  it('rejects logging on a customer outside scope', async () => {
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const s1 = await prisma.user.create({ data: { name: 'S1', email: 's1e@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const s2 = await prisma.user.create({ data: { name: 'S2', email: 's2e@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const customer = await prisma.customer.create({ data: { name: 'Not mine', assignedToId: s2.id, stageId: stage.id, createdById: s2.id } })
    currentUser = s1
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ type: 'CALL', content: 'x' }) })
    const res = await createActivity(req, { params: { id: customer.id } })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (route doesn't exist)

- [ ] **Step 3: Implement**

`src/app/api/customers/[id]/activities/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { customerScopeWhere } from '@/lib/permissions'

async function assertInScope(customerId: string, user: any) {
  return prisma.customer.findFirst({ where: { id: customerId, ...customerScopeWhere(user) } })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const customer = await assertInScope(params.id, user)
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { type, content, followUpDate } = await req.json()
  const activity = await prisma.activity.create({
    data: { customerId: params.id, userId: user.id, type, content, followUpDate: followUpDate ? new Date(followUpDate) : null },
  })
  return NextResponse.json({ activity }, { status: 201 })
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const customer = await assertInScope(params.id, user)
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const activities = await prisma.activity.findMany({ where: { customerId: params.id }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ activities })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add customer activity log API"
```

---

### Task 10: Task (follow-up) API

**Files:**
- Create: `src/app/api/customers/[id]/tasks/route.ts`
- Create: `src/app/api/tasks/[taskId]/route.ts`
- Test: `tests/api/tasks.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 5), `customerScopeWhere` (Task 7)
- Produces: `POST /api/customers/:id/tasks` (create), `GET /api/customers/:id/tasks` (list), `PATCH /api/tasks/:taskId` (toggle `done`, scope-checked via the task's customer). Consumed by Task 13.

- [ ] **Step 1: Write failing test**

`tests/api/tasks.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { POST as createTask } from '../../src/app/api/customers/[id]/tasks/route'
import { PATCH as patchTask } from '../../src/app/api/tasks/[taskId]/route'

beforeEach(async () => {
  await prisma.task.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.pipelineStage.deleteMany()
})

describe('tasks API', () => {
  it('creates a task then marks it done', async () => {
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const s1 = await prisma.user.create({ data: { name: 'S1', email: 's1f@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const customer = await prisma.customer.create({ data: { name: 'Acme', assignedToId: s1.id, stageId: stage.id, createdById: s1.id } })
    currentUser = s1

    const createReq = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ title: 'Call back', dueDate: '2026-08-01' }) })
    const createRes = await createTask(createReq, { params: { id: customer.id } })
    expect(createRes.status).toBe(201)
    const { task } = await createRes.json()
    expect(task.done).toBe(false)

    const patchReq = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ done: true }) })
    const patchRes = await patchTask(patchReq, { params: { taskId: task.id } })
    expect(patchRes.status).toBe(200)
    const { task: updated } = await patchRes.json()
    expect(updated.done).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Implement create/list route**

`src/app/api/customers/[id]/tasks/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { customerScopeWhere } from '@/lib/permissions'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const customer = await prisma.customer.findFirst({ where: { id: params.id, ...customerScopeWhere(user) } })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { title, dueDate } = await req.json()
  const task = await prisma.task.create({ data: { customerId: params.id, userId: user.id, title, dueDate: new Date(dueDate) } })
  return NextResponse.json({ task }, { status: 201 })
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const customer = await prisma.customer.findFirst({ where: { id: params.id, ...customerScopeWhere(user) } })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const tasks = await prisma.task.findMany({ where: { customerId: params.id }, orderBy: { dueDate: 'asc' } })
  return NextResponse.json({ tasks })
}
```

- [ ] **Step 4: Implement patch route**

`src/app/api/tasks/[taskId]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { customerScopeWhere } from '@/lib/permissions'

export async function PATCH(req: Request, { params }: { params: { taskId: string } }) {
  const user = await requireUser()
  const task = await prisma.task.findUnique({ where: { id: params.taskId } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const customer = await prisma.customer.findFirst({ where: { id: task.customerId, ...customerScopeWhere(user) } })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { done } = await req.json()
  const updated = await prisma.task.update({ where: { id: params.taskId }, data: { done } })
  return NextResponse.json({ task: updated })
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add customer task API"
```

---

### Task 11: Customer stage update API

**Files:**
- Modify: `src/app/api/customers/[id]/route.ts`
- Test: `tests/api/customer-stage.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `customerScopeWhere`
- Produces: `PATCH /api/customers/:id` (body `{ stageId }`, scope-checked). Consumed by Task 13 (stage selector on detail page).

- [ ] **Step 1: Write failing test**

`tests/api/customer-stage.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { PATCH as patchCustomer } from '../../src/app/api/customers/[id]/route'

beforeEach(async () => {
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.pipelineStage.deleteMany()
})

describe('PATCH /api/customers/:id', () => {
  it('updates stage for an in-scope customer', async () => {
    const stageNew = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const stageContacted = await prisma.pipelineStage.create({ data: { name: 'Contacted', order: 1 } })
    const s1 = await prisma.user.create({ data: { name: 'S1', email: 's1g@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const customer = await prisma.customer.create({ data: { name: 'Acme', assignedToId: s1.id, stageId: stageNew.id, createdById: s1.id } })
    currentUser = s1
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ stageId: stageContacted.id }) })
    const res = await patchCustomer(req, { params: { id: customer.id } })
    expect(res.status).toBe(200)
    const { customer: updated } = await res.json()
    expect(updated.stageId).toBe(stageContacted.id)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL (`PATCH` export doesn't exist yet)

- [ ] **Step 3: Add PATCH export to existing detail route**

Append to `src/app/api/customers/[id]/route.ts`:
```ts
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const existing = await prisma.customer.findFirst({ where: { id: params.id, ...customerScopeWhere(user) } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { stageId } = await req.json()
  const customer = await prisma.customer.update({ where: { id: params.id }, data: { stageId } })
  return NextResponse.json({ customer })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add customer stage update endpoint"
```

---

### Task 12: Customer list page (UI)

**Files:**
- Create: `src/app/(dashboard)/customers/page.tsx`
- Create: `src/app/(dashboard)/customers/customers.module.css`

**Interfaces:**
- Consumes: `GET /api/customers` (Task 8), `requireUser` (Task 5)

- [ ] **Step 1: Build the page (server component, fetches directly via Prisma — no client round-trip needed for initial render)**

`src/app/(dashboard)/customers/page.tsx`:
```tsx
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { customerScopeWhere } from '@/lib/permissions'
import Link from 'next/link'
import styles from './customers.module.css'

export default async function CustomersPage() {
  const user = await requireUser()
  const customers = await prisma.customer.findMany({
    where: customerScopeWhere(user),
    include: { stage: true, assignedTo: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className={styles.wrap}>
      <h1>Customers</h1>
      <table>
        <thead><tr><th>Name</th><th>Stage</th><th>Assigned to</th></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/customers/${c.id}`}>{c.name}</Link></td>
              <td>{c.stage.name}</td>
              <td>{c.assignedTo.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`src/app/(dashboard)/customers/customers.module.css`:
```css
.wrap { padding: 1rem; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ddd; }
```

- [ ] **Step 2: Manual browser verification**

Run: `npm run dev`. Log in as the seeded admin, visit `/customers` — table renders (empty, no customers seeded yet). Use `POST /api/customers` via a REST client (or Task 8's test coverage) to create one, refresh, confirm it appears. Log in as a salesperson not assigned to it, confirm it does NOT appear (role scoping working end-to-end).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add customer list page"
```

---

### Task 13: Customer detail page (UI)

**Files:**
- Create: `src/app/(dashboard)/customers/[id]/page.tsx`
- Create: `src/app/(dashboard)/customers/[id]/ActivityForm.tsx`
- Create: `src/app/(dashboard)/customers/[id]/TaskList.tsx`

**Interfaces:**
- Consumes: `GET /api/customers/:id`, `POST .../activities`, `POST .../tasks`, `PATCH /api/tasks/:taskId`, `PATCH /api/customers/:id` (Tasks 8-11)

- [ ] **Step 1: Build detail page (server component for initial data)**

`src/app/(dashboard)/customers/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { customerScopeWhere } from '@/lib/permissions'
import ActivityForm from './ActivityForm'
import TaskList from './TaskList'

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser()
  const customer = await prisma.customer.findFirst({
    where: { id: params.id, ...customerScopeWhere(user) },
    include: { activities: { orderBy: { createdAt: 'desc' } }, tasks: { orderBy: { dueDate: 'asc' } }, stage: true },
  })
  if (!customer) notFound()

  return (
    <div>
      <h1>{customer.name}</h1>
      <p>Stage: {customer.stage.name}</p>
      <h2>Activities</h2>
      <ActivityForm customerId={customer.id} />
      <ul>{customer.activities.map((a) => <li key={a.id}>[{a.type}] {a.content}</li>)}</ul>
      <h2>Tasks</h2>
      <TaskList customerId={customer.id} initialTasks={customer.tasks} />
    </div>
  )
}
```

- [ ] **Step 2: Build activity form (client component)**

`src/app/(dashboard)/customers/[id]/ActivityForm.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ActivityForm({ customerId }: { customerId: string }) {
  const [content, setContent] = useState('')
  const [type, setType] = useState('NOTE')
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await fetch(`/api/customers/${customerId}/activities`, { method: 'POST', body: JSON.stringify({ type, content }) })
    setContent('')
    router.refresh()
  }

  return (
    <form onSubmit={submit}>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="CALL">Call</option>
        <option value="VISIT">Visit</option>
        <option value="NOTE">Note</option>
      </select>
      <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="What happened?" required />
      <button type="submit">Log</button>
    </form>
  )
}
```

- [ ] **Step 3: Build task list (client component)**

`src/app/(dashboard)/customers/[id]/TaskList.tsx`:
```tsx
'use client'
import { useState } from 'react'

type Task = { id: string; title: string; dueDate: string; done: boolean }

export default function TaskList({ customerId, initialTasks }: { customerId: string; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/customers/${customerId}/tasks`, { method: 'POST', body: JSON.stringify({ title, dueDate }) })
    const { task } = await res.json()
    setTasks([...tasks, task])
    setTitle('')
  }

  async function toggleDone(taskId: string, done: boolean) {
    await fetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ done }) })
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, done } : t)))
  }

  return (
    <div>
      <form onSubmit={addTask}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task" required />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        <button type="submit">Add</button>
      </form>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>
            <input type="checkbox" checked={t.done} onChange={(e) => toggleDone(t.id, e.target.checked)} />
            {t.title} (due {t.dueDate})
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Manual browser verification**

Visit a customer detail page, add an activity, add a task, toggle it done — confirm all three round-trip and persist on refresh.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add customer detail page with activity log and tasks"
```

---

## Phase 3: Notifications

### Task 14: Notifications API (list + mark read)

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Test: `tests/api/notifications.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 5), `Notification` model (Task 6)
- Produces: `GET /api/notifications` (own notifications, newest first), `PATCH /api/notifications` (body `{ ids: string[] }`, marks read). Consumed by Task 16 (bell component).

- [ ] **Step 1: Write failing test**

`tests/api/notifications.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { GET as listNotifications, PATCH as markRead } from '../../src/app/api/notifications/route'

beforeEach(async () => {
  await prisma.notification.deleteMany()
  await prisma.user.deleteMany()
})

describe('notifications API', () => {
  it('lists only the current user\'s notifications and can mark them read', async () => {
    const u1 = await prisma.user.create({ data: { name: 'U1', email: 'u1@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const u2 = await prisma.user.create({ data: { name: 'U2', email: 'u2@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const n1 = await prisma.notification.create({ data: { userId: u1.id, type: 'CUSTOMER_ASSIGNED', message: 'a' } })
    await prisma.notification.create({ data: { userId: u2.id, type: 'CUSTOMER_ASSIGNED', message: 'b' } })

    currentUser = u1
    const listRes = await listNotifications()
    const { notifications } = await listRes.json()
    expect(notifications.length).toBe(1)
    expect(notifications[0].read).toBe(false)

    const patchReq = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ ids: [n1.id] }) })
    const patchRes = await markRead(patchReq)
    expect(patchRes.status).toBe(200)
    const updated = await prisma.notification.findUnique({ where: { id: n1.id } })
    expect(updated?.read).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Implement**

`src/app/api/notifications/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'

export async function GET() {
  const user = await requireUser()
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ notifications })
}

export async function PATCH(req: Request) {
  const user = await requireUser()
  const { ids }: { ids: string[] } = await req.json()
  await prisma.notification.updateMany({ where: { id: { in: ids }, userId: user.id }, data: { read: true } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add notification list and mark-read API"
```

---

### Task 15: SSE notification stream

**Files:**
- Create: `src/app/api/notifications/stream/route.ts`
- Create: `src/lib/notification-events.ts`
- Test: `tests/lib/notification-events.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 5)
- Produces: `src/lib/notification-events.ts` exports `subscribe(userId: string, cb: (n: Notification) => void): () => void` and `publish(userId: string, notification: Notification): void` (in-process event emitter — sufficient for a single-instance deployment, no Redis pub/sub needed at this scale). `GET /api/notifications/stream` — SSE endpoint. Task 8's `POST /api/customers` must call `publish()` after creating a Notification (modify Task 8's route). Consumed by Task 16 (bell component).

- [ ] **Step 1: Write failing test for the event bus**

`tests/lib/notification-events.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { subscribe, publish } from '../../src/lib/notification-events'

describe('notification-events', () => {
  it('delivers a published event only to the subscribed user', () => {
    const receivedA: any[] = []
    const receivedB: any[] = []
    const unsubA = subscribe('userA', (n) => receivedA.push(n))
    const unsubB = subscribe('userB', (n) => receivedB.push(n))

    publish('userA', { id: '1', message: 'hi' } as any)

    expect(receivedA.length).toBe(1)
    expect(receivedB.length).toBe(0)
    unsubA()
    unsubB()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Implement event bus**

`src/lib/notification-events.ts`:
```ts
import { EventEmitter } from 'events'
import type { Notification } from '@prisma/client'

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

export function subscribe(userId: string, cb: (n: Notification) => void): () => void {
  emitter.on(userId, cb)
  return () => emitter.off(userId, cb)
}

export function publish(userId: string, notification: Notification): void {
  emitter.emit(userId, notification)
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Wire publish() into customer creation**

Modify `src/app/api/customers/route.ts` `POST` handler — after `prisma.notification.create(...)`, add:
```ts
import { publish } from '@/lib/notification-events'
// ...
const notification = await prisma.notification.create({
  data: { userId: assignedToId, type: 'CUSTOMER_ASSIGNED', message: `You were assigned ${name}` },
})
publish(assignedToId, notification)
```
(Change the earlier `await prisma.notification.create(...)` statement to capture its result in a `notification` variable, then call `publish`.)

- [ ] **Step 6: Implement SSE route**

`src/app/api/notifications/stream/route.ts`:
```ts
import { requireUser } from '@/lib/current-user'
import { subscribe } from '@/lib/notification-events'

export async function GET() {
  const user = await requireUser()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribe(user.id, (notification) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(notification)}\n\n`))
      })
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 30000)
      // @ts-expect-error - custom cleanup hook read by the framework's abort signal
      controller._cleanup = () => { unsubscribe(); clearInterval(heartbeat) }
    },
    cancel() {},
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
```

- [ ] **Step 7: Re-run full test suite**

Run: `npm test`
Expected: PASS (all prior tests still green, including Task 8's customer creation test)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add SSE notification stream"
```

---

### Task 16: Notification bell UI

**Files:**
- Create: `src/components/NotificationBell.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications`, `PATCH /api/notifications`, `GET /api/notifications/stream` (Tasks 14-15)

- [ ] **Step 1: Build the component**

`src/components/NotificationBell.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'

type Notification = { id: string; message: string; read: boolean; createdAt: string }

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/notifications').then((r) => r.json()).then((d) => setNotifications(d.notifications))
    const source = new EventSource('/api/notifications/stream')
    source.onmessage = (event) => {
      const notification = JSON.parse(event.data)
      setNotifications((prev) => [notification, ...prev])
    }
    return () => source.close()
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id)
    if (ids.length === 0) return
    await fetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({ ids }) })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return (
    <div>
      <button onClick={() => { setOpen(!open); if (!open) markAllRead() }}>
        Bell ({unreadCount})
      </button>
      {open && (
        <ul>
          {notifications.map((n) => <li key={n.id}>{n.message}</li>)}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into dashboard header**

In `src/app/(dashboard)/layout.tsx`, import and render `<NotificationBell />` next to the user's name in `<header>`.

- [ ] **Step 3: Manual browser verification (two-session test)**

Open two browser sessions (or one normal + one incognito): log in as Admin in one, as a Salesperson in the other. In the Admin session, create a customer assigned to that Salesperson (via the customers page/API). In the Salesperson session, confirm the bell badge count increments within ~1s without a page refresh (SSE push), then confirm clicking the bell marks it read and the badge clears.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add live notification bell"
```

---

## Phase 4: Admin

### Task 17: User CRUD API (admin-only)

**Files:**
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[id]/route.ts`
- Test: `tests/api/admin-users.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 5), `hashPassword` (Task 3)
- Produces: `GET /api/admin/users`, `POST /api/admin/users` (create, sets a temp password), `PATCH /api/admin/users/:id` (edit name/role/team/status). All admin-only (403 for others). Consumed by Task 22 (admin UI).

- [ ] **Step 1: Write failing test**

`tests/api/admin-users.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { POST as createUser } from '../../src/app/api/admin/users/route'
import { PATCH as patchUser } from '../../src/app/api/admin/users/[id]/route'

beforeEach(async () => {
  await prisma.user.deleteMany()
})

describe('admin user management', () => {
  it('rejects non-admins', async () => {
    currentUser = { role: 'MANAGER', id: 'm1' }
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'X', email: 'x@bizlocate.com.my', role: 'SALESPERSON' }) })
    const res = await createUser(req)
    expect(res.status).toBe(403)
  })

  it('admin creates then deactivates a user', async () => {
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin3@bizlocate.com.my', passwordHash: 'x', role: 'ADMIN' } })
    currentUser = admin
    const createReq = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'New Sales', email: 'newsales@bizlocate.com.my', role: 'SALESPERSON' }) })
    const createRes = await createUser(createReq)
    expect(createRes.status).toBe(201)
    const { user } = await createRes.json()

    const patchReq = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'INACTIVE' }) })
    const patchRes = await patchUser(patchReq, { params: { id: user.id } })
    expect(patchRes.status).toBe(200)
    const updated = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updated?.status).toBe('INACTIVE')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Implement**

`src/app/api/admin/users/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { hashPassword } from '@/lib/auth'

export async function GET() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ users })
}

export async function POST(req: Request) {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, email, role, teamId } = await req.json()
  const tempPassword = randomBytes(9).toString('base64url')
  const created = await prisma.user.create({
    data: { name, email, role, teamId, passwordHash: await hashPassword(tempPassword) },
  })
  return NextResponse.json({ user: created, tempPassword }, { status: 201 })
}
```

`src/app/api/admin/users/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, role, teamId, status } = await req.json()
  const updated = await prisma.user.update({ where: { id: params.id }, data: { name, role, teamId, status } })
  return NextResponse.json({ user: updated })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin user CRUD API"
```

---

### Task 18: Team CRUD API (admin-only)

**Files:**
- Create: `src/app/api/admin/teams/route.ts`
- Create: `src/app/api/admin/teams/[id]/route.ts`
- Test: `tests/api/admin-teams.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 5)
- Produces: `GET /api/admin/teams`, `POST /api/admin/teams` (`{ name, managerId }`), `PATCH /api/admin/teams/:id`. Admin-only. Consumed by Task 22.

- [ ] **Step 1: Write failing test**

`tests/api/admin-teams.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { POST as createTeam } from '../../src/app/api/admin/teams/route'

beforeEach(async () => {
  await prisma.team.deleteMany()
  await prisma.user.deleteMany()
})

describe('admin team management', () => {
  it('admin creates a team with a manager', async () => {
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin4@bizlocate.com.my', passwordHash: 'x', role: 'ADMIN' } })
    const manager = await prisma.user.create({ data: { name: 'Mgr', email: 'mgr@bizlocate.com.my', passwordHash: 'x', role: 'MANAGER' } })
    currentUser = admin
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'North', managerId: manager.id }) })
    const res = await createTeam(req)
    expect(res.status).toBe(201)
    const { team } = await res.json()
    expect(team.managerId).toBe(manager.id)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Implement**

`src/app/api/admin/teams/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'

export async function GET() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const teams = await prisma.team.findMany({ include: { members: true, manager: true } })
  return NextResponse.json({ teams })
}

export async function POST(req: Request) {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, managerId } = await req.json()
  const team = await prisma.team.create({ data: { name, managerId } })
  return NextResponse.json({ team }, { status: 201 })
}
```

`src/app/api/admin/teams/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, managerId } = await req.json()
  const team = await prisma.team.update({ where: { id: params.id }, data: { name, managerId } })
  return NextResponse.json({ team })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin team CRUD API"
```

---

### Task 19: Customer oversight — admin reassign/delete + pipeline stage config

**Files:**
- Modify: `src/app/api/customers/[id]/route.ts`
- Create: `src/app/api/admin/stages/route.ts`
- Create: `src/app/api/admin/stages/[id]/route.ts`
- Test: `tests/api/admin-oversight.test.ts`

**Interfaces:**
- Consumes: `requireUser`
- Produces: `DELETE /api/customers/:id` (admin-only), extends existing `PATCH /api/customers/:id` to allow admins to set `assignedToId` (bypassing scope check for admins only — non-admins still scope-checked as in Task 11), `GET/POST /api/admin/stages`, `PATCH /api/admin/stages/:id` (name/order), `DELETE /api/admin/stages/:id`.

- [ ] **Step 1: Write failing test**

`tests/api/admin-oversight.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { DELETE as deleteCustomer } from '../../src/app/api/customers/[id]/route'
import { POST as createStage } from '../../src/app/api/admin/stages/route'

beforeEach(async () => {
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.pipelineStage.deleteMany()
})

describe('admin oversight', () => {
  it('admin deletes any customer', async () => {
    const stage = await prisma.pipelineStage.create({ data: { name: 'New', order: 0 } })
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin5@bizlocate.com.my', passwordHash: 'x', role: 'ADMIN' } })
    const s1 = await prisma.user.create({ data: { name: 'S1', email: 's1h@bizlocate.com.my', passwordHash: 'x', role: 'SALESPERSON' } })
    const customer = await prisma.customer.create({ data: { name: 'Acme', assignedToId: s1.id, stageId: stage.id, createdById: s1.id } })
    currentUser = admin
    const res = await deleteCustomer(new Request('http://localhost'), { params: { id: customer.id } })
    expect(res.status).toBe(200)
    expect(await prisma.customer.findUnique({ where: { id: customer.id } })).toBeNull()
  })

  it('admin creates a pipeline stage', async () => {
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin6@bizlocate.com.my', passwordHash: 'x', role: 'ADMIN' } })
    currentUser = admin
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ name: 'Negotiation', order: 2 }) })
    const res = await createStage(req)
    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Add DELETE + admin-aware PATCH to customer detail route**

Append to `src/app/api/customers/[id]/route.ts`, and adjust the existing `PATCH` to branch on role:
```ts
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await prisma.customer.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
```

Update the `PATCH` handler body to also accept `assignedToId`, and skip the scope check when the caller is an admin:
```ts
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  const existing =
    user.role === 'ADMIN'
      ? await prisma.customer.findUnique({ where: { id: params.id } })
      : await prisma.customer.findFirst({ where: { id: params.id, ...customerScopeWhere(user) } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { stageId, assignedToId } = await req.json()
  const customer = await prisma.customer.update({
    where: { id: params.id },
    data: { ...(stageId && { stageId }), ...(user.role === 'ADMIN' && assignedToId && { assignedToId }) },
  })
  return NextResponse.json({ customer })
}
```

- [ ] **Step 4: Implement pipeline stage config routes**

`src/app/api/admin/stages/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'

export async function GET() {
  const stages = await prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json({ stages })
}

export async function POST(req: Request) {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, order } = await req.json()
  const stage = await prisma.pipelineStage.create({ data: { name, order } })
  return NextResponse.json({ stage }, { status: 201 })
}
```

`src/app/api/admin/stages/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, order } = await req.json()
  const stage = await prisma.pipelineStage.update({ where: { id: params.id }, data: { name, order } })
  return NextResponse.json({ stage })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser()
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await prisma.pipelineStage.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add admin customer oversight and pipeline stage config API"
```

---

### Task 20: Admin UI pages

**Files:**
- Create: `src/app/(dashboard)/admin/users/page.tsx`
- Create: `src/app/(dashboard)/admin/teams/page.tsx`
- Create: `src/app/(dashboard)/admin/stages/page.tsx`

**Interfaces:**
- Consumes: Tasks 17-19 admin API routes

- [ ] **Step 1: Build users admin page**

`src/app/(dashboard)/admin/users/page.tsx`:
```tsx
import { requireUser } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'

export default async function AdminUsersPage() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') redirect('/customers')
  const users = await prisma.user.findMany({ include: { team: true }, orderBy: { createdAt: 'desc' } })

  return (
    <div>
      <h1>Users</h1>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Status</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.team?.name ?? '-'}</td><td>{u.status}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Build teams admin page**

`src/app/(dashboard)/admin/teams/page.tsx`:
```tsx
import { requireUser } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'

export default async function AdminTeamsPage() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') redirect('/customers')
  const teams = await prisma.team.findMany({ include: { manager: true, members: true } })

  return (
    <div>
      <h1>Teams</h1>
      <ul>
        {teams.map((t) => (
          <li key={t.id}>{t.name} — manager: {t.manager?.name ?? 'none'} — {t.members.length} members</li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Build pipeline stages admin page**

`src/app/(dashboard)/admin/stages/page.tsx`:
```tsx
import { requireUser } from '@/lib/current-user'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'

export default async function AdminStagesPage() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') redirect('/customers')
  const stages = await prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } })

  return (
    <div>
      <h1>Pipeline Stages</h1>
      <ol>{stages.map((s) => <li key={s.id}>{s.name}</li>)}</ol>
    </div>
  )
}
```

- [ ] **Step 4: Manual browser verification**

Log in as admin, visit `/admin/users`, `/admin/teams`, `/admin/stages` — confirm data renders. Log in as a salesperson, visit the same URLs — confirm redirect to `/customers`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin console pages for users, teams, stages"
```

---

## Phase 5: Settings

### Task 21: Personal profile API + page

**Files:**
- Create: `src/app/api/settings/profile/route.ts`
- Create: `src/app/(dashboard)/settings/page.tsx`
- Test: `tests/api/settings.test.ts`

**Interfaces:**
- Consumes: `requireUser` (Task 5), `hashPassword`/`verifyPassword` (Task 3)
- Produces: `PATCH /api/settings/profile` (body `{ name?, currentPassword?, newPassword? }` — password change requires `currentPassword` to match).

- [ ] **Step 1: Write failing test**

`tests/api/settings.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../src/lib/db'
import { hashPassword, verifyPassword } from '../../src/lib/auth'

let currentUser: any
vi.mock('../../src/lib/current-user', () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}))

import { PATCH as patchProfile } from '../../src/app/api/settings/profile/route'

beforeEach(async () => {
  await prisma.user.deleteMany()
})

describe('PATCH /api/settings/profile', () => {
  it('updates name without touching password', async () => {
    const user = await prisma.user.create({ data: { name: 'Old', email: 'p1@bizlocate.com.my', passwordHash: await hashPassword('orig123'), role: 'SALESPERSON' } })
    currentUser = user
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: 'New Name' }) })
    const res = await patchProfile(req)
    expect(res.status).toBe(200)
    const updated = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updated?.name).toBe('New Name')
    expect(await verifyPassword('orig123', updated!.passwordHash)).toBe(true)
  })

  it('rejects password change with wrong current password', async () => {
    const user = await prisma.user.create({ data: { name: 'P', email: 'p2@bizlocate.com.my', passwordHash: await hashPassword('orig123'), role: 'SALESPERSON' } })
    currentUser = user
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'newpass123' }) })
    const res = await patchProfile(req)
    expect(res.status).toBe(400)
  })

  it('changes password with correct current password', async () => {
    const user = await prisma.user.create({ data: { name: 'P', email: 'p3@bizlocate.com.my', passwordHash: await hashPassword('orig123'), role: 'SALESPERSON' } })
    currentUser = user
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ currentPassword: 'orig123', newPassword: 'newpass123' }) })
    const res = await patchProfile(req)
    expect(res.status).toBe(200)
    const updated = await prisma.user.findUnique({ where: { id: user.id } })
    expect(await verifyPassword('newpass123', updated!.passwordHash)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Implement**

`src/app/api/settings/profile/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/current-user'
import { hashPassword, verifyPassword } from '@/lib/auth'

export async function PATCH(req: Request) {
  const user = await requireUser()
  const { name, currentPassword, newPassword } = await req.json()

  const data: { name?: string; passwordHash?: string } = {}
  if (name) data.name = name

  if (newPassword) {
    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 })
    }
    data.passwordHash = await hashPassword(newPassword)
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data })
  return NextResponse.json({ user: { id: updated.id, name: updated.name, email: updated.email } })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Build settings page**

`src/app/(dashboard)/settings/page.tsx`:
```tsx
'use client'
import { useState } from 'react'

export default function SettingsPage() {
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: name || undefined, currentPassword: currentPassword || undefined, newPassword: newPassword || undefined }),
    })
    setMessage(res.ok ? 'Saved' : 'Update failed — check current password')
  }

  return (
    <form onSubmit={submit}>
      <h1>Settings</h1>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
      <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
      {message && <p>{message}</p>}
      <button type="submit">Save</button>
    </form>
  )
}
```

- [ ] **Step 6: Manual browser verification**

Log in, visit `/settings`, change display name only — confirm it updates and password still works for next login. Then change password, log out, log back in with the new password.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add personal profile settings"
```

---

## Final Verification (after all 5 phases)

- [ ] Run full suite: `npm test` — all tests pass
- [ ] Manual end-to-end walkthrough in browser:
  1. Log in as seeded admin (`admin@bizlocate.com.my`)
  2. Create a team, create a manager and a salesperson user (Admin console), assign salesperson to the team
  3. As admin, create a customer assigned to the salesperson — confirm notification fires live for that salesperson (separate session)
  4. As salesperson, log an activity and a task on the customer, change its stage
  5. As manager (same team), confirm the customer is visible; as a different salesperson, confirm it is NOT visible
  6. As admin, reassign the customer to a different salesperson, and delete a different test customer
  7. Each role updates their own profile name/password in Settings
