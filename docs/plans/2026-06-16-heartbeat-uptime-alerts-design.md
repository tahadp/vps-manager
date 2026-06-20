# Design Document: Dynamic Heartbeat, Uptime & Alerts UI Refactoring

## 1. Goal Description
Provide custom settings for default VPS offline and online (recovery) notifications, including heartbeat timeout duration, message templates, and Telegram alerts. Introduce a new system-wide `UPTIME` metric to monitor server uptime and trigger alert rules. Overhaul the Alerts page UI to be clean, modern, and editable.

---

## 2. Database Schema Changes (`prisma/schema.prisma`)
Add configuration options to the `VpsSettings` model to personalize heartbeat timeouts and offline/online notification templates.

```prisma
model VpsSettings {
  id                    String   @id @default(uuid())
  vpsId                 String   @unique
  screenshotIntervalSec Int      @default(30)
  telemetryIntervalSec  Int      @default(1)
  ramDiskVisible        Boolean  @default(true)
  networkVisible        Boolean  @default(true)
  telegramEnabled       Boolean  @default(true)
  customAlertMessage    String?
  visibleCharts         String?  @default("[\"cpu\",\"ram\",\"disk\",\"network\"]")
  
  // New Fields
  offlineTimeoutSec     Int      @default(60)     // Heartbeat timeout in seconds
  offlineAlertEnabled   Boolean  @default(true)   // Toggle default offline alerts
  onlineAlertEnabled    Boolean  @default(true)   // Toggle default recovery alerts
  customOfflineMessage  String?                   // Customizable template for offline alerts
  customOnlineMessage   String?                   // Customizable template for recovery alerts
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  vps Vps @relation(fields: [vpsId], references: [id], onDelete: Cascade)
}
```

---

## 3. Protocol Buffer updates (`proto/vps.proto`)
Add `uptime` to the `TelemetryRequest` message structure. Uptime represents system uptime in seconds.

```proto
message TelemetryRequest {
  string vps_id = 1;
  float cpu_usage = 2;
  float ram_usage = 3;
  float ram_total = 4;
  float disk_usage = 5;
  float net_tx = 6;
  float net_rx = 7;
  int64 timestamp = 8;
  float disk_total = 9;
  int64 uptime = 10; // New field
}
```

---

## 4. Logical Flow & Code Updates

### A. Go Agent Telemetry Generation
- File: `agent/telemetry/monitor.go`
  - Import `github.com/shirou/gopsutil/v3/host`.
  - Collect system uptime using `host.Info()`:
    ```go
    hInfo, err := host.Info()
    if err == nil {
        m.Uptime = hInfo.Uptime
    }
    ```
- File: `agent/daemon.go`
  - Assign `Uptime` value when building and sending the `pb.TelemetryRequest`.

### B. Server Telemetry Processing
- File: `server/src/grpcServer.ts`
  - Read `request.uptime` in `StreamTelemetry` and include it in the Redis telemetry publish.
  - Parse as `Uptime: Number(request.uptime || 0)`.

### C. Alerting Engine & Offline Checking
- File: `server/src/alerting.ts`
  - **Dynamic Offline Loop**: Change the fixed `60000ms` check to fetch all `ONLINE` VPS with their settings and verify if `lastHeartbeat` is older than `offlineTimeoutSec` seconds.
  - **Uptime Metric Rule Evaluation**: Add a case for `rule.metric === 'UPTIME'` in `initAlertingEngine`. Convert `data.Uptime` from seconds to minutes and compare it with the rule's threshold in minutes:
    ```typescript
    else if (rule.metric === 'UPTIME') metricValue = (data.Uptime || 0) / 60;
    ```
  - **Centralized Recovery**: Remove recovery check from the periodic 30s cron. Instead, define a helper `handleVpsRecovery(vpsId, now, agentIp)` that gets called when a heartbeat or agent stream registration occurs. If the VPS transitions from `OFFLINE` to `ONLINE`, trigger recovery notifications using `customOnlineMessage` if enabled.

### D. Server Validation Schema Updates
- File: `server/src/routes/vps.ts`
  - Expand `vpsSettingsSchema` to allow new fields: `offlineTimeoutSec`, `offlineAlertEnabled`, `onlineAlertEnabled`, `customOfflineMessage`, `customOnlineMessage`.
- File: `server/src/middlewares/validation.ts`
  - Add `UPTIME` to `createRule`'s enum validator: `z.enum(['CPU', 'RAM', 'DISK', 'OFFLINE', 'UPTIME'])`.

---

## 5. UI/UX Changes

### A. VPS Details Uptime Display
- File: `client/src/app/vps/[id]/page.tsx`
  - Show Uptime under **System Info**.
  - Format live uptime as `X gün Y saat Z dakika W saniye`.
  - Implement a client-side ticking mechanism so the display updates smoothly every second.

### B. VPS Settings Redesign
- File: `client/src/app/vps/[id]/settings/page.tsx`
  - Include switches, number inputs, and textareas for:
    - Default Offline Alert (Toggle)
    - Default Online Alert (Toggle)
    - Heartbeat Timeout (Seconds)
    - Custom Offline Message (Textarea)
    - Custom Online Message (Textarea)

### C. Alerts Management Redesign & Edit Feature
- File: `client/src/app/alerts/page.tsx` & `client/src/app/vps/[id]/alerts/page.tsx`
  - Redesign rules listing using a clean, modern grid/list card layout.
  - Add an **Edit** button to each alert rule.
  - When clicked, populate the rule form with the selected rule's parameters (switching the save handler to use `PUT /api/rules/:id`).
  - Support `Uptime (Dakika)` in the metrics selection.
