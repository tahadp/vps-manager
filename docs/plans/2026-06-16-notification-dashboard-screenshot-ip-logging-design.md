# Design Document: Notification, Dashboard Screenshot & IP Logging Upgrades

This design details the visual adjustments to notifications, resolving the profile menu click issues, pre-loading cached screenshots for the dashboard, removing the duplicate logout button, and introducing the VPS IP address log history section.

## 1. Notification Toast Adjustments
- **Current Position**: Toast notifications are fixed at `top-4 right-4 z-50`, overlapping with the header/topbar which sits at `top-0 h-16 z-10`.
- **Change**: Change toast positioning to `top-20 right-4 z-50` (or `bottom-4 right-4 z-50`). We will use `top-20 right-4 z-50` to stay visible near the top but safely below the top bar.
- **Manual Dismissal**: Add a close button (cross 'x') on the right side of the toast notifications across:
  - `client/src/app/page.tsx`
  - `client/src/app/vps/page.tsx`
  - `client/src/app/vps/[id]/page.tsx`
- **Design Layout**: Use a flex layout to align the message and the close button horizontally.

## 2. Sidebar Logout Button Removal
- **Change**: Delete the bottom `mt-auto` logout button from `client/src/components/layout/Sidebar.tsx` as it is redundant (also present in the top-right UserMenu).

## 3. Profile Avatar Stacking Context Resolution
- **Issue**: The UserMenu button is sometimes unclickable because the Topbar container has `z-10`, while page body elements (like dashboard card drag-handles) have `z-20`. When scrolling, page content stacks over the Topbar.
- **Change**: Change Topbar container z-index in `client/src/components/layout/Topbar.tsx` to `z-30` so it always stays above page contents.

## 4. Pre-loading Cached Screenshots on Dashboard
- **Issue**: The dashboard shows "No display signal" for all servers until a new websocket-triggered screenshot update is received.
- **Change**:
  - Update `server/src/routes/vps.ts`'s `vpsRouter.get('/')` endpoint to retrieve the latest screenshot for each VPS from the Redis hash `vps_latest_screenshots` and append it as `latestScreenshot` in the response array.
  - Update `client/src/app/page.tsx`'s `fetchVpsList` function to populate the `screenshots` state with the preloaded values:
    ```typescript
    const initialScreenshots: Record<string, string> = {};
    data.forEach((v: any) => {
      if (v.latestScreenshot) initialScreenshots[v.id] = v.latestScreenshot;
    });
    setScreenshots(prev => ({ ...initialScreenshots, ...prev }));
    ```

## 5. VPS IP Address Logging & UI History Section
- **IP Change Detection**:
  - Add `logIpChangeIfChanged(vpsId, newIp)` in `server/src/middlewares/audit.ts` to check if a VPS's IP has changed:
    - Compare `newIp` against the VPS's stored `ipAddress`.
    - If they differ (and `newIp` is valid, i.e., not empty, `'Unknown'`, or `'Pending'`), log an audit event:
      - `action`: `'IP_CHANGED'`
      - `target`: `vpsId`
      - `details`: `IP address changed from ${oldIp} to ${newIp}`
  - Call `logIpChangeIfChanged` in:
    - `server/src/grpcServer.ts` (StreamAgentIO registration)
    - `server/src/alerting.ts` (handleVpsRecovery liveness recovery)
    - `server/src/routes/vps.ts` (Update VPS HTTP endpoint)
- **UI History Section**:
  - In `client/src/app/vps/[id]/page.tsx`'s Overview tab, fetch audit logs filtering for `action: 'IP_CHANGED'`.
  - Render an "IP Address History" card showing a clean list of timestamped changes, highlighting the current and former IPs.
