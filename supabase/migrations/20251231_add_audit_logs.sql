-- Migration: Add audit_logs table for tracking system actions
-- Created: 2025-12-31

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Actor information
  client_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  
  -- Action details
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  
  -- Additional context (JSONB for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for common queries
CREATE INDEX idx_audit_logs_client_id ON audit_logs(client_id);
CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id) WHERE entity_type IS NOT NULL;

-- RLS policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (backend only)
CREATE POLICY "Service role can insert audit logs"
  ON audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Users can view their own company's audit logs
CREATE POLICY "Users can view their company audit logs"
  ON audit_logs
  FOR SELECT
  USING (
    client_id IN (
      SELECT company_id 
      FROM app_users 
      WHERE user_id = auth.uid()
    )
  );

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
  ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM app_users 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

COMMENT ON TABLE audit_logs IS 'System-wide audit trail for tracking user actions and system events';
COMMENT ON COLUMN audit_logs.client_id IS 'Company/client associated with the action';
COMMENT ON COLUMN audit_logs.actor_user_id IS 'User who performed the action';
COMMENT ON COLUMN audit_logs.actor_role IS 'Role of the actor at the time of action';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (e.g., user.login, document.create)';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity affected (e.g., document, user, company)';
COMMENT ON COLUMN audit_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context data (must not contain sensitive information)';
