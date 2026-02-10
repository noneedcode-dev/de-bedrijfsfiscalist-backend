// src/constants/errorCodes.ts
/**
 * Standardized error codes for i18n support
 * Frontend can map these codes to localized messages
 */

export const ErrorCodes = {
  // Authentication & Authorization
  AUTH_MISSING_HEADER: 'AUTH_MISSING_HEADER',
  AUTH_INVALID_FORMAT: 'AUTH_INVALID_FORMAT',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_INVALID_CLAIMS: 'AUTH_INVALID_CLAIMS',
  AUTH_EXPIRED_TOKEN: 'AUTH_EXPIRED_TOKEN',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  AUTH_MISSING_API_KEY: 'AUTH_MISSING_API_KEY',
  AUTH_INVALID_API_KEY: 'AUTH_INVALID_API_KEY',

  // Invitation
  INVITE_EMAIL_EXISTS: 'INVITE_EMAIL_EXISTS',
  INVITE_INVALID_TOKEN: 'INVITE_INVALID_TOKEN',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_ALREADY_ACCEPTED: 'INVITE_ALREADY_ACCEPTED',
  INVITE_CANCELLED: 'INVITE_CANCELLED',
  INVITE_CREATE_FAILED: 'INVITE_CREATE_FAILED',

  // Password Reset
  PASSWORD_RESET_INVALID_OR_EXPIRED_TOKEN: 'PASSWORD_RESET_INVALID_OR_EXPIRED_TOKEN',
  PASSWORD_RESET_WEAK_PASSWORD: 'PASSWORD_RESET_WEAK_PASSWORD',
  PASSWORD_RESET_USER_NOT_FOUND: 'PASSWORD_RESET_USER_NOT_FOUND',
  PASSWORD_RESET_FAILED: 'PASSWORD_RESET_FAILED',

  // Login & Password Change
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_CHANGE_PASSWORD_WEAK: 'AUTH_CHANGE_PASSWORD_WEAK',
  AUTH_CHANGE_PASSWORD_FAILED: 'AUTH_CHANGE_PASSWORD_FAILED',

  // Client Access
  CLIENT_ACCESS_DENIED: 'CLIENT_ACCESS_DENIED',
  CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
  CLIENT_CREATE_FAILED: 'CLIENT_CREATE_FAILED',

  // User Management
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_CREATE_FAILED: 'USER_CREATE_FAILED',
  USER_UPDATE_FAILED: 'USER_UPDATE_FAILED',

  // Company
  COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',
  COMPANY_CREATE_FAILED: 'COMPANY_CREATE_FAILED',
  COMPANY_UPDATE_FAILED: 'COMPANY_UPDATE_FAILED',

  // Documents
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  DOCUMENT_FETCH_FAILED: 'DOCUMENT_FETCH_FAILED',
  DOCUMENT_UPLOAD_FAILED: 'DOCUMENT_UPLOAD_FAILED',

  // Tax Calendar
  TAX_CALENDAR_FETCH_FAILED: 'TAX_CALENDAR_FETCH_FAILED',
  TAX_CALENDAR_CREATE_FAILED: 'TAX_CALENDAR_CREATE_FAILED',
  TAX_CALENDAR_UPDATE_FAILED: 'TAX_CALENDAR_UPDATE_FAILED',

  // Tax Function
  TAX_FUNCTION_FETCH_FAILED: 'TAX_FUNCTION_FETCH_FAILED',
  TAX_FUNCTION_CREATE_FAILED: 'TAX_FUNCTION_CREATE_FAILED',
  TAX_FUNCTION_UPDATE_FAILED: 'TAX_FUNCTION_UPDATE_FAILED',
  TAX_FUNCTION_DELETE_FAILED: 'TAX_FUNCTION_DELETE_FAILED',
  TAX_FUNCTION_ROW_NOT_FOUND: 'TAX_FUNCTION_ROW_NOT_FOUND',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_INVALID_UUID: 'VALIDATION_INVALID_UUID',
  VALIDATION_INVALID_EMAIL: 'VALIDATION_INVALID_EMAIL',
  VALIDATION_INVALID_DATE: 'VALIDATION_INVALID_DATE',
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  RATE_LIMIT_AUTH_EXCEEDED: 'RATE_LIMIT_AUTH_EXCEEDED',
  RATE_LIMIT_INVITE_EXCEEDED: 'RATE_LIMIT_INVITE_EXCEEDED',
  RATE_LIMIT_PASSWORD_RESET_EXCEEDED: 'RATE_LIMIT_PASSWORD_RESET_EXCEEDED',

  // Time Tracking
  TIME_ENTRY_NOT_FOUND: 'TIME_ENTRY_NOT_FOUND',
  TIME_ENTRY_CREATE_FAILED: 'TIME_ENTRY_CREATE_FAILED',
  TIME_ENTRY_UPDATE_FAILED: 'TIME_ENTRY_UPDATE_FAILED',
  TIME_ENTRY_DELETE_FAILED: 'TIME_ENTRY_DELETE_FAILED',
  TIME_TIMER_ALREADY_RUNNING: 'TIME_TIMER_ALREADY_RUNNING',
  TIME_TIMER_NOT_RUNNING: 'TIME_TIMER_NOT_RUNNING',
  TIME_ALLOWANCE_NOT_FOUND: 'TIME_ALLOWANCE_NOT_FOUND',

  // Plans
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  PLAN_CONFIG_UPDATE_FAILED: 'PLAN_CONFIG_UPDATE_FAILED',
  PLAN_ASSIGNMENT_FAILED: 'PLAN_ASSIGNMENT_FAILED',
  PLAN_INVALID_DATE_RANGE: 'PLAN_INVALID_DATE_RANGE',
  PLAN_RETROACTIVE_NOT_ALLOWED: 'PLAN_RETROACTIVE_NOT_ALLOWED',

  // Invoices
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND',
  INVOICE_CREATE_FAILED: 'INVOICE_CREATE_FAILED',
  INVOICE_UPDATE_FAILED: 'INVOICE_UPDATE_FAILED',
  INVOICE_INVALID_STATUS: 'INVOICE_INVALID_STATUS',
  INVOICE_PROOF_UPLOAD_FAILED: 'INVOICE_PROOF_UPLOAD_FAILED',
  INVOICE_ALREADY_REVIEWED: 'INVOICE_ALREADY_REVIEWED',
  INVOICE_NUMBER_GENERATION_FAILED: 'INVOICE_NUMBER_GENERATION_FAILED',

  // Allowance
  ALLOWANCE_NOT_FOUND: 'ALLOWANCE_NOT_FOUND',
  ALLOWANCE_CREATE_FAILED: 'ALLOWANCE_CREATE_FAILED',
  ALLOWANCE_EXCEEDED: 'ALLOWANCE_EXCEEDED',

  // General
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Default English messages for error codes
 * Frontend should override these with localized versions
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Authentication & Authorization
  AUTH_MISSING_HEADER: 'Authorization header is missing',
  AUTH_INVALID_FORMAT: 'Invalid authorization header format',
  AUTH_INVALID_TOKEN: 'Invalid or expired token',
  AUTH_INVALID_CLAIMS: 'Token is missing required claims',
  AUTH_EXPIRED_TOKEN: 'Token has expired',
  AUTH_USER_NOT_FOUND: 'User not found',
  AUTH_INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  AUTH_MISSING_API_KEY: 'API key is required',
  AUTH_INVALID_API_KEY: 'Invalid API key',

  // Invitation
  INVITE_EMAIL_EXISTS: 'This email address is already registered',
  INVITE_INVALID_TOKEN: 'Invalid or not found invitation link',
  INVITE_EXPIRED: 'Invitation has expired',
  INVITE_ALREADY_ACCEPTED: 'This invitation has already been accepted',
  INVITE_CANCELLED: 'This invitation has been cancelled',
  INVITE_CREATE_FAILED: 'Failed to create invitation',

  // Password Reset
  PASSWORD_RESET_INVALID_OR_EXPIRED_TOKEN: 'Invalid or expired password reset token',
  PASSWORD_RESET_WEAK_PASSWORD: 'Password does not meet security requirements',
  PASSWORD_RESET_USER_NOT_FOUND: 'User not found for password reset',
  PASSWORD_RESET_FAILED: 'Failed to reset password',

  // Login & Password Change
  AUTH_INVALID_CREDENTIALS: 'Invalid email or password',
  AUTH_CHANGE_PASSWORD_WEAK: 'Password does not meet security requirements',
  AUTH_CHANGE_PASSWORD_FAILED: 'Failed to change password',

  // Client Access
  CLIENT_ACCESS_DENIED: 'Access denied to this client',
  CLIENT_NOT_FOUND: 'Client not found',
  CLIENT_CREATE_FAILED: 'Failed to create client',

  // User Management
  USER_NOT_FOUND: 'User not found',
  USER_CREATE_FAILED: 'Failed to create user',
  USER_UPDATE_FAILED: 'Failed to update user',

  // Company
  COMPANY_NOT_FOUND: 'Company not found',
  COMPANY_CREATE_FAILED: 'Failed to create company',
  COMPANY_UPDATE_FAILED: 'Failed to update company',

  // Documents
  DOCUMENT_NOT_FOUND: 'Document not found',
  DOCUMENT_FETCH_FAILED: 'Failed to fetch documents',
  DOCUMENT_UPLOAD_FAILED: 'Failed to upload document',

  // Tax Calendar
  TAX_CALENDAR_FETCH_FAILED: 'Failed to fetch tax calendar entries',
  TAX_CALENDAR_CREATE_FAILED: 'Failed to create tax calendar entry',
  TAX_CALENDAR_UPDATE_FAILED: 'Failed to update tax calendar entry',

  // Tax Function
  TAX_FUNCTION_FETCH_FAILED: 'Failed to fetch tax function data',
  TAX_FUNCTION_CREATE_FAILED: 'Failed to create tax function data',
  TAX_FUNCTION_UPDATE_FAILED: 'Failed to update tax function data',
  TAX_FUNCTION_DELETE_FAILED: 'Failed to delete tax function data',
  TAX_FUNCTION_ROW_NOT_FOUND: 'Tax function row not found',

  // Validation
  VALIDATION_FAILED: 'Validation failed',
  VALIDATION_INVALID_UUID: 'Invalid UUID format',
  VALIDATION_INVALID_EMAIL: 'Invalid email format',
  VALIDATION_INVALID_DATE: 'Invalid date format',
  VALIDATION_REQUIRED_FIELD: 'Required field is missing',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded, please try again later',
  RATE_LIMIT_AUTH_EXCEEDED: 'Authentication rate limit exceeded',
  RATE_LIMIT_INVITE_EXCEEDED: 'Invitation rate limit exceeded',
  RATE_LIMIT_PASSWORD_RESET_EXCEEDED: 'Password reset rate limit exceeded',

  // Time Tracking
  TIME_ENTRY_NOT_FOUND: 'Time entry not found',
  TIME_ENTRY_CREATE_FAILED: 'Failed to create time entry',
  TIME_ENTRY_UPDATE_FAILED: 'Failed to update time entry',
  TIME_ENTRY_DELETE_FAILED: 'Failed to delete time entry',
  TIME_TIMER_ALREADY_RUNNING: 'Timer is already running for this advisor',
  TIME_TIMER_NOT_RUNNING: 'No active timer found for this advisor',
  TIME_ALLOWANCE_NOT_FOUND: 'Time allowance not found for this client',

  // Plans
  PLAN_NOT_FOUND: 'Plan not found',
  PLAN_CONFIG_UPDATE_FAILED: 'Failed to update plan configuration',
  PLAN_ASSIGNMENT_FAILED: 'Failed to assign plan to client',
  PLAN_INVALID_DATE_RANGE: 'Invalid plan date range',
  PLAN_RETROACTIVE_NOT_ALLOWED: 'Retroactive plan changes beyond grace period are not allowed',

  // Invoices
  INVOICE_NOT_FOUND: 'Invoice not found',
  INVOICE_CREATE_FAILED: 'Failed to create invoice',
  INVOICE_UPDATE_FAILED: 'Failed to update invoice',
  INVOICE_INVALID_STATUS: 'Invalid invoice status for this operation',
  INVOICE_PROOF_UPLOAD_FAILED: 'Failed to upload invoice proof',
  INVOICE_ALREADY_REVIEWED: 'Invoice has already been reviewed',
  INVOICE_NUMBER_GENERATION_FAILED: 'Failed to generate invoice number',

  // Allowance
  ALLOWANCE_NOT_FOUND: 'Monthly allowance not found',
  ALLOWANCE_CREATE_FAILED: 'Failed to create monthly allowance',
  ALLOWANCE_EXCEEDED: 'Monthly allowance exceeded',

  // General
  NOT_FOUND: 'Resource not found',
  INTERNAL_ERROR: 'Internal server error',
  BAD_REQUEST: 'Bad request',
  FORBIDDEN: 'Forbidden',
  UNAUTHORIZED: 'Unauthorized',
  CONFLICT: 'Resource conflict or constraint violation',
};
