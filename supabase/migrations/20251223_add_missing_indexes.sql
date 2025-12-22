-- Migration: Add missing indexes for performance optimization
-- Created: 2025-12-23
-- Description: Adds indexes on frequently queried columns across all tables

-- app_users indexes
create index if not exists idx_app_users_email on public.app_users(email);
create index if not exists idx_app_users_client_id on public.app_users(client_id);
create index if not exists idx_app_users_role on public.app_users(role);

-- documents indexes
create index if not exists idx_documents_client_id on public.documents(client_id);
create index if not exists idx_documents_uploaded_by on public.documents(uploaded_by);
create index if not exists idx_documents_source on public.documents(source);
create index if not exists idx_documents_created_at on public.documents(created_at desc);

-- tax_return_calendar_entries indexes
create index if not exists idx_tax_calendar_client_id on public.tax_return_calendar_entries(client_id);
create index if not exists idx_tax_calendar_deadline on public.tax_return_calendar_entries(deadline);
create index if not exists idx_tax_calendar_status on public.tax_return_calendar_entries(status);
create index if not exists idx_tax_calendar_jurisdiction on public.tax_return_calendar_entries(jurisdiction);
create index if not exists idx_tax_calendar_tax_type on public.tax_return_calendar_entries(tax_type);
create index if not exists idx_tax_calendar_client_deadline on public.tax_return_calendar_entries(client_id, deadline);

-- tax_risk_matrix_entries indexes
create index if not exists idx_tax_risk_matrix_client_id on public.tax_risk_matrix_entries(client_id);
create index if not exists idx_tax_risk_matrix_score on public.tax_risk_matrix_entries(score desc);
create index if not exists idx_tax_risk_matrix_color on public.tax_risk_matrix_entries(score_color);

-- tax_risk_control_rows indexes
create index if not exists idx_tax_risk_control_client_id on public.tax_risk_control_rows(client_id);
create index if not exists idx_tax_risk_control_score on public.tax_risk_control_rows(inherent_score desc);

-- tax_function_rows indexes
create index if not exists idx_tax_function_client_id on public.tax_function_rows(client_id);
create index if not exists idx_tax_function_order on public.tax_function_rows(order_index);

-- audit_log indexes
create index if not exists idx_audit_log_client_id on public.audit_log(client_id);
create index if not exists idx_audit_log_user_id on public.audit_log(user_id);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action);
create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id);

-- clients indexes (for search and lookups)
create index if not exists idx_clients_slug on public.clients(slug);
create index if not exists idx_clients_created_at on public.clients(created_at desc);

-- Composite indexes for common query patterns
create index if not exists idx_documents_client_source on public.documents(client_id, source);
create index if not exists idx_tax_calendar_client_status on public.tax_return_calendar_entries(client_id, status);
create index if not exists idx_audit_log_client_created on public.audit_log(client_id, created_at desc);

-- Add comments for documentation
comment on index idx_app_users_email is 'Fast lookup for user authentication and invitation checks';
comment on index idx_app_users_client_id is 'Filter users by client for admin operations';
comment on index idx_documents_client_id is 'Primary filter for client-scoped document queries';
comment on index idx_tax_calendar_client_deadline is 'Composite index for upcoming deadlines query';
comment on index idx_audit_log_client_created is 'Composite index for recent activity queries';
