-- Add RACI columns to tax_function_rows table
-- Migration: 20260128_add_tax_function_raci.sql
-- Purpose: Add accountable, consulted, informed columns and remove client write policy

-- Add new RACI columns
ALTER TABLE public.tax_function_rows
ADD COLUMN IF NOT EXISTS accountable text[],
ADD COLUMN IF NOT EXISTS consulted text[],
ADD COLUMN IF NOT EXISTS informed text[];

-- Drop client write policy (client role should only have read access)
DROP POLICY IF EXISTS "tax_function_client_modify_own" ON public.tax_function_rows;

-- Note: Select policy and admin full access policies remain unchanged
