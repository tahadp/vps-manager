# Multi-User UI & Architecture Design

## 1. Overview
The current interface is too plain and lacks proper multi-user data isolation. This design document outlines a modern, Bento/Grid-based UI using dark mode and glassmorphism, alongside a secure multi-user architecture where users only see their assigned VPS instances, while admins have full visibility and user management capabilities.

## 2. Architecture & Data Flow

### 2.1 Database Changes (PostgreSQL / Prisma)
- **VPS Model:** Must include an `ownerId` (relation to `User` model) to map which server belongs to which user.
- **Role-Based Access Control (RBAC):**
  - `ADMIN`: Full access to all VPS instances and the "User Management" dashboard.
  - `USER`: Access only to VPS instances where `ownerId == user.id`.

### 2.2 Backend Changes (Node.js/Express)
- API endpoints must enforce ownership.
- e.g., `GET /api/vps` will return all servers if the requester is an `ADMIN`, but only `user.vps` if the requester is a `USER`.
- WebSocket/gRPC streams distributing telemetry data must filter streams so a user only receives metrics/screenshots for their own servers.

## 3. UI/UX Design (Next.js Client)

### 3.1 Design Language
- **Theme:** Deep dark mode (Tailwind `bg-zinc-950`).
- **Aesthetics:** Glassmorphism (blur backgrounds, semi-transparent panels), vibrant accent colors (e.g., Neon Blue or Purple for charts).
- **Layout:** Bento Box / Grid layout for high-density information display.

### 3.2 Layout Structure
- **Sidebar (Collapsible):**
  - Navigation links: Dashboard (Servers), Profile, Settings.
  - (Admin Only): User Management, Global Audit Logs.
- **Top Bar:**
  - Breadcrumbs, Global Search, User Profile Dropdown, Theme Toggle.
- **Main Dashboard View:**
  - **Bento Grid Cards:** Each card represents a VPS.
  - **Card Content:** Server Name, Status Badge (Online/Offline), Thumbnail (Lazy Loaded Screenshot), Mini-Sparkline Charts for CPU/RAM, Quick Actions (Terminal, Power).

### 3.3 Interactions
- Clicking a VPS card opens a detailed view (or sliding drawer) with full Web PTY (xterm.js), large charts, and full-screen remote view (Rustdesk web integration).

## 4. Verification & Testing
- Login as Admin -> Ensure all servers and User Management are visible.
- Login as regular User -> Ensure only owned servers are visible.
- Attempt to access another user's server via API -> Ensure 403 Forbidden is returned.
