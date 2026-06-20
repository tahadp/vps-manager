# Layout, Notification, Dashboard Screenshot & IP Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement closeable notifications, fix profile avatar clickability, remove the duplicate logout button, pre-load cached dashboard screenshots, and record + display VPS IP address log history.

**Architecture:** We will fix the z-index stacking context of the Topbar, remove redundant buttons, update the server's VPS list API to fetch cached screenshots from Redis, detect IP address changes during agent communication, write those changes to the AuditLog table as IP_CHANGED events, and display them in a dedicated card on the VPS overview page.

**Tech Stack:** Next.js, React, Tailwind CSS, TypeScript, Express, Prisma, Redis, PostgreSQL.

---

### Task 1: Fix Topbar Z-Index & Sidebar Redundant Logout Button
**Files:**
- Modify: [Topbar.tsx](file:///c:/Users/Taha/Documents/VpsYonetim/client/src/components/layout/Topbar.tsx#L12)
- Modify: [Sidebar.tsx](file:///c:/Users/Taha/Documents/VpsYonetim/client/src/components/layout/Sidebar.tsx#L103-L115)

**Instructions:**
1. In `client/src/components/layout/Topbar.tsx`, update class `z-10` to `z-30` inside the `<header>` element.
2. In `client/src/components/layout/Sidebar.tsx`, delete the bottom `mt-auto` container containing the duplicate `Logout` button.

---

### Task 2: Closeable and Repositioned Toast Notifications
**Files:**
- Modify: [page.tsx](file:///c:/Users/Taha/Documents/VpsYonetim/client/src/app/page.tsx)
- Modify: [page.tsx](file:///c:/Users/Taha/Documents/VpsYonetim/client/src/app/vps/page.tsx)
- Modify: [page.tsx](file:///c:/Users/Taha/Documents/VpsYonetim/client/src/app/vps/[id]/page.tsx)

**Instructions:**
1. Import `X` from `'lucide-react'` in `client/src/app/page.tsx` and `client/src/app/vps/page.tsx`.
2. Locate the toast/alert components rendered inside the return blocks.
3. Update the toast container styling from `fixed top-4 right-4` to `fixed top-20 right-4 z-50`.
4. Wrap toast content in a flexbox with a close button:
   ```tsx
   {toast && (
     <div className={`fixed top-20 right-4 z-50 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border max-w-sm backdrop-blur-md animate-fade-in ${toast.type === 'success' ? 'bg-status-success/15 border-status-success/30 text-status-success' : 'bg-status-error/15 border-status-error/30 text-status-error'}`}>
       <span>{toast.message}</span>
       <button onClick={() => setToast(null)} className="p-0.5 hover:bg-white/10 rounded transition-colors" aria-label="Close notification">
         <X className="w-4 h-4" />
       </button>
     </div>
   )}
   ```
5. Apply the equivalent design for `cmdResult` in `client/src/app/vps/[id]/page.tsx`.

---

### Task 3: Server-side Screenshot Loading in VPS List
**Files:**
- Modify: [vps.ts](file:///c:/Users/Taha/Documents/VpsYonetim/server/src/routes/vps.ts)
- Modify: [page.tsx](file:///c:/Users/Taha/Documents/VpsYonetim/client/src/app/page.tsx)

**Instructions:**
1. In `server/src/routes/vps.ts`'s `vpsRouter.get('/')` handler:
   - Map over the `vpsList` result.
   - For each VPS, fetch its latest screenshot base64 string from Redis using `await redisCache.hget('vps_latest_screenshots', vps.id)`.
   - Append `latestScreenshot` to the response payload.
2. In `client/src/app/page.tsx`'s `fetchVpsList` function:
   - Iterate over the fetched list and populate the initial `screenshots` state for any VPS that contains `latestScreenshot`.

---

### Task 4: IP Address Change Detection & Logging
**Files:**
- Modify: [audit.ts](file:///c:/Users/Taha/Documents/VpsYonetim/server/src/middlewares/audit.ts)
- Modify: [grpcServer.ts](file:///c:/Users/Taha/Documents/VpsYonetim/server/src/grpcServer.ts)
- Modify: [alerting.ts](file:///c:/Users/Taha/Documents/VpsYonetim/server/src/alerting.ts)
- Modify: [vps.ts](file:///c:/Users/Taha/Documents/VpsYonetim/server/src/routes/vps.ts)

**Instructions:**
1. In `server/src/middlewares/audit.ts`, export the new helper:
   ```typescript
   export async function logIpChangeIfChanged(vpsId: string, newIp: string): Promise<void> {
     try {
       const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
       if (!vps) return;
       const oldIp = vps.ipAddress;
       if (oldIp !== newIp && newIp && newIp !== 'Unknown' && newIp !== 'Pending') {
         logger.info({ vpsId, oldIp, newIp }, 'VPS IP address changed');
         await logAudit({
           userId: vps.userId,
           action: 'IP_CHANGED',
           target: vpsId,
           details: `Changed from ${oldIp} to ${newIp}`
         });
       }
     } catch (err) {
       logger.error({ err, vpsId }, 'Failed to log IP change');
     }
   }
   ```
2. Import and call `logIpChangeIfChanged` before the database updates `ipAddress` in `grpcServer.ts`, `alerting.ts`, and `vps.ts` (properties update).

---

### Task 5: IP History UI Card on VPS Details
**Files:**
- Modify: [page.tsx](file:///c:/Users/Taha/Documents/VpsYonetim/client/src/app/vps/[id]/page.tsx)

**Instructions:**
1. Add state `ipLogs` initialized to empty array.
2. Fetch `IP_CHANGED` audit logs using `api` inside a `useEffect` hooked to the `overview` tab.
3. Render an "IP History" card in the Grid layout next to the system info card.

---

## Verification Plan

### Automated Tests
- Run `npm test` inside the client and server directories to ensure they build and have no compilation or testing errors.

### Manual Verification
- Log in and verify that the Topbar dropdown is clickable and doesn't get covered by content.
- Refresh a VPS, check that the toast notification appears at `top-20` and can be manually dismissed with the `X` button.
- Check the dashboard; ensure it displays cached screenshots immediately on page load.
- Edit/register a VPS with a new IP and confirm that the "IP History" list on the VPS overview page logs and shows the IP transition correctly.
