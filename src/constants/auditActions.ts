// src/constants/auditActions.ts
/**
 * Audit action constants for tracking user activities
 * Used by auditLogService to record system events
 */

export const AuditActions = {
  // Document actions
  DOCUMENTS_LIST_VIEWED: 'DOCUMENTS_LIST_VIEWED',
  DOCUMENT_URL_CREATED: 'DOCUMENT_URL_CREATED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
  
  // Tax Calendar actions
  TAX_CALENDAR_VIEWED: 'TAX_CALENDAR_VIEWED',
  TAX_CALENDAR_SUMMARY_VIEWED: 'TAX_CALENDAR_SUMMARY_VIEWED',
  TAX_CALENDAR_UPCOMING_VIEWED: 'TAX_CALENDAR_UPCOMING_VIEWED',
  
  // Admin actions
  CLIENT_CREATED: 'CLIENT_CREATED',
  USER_INVITED: 'USER_INVITED',
  COMPANY_UPSERTED: 'COMPANY_UPSERTED',
} as const;

export type AuditAction = typeof AuditActions[keyof typeof AuditActions];
