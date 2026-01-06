# TICKET 11: Detailed Changes and Diffs

## Summary of Changes

### Files Created (2)
1. `src/services/provisioningService.ts` - New provisioning service
2. `TICKET_11_IMPLEMENTATION_SUMMARY.md` - Implementation documentation
3. `manual-test-provisioning.sh` - Test script

### Files Modified (1)
1. `src/modules/admin/admin.routes.ts` - Integration with client creation

---

## 1. NEW FILE: `src/services/provisioningService.ts`

**Purpose:** Service to provision default template data for new clients

**Full Implementation:** 380 lines

**Key Functions:**
- `getDefaultTaxCalendarTemplates(clientId)` - Returns 6 tax calendar entries
- `getDefaultRiskMatrixTemplates(clientId)` - Returns 4 risk matrix entries
- `getDefaultRiskControlTemplates(clientId)` - Returns 4 risk control rows
- `getDefaultTaxFunctionTemplates(clientId)` - Returns 5 tax function rows
- `provisionDefaultTemplates(supabase, clientId)` - Main provisioning function

**Template Details:**

### Tax Calendar Templates (6 entries)
```typescript
// Q1-Q4 VAT returns for current year
{ jurisdiction: 'NL', tax_type: 'Dutch VAT', period_label: '2025-Q1', deadline: '2025-04-30' }
{ jurisdiction: 'NL', tax_type: 'Dutch VAT', period_label: '2025-Q2', deadline: '2025-07-31' }
{ jurisdiction: 'NL', tax_type: 'Dutch VAT', period_label: '2025-Q3', deadline: '2025-10-31' }
{ jurisdiction: 'NL', tax_type: 'Dutch VAT', period_label: '2025-Q4', deadline: '2026-01-31' }

// Annual CIT return
{ jurisdiction: 'NL', tax_type: 'Dutch CIT', period_label: '2025', deadline: '2026-05-31' }

// Monthly payroll tax
{ jurisdiction: 'NL', tax_type: 'Dutch Payroll Tax', period_label: '2025-Jan', deadline: '2025-02-28' }
```

### Risk Matrix Templates (4 entries)
```typescript
{ risk_code: 'VAT-001', likelihood: 3, impact: 4, score: 12, score_color: 'orange' }
{ risk_code: 'CIT-001', likelihood: 2, impact: 5, score: 10, score_color: 'orange' }
{ risk_code: 'TP-001', likelihood: 4, impact: 5, score: 20, score_color: 'red' }
{ risk_code: 'WHT-001', likelihood: 2, impact: 3, score: 6, score_color: 'green' }
```

### Risk Control Templates (4 rows)
```typescript
{
  risk_code: 'VAT-001',
  risk_description: 'Incorrect VAT treatment on cross-border transactions',
  control_description: 'Monthly review of all cross-border invoices by tax specialist',
  monitoring_frequency: 'Monthly',
  monitoring_months: [1,2,3,4,5,6,7,8,9,10,11,12]
}
// ... 3 more similar entries
```

### Tax Function Templates (5 rows)
```typescript
{ process_name: 'VAT Compliance', frequency: 'Monthly', order_index: 1 }
{ process_name: 'Corporate Income Tax', frequency: 'Yearly', order_index: 2 }
{ process_name: 'Transfer Pricing', frequency: 'Yearly', order_index: 3 }
{ process_name: 'Payroll Tax', frequency: 'Monthly', order_index: 4 }
{ process_name: 'Tax Risk Management', frequency: 'Quarterly', order_index: 5 }
```

---

## 2. MODIFIED FILE: `src/modules/admin/admin.routes.ts`

### Change 1: Import Statement (Line 12)

**Before:**
```typescript
import { invitationService } from '../../services/invitationService';
import { auditLogService } from '../../services/auditLogService';
import { AuditActions } from '../../constants/auditActions';
```

**After:**
```typescript
import { invitationService } from '../../services/invitationService';
import { auditLogService } from '../../services/auditLogService';
import { provisioningService } from '../../services/provisioningService';
import { AuditActions } from '../../constants/auditActions';
```

---

### Change 2: Provisioning Logic (Lines 303-333)

**Before:**
```typescript
    // 3) Default TCF şablonlarını kopyala (şimdilik stub)
    // TODO: provisionDefaultTcfTemplates(clientId)
    // Şu an DB tarafında TCF tabloları hazır olduğunda buraya servis eklenecek.

    // 4) Audit log (non-blocking)
```

**After:**
```typescript
    // 3) Provision default templates for the new client
    let provisioningResult;
    try {
      provisioningResult = await provisioningService.provisionDefaultTemplates(
        supabase,
        clientId
      );
      logger.info('Default templates provisioned for new client', {
        clientId,
        provisioningResult,
      });
    } catch (provisioningError: any) {
      // Rollback: delete the client and any created user/invitation
      logger.error('Provisioning failed, rolling back client creation', {
        clientId,
        error: provisioningError.message,
      });

      if (createdInvitation) {
        await supabase.from('invitations').delete().eq('id', createdInvitation.id);
      }
      if (createdUser) {
        await supabase.from('app_users').delete().eq('id', createdUser.id);
      }
      await supabase.from('clients').delete().eq('id', clientId);

      throw new AppError(
        `Client oluşturuldu ancak şablon verileri yüklenemedi. İşlem geri alındı: ${provisioningError.message}`,
        500
      );
    }

    // 4) Audit log (non-blocking)
```

**Key Changes:**
- Replaced TODO stub with actual provisioning service call
- Added try-catch block for error handling
- Implemented complete rollback logic on failure
- Added detailed logging

---

### Change 3: Audit Log Metadata (Lines 343-354)

**Before:**
```typescript
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.CLIENT_CREATED,
      entity_type: 'client',
      entity_id: clientId,
      metadata: {
        client_name: client.name,
        client_slug: client.slug,
        first_user_invited: !!createdUser,
        first_user_email: createdUser?.email,
      },
    });
```

**After:**
```typescript
    auditLogService.logAsync({
      client_id: clientId,
      actor_user_id: req.user?.sub,
      actor_role: req.user?.role,
      action: AuditActions.CLIENT_CREATED,
      entity_type: 'client',
      entity_id: clientId,
      metadata: {
        client_name: client.name,
        client_slug: client.slug,
        first_user_invited: !!createdUser,
        first_user_email: createdUser?.email,
        provisioning: {
          tax_calendar_count: provisioningResult.taxCalendarCount,
          risk_matrix_count: provisioningResult.riskMatrixCount,
          risk_control_count: provisioningResult.riskControlCount,
          tax_function_count: provisioningResult.taxFunctionCount,
        },
      },
    });
```

**Key Changes:**
- Added `provisioning` object to metadata
- Includes counts for all four provisioned modules

---

### Change 4: Response Body (Lines 357-375)

**Before:**
```typescript
    return res.status(201).json({
      data: {
        client: client as DbClient,
        firstUser: createdUser,
        invitation: createdInvitation,
      },
      meta: {
        message: createdUser 
          ? 'Client oluşturuldu ve ilk kullanıcıya davetiye emaili gönderildi.'
          : 'Client oluşturuldu.',
        timestamp: new Date().toISOString(),
      },
    });
```

**After:**
```typescript
    return res.status(201).json({
      data: {
        client: client as DbClient,
        firstUser: createdUser,
        invitation: createdInvitation,
        provisioning: {
          tax_calendar_count: provisioningResult.taxCalendarCount,
          risk_matrix_count: provisioningResult.riskMatrixCount,
          risk_control_count: provisioningResult.riskControlCount,
          tax_function_count: provisioningResult.taxFunctionCount,
        },
      },
      meta: {
        message: createdUser 
          ? 'Client oluşturuldu, şablon verileri yüklendi ve ilk kullanıcıya davetiye emaili gönderildi.'
          : 'Client oluşturuldu ve şablon verileri yüklendi.',
        timestamp: new Date().toISOString(),
      },
    });
```

**Key Changes:**
- Added `provisioning` object to response data
- Updated success messages to mention template provisioning
- Maintains backward compatibility (existing fields unchanged)

---

## 3. NEW FILE: `manual-test-provisioning.sh`

**Purpose:** Automated test script for provisioning functionality

**Features:**
- Creates a test client with unique timestamp
- Verifies provisioning counts in response
- Creates a test user for the client
- Provides manual verification steps
- Includes cleanup instructions

**Usage:**
```bash
ADMIN_TOKEN=your-admin-jwt ./manual-test-provisioning.sh
```

---

## Complete Flow Diagram

```
POST /api/admin/clients
  │
  ├─► 1. Create client record in DB
  │     └─► Success: clientId
  │
  ├─► 2. (Optional) Invite first user
  │     ├─► Success: createdUser, createdInvitation
  │     └─► Failure: Rollback client, throw error
  │
  ├─► 3. Provision default templates ← NEW
  │     ├─► Insert 6 tax calendar entries
  │     ├─► Insert 4 risk matrix entries
  │     ├─► Insert 4 risk control rows
  │     ├─► Insert 5 tax function rows
  │     ├─► Success: provisioningResult with counts
  │     └─► Failure: Rollback ALL (invitation, user, client), throw error
  │
  ├─► 4. Log audit event (non-blocking)
  │     └─► Include provisioning counts in metadata
  │
  └─► 5. Return 201 response
        └─► Include provisioning details in data
```

---

## Error Handling

### Provisioning Failure Scenario

**What happens:**
1. Client is created successfully
2. (Optional) User is invited successfully
3. Provisioning fails (e.g., DB error, constraint violation)

**Rollback sequence:**
```typescript
// 1. Delete invitation (if created)
await supabase.from('invitations').delete().eq('id', createdInvitation.id);

// 2. Delete user (if created)
await supabase.from('app_users').delete().eq('id', createdUser.id);

// 3. Delete client
await supabase.from('clients').delete().eq('id', clientId);

// 4. Throw descriptive error
throw new AppError('Client oluşturuldu ancak şablon verileri yüklenemedi. İşlem geri alındı', 500);
```

**Result:** Clean state, no orphaned records

---

## Testing Checklist

- [ ] Create client without first user - verify provisioning
- [ ] Create client with first user - verify provisioning
- [ ] Verify tax calendar has 6 entries
- [ ] Verify risk matrix has 4 entries
- [ ] Verify risk controls has 4 rows
- [ ] Verify tax function has 5 rows
- [ ] Verify audit log includes provisioning metadata
- [ ] Test rollback by simulating provisioning failure
- [ ] Verify no orphaned records after rollback

---

## Database Impact

**Tables Modified (Inserts Only):**
- `tax_return_calendar_entries` - 6 rows per client
- `tax_risk_matrix_entries` - 4 rows per client
- `risk_control_rows` - 4 rows per client
- `tax_function_rows` - 5 rows per client

**Total:** 19 rows inserted per new client

**No Schema Changes Required** - Uses existing tables and columns
