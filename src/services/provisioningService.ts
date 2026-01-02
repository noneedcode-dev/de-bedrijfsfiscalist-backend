import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

interface ProvisioningResult {
  success: boolean;
  taxCalendarCount: number;
  riskMatrixCount: number;
  riskControlCount: number;
  taxFunctionCount: number;
  error?: string;
}

function getDefaultTaxCalendarTemplates(clientId: string) {
  const currentYear = new Date().getFullYear();
  
  return [
    {
      client_id: clientId,
      jurisdiction: 'NL',
      tax_type: 'Dutch VAT',
      period_label: `${currentYear}-Q1`,
      period_start: `${currentYear}-01-01`,
      period_end: `${currentYear}-03-31`,
      deadline: `${currentYear}-04-30`,
      status: 'pending',
      responsible_party: 'Tax Department',
      notes: 'Q1 VAT return filing',
    },
    {
      client_id: clientId,
      jurisdiction: 'NL',
      tax_type: 'Dutch VAT',
      period_label: `${currentYear}-Q2`,
      period_start: `${currentYear}-04-01`,
      period_end: `${currentYear}-06-30`,
      deadline: `${currentYear}-07-31`,
      status: 'pending',
      responsible_party: 'Tax Department',
      notes: 'Q2 VAT return filing',
    },
    {
      client_id: clientId,
      jurisdiction: 'NL',
      tax_type: 'Dutch VAT',
      period_label: `${currentYear}-Q3`,
      period_start: `${currentYear}-07-01`,
      period_end: `${currentYear}-09-30`,
      deadline: `${currentYear}-10-31`,
      status: 'pending',
      responsible_party: 'Tax Department',
      notes: 'Q3 VAT return filing',
    },
    {
      client_id: clientId,
      jurisdiction: 'NL',
      tax_type: 'Dutch VAT',
      period_label: `${currentYear}-Q4`,
      period_start: `${currentYear}-10-01`,
      period_end: `${currentYear}-12-31`,
      deadline: `${currentYear + 1}-01-31`,
      status: 'pending',
      responsible_party: 'Tax Department',
      notes: 'Q4 VAT return filing',
    },
    {
      client_id: clientId,
      jurisdiction: 'NL',
      tax_type: 'Dutch CIT',
      period_label: `${currentYear}`,
      period_start: `${currentYear}-01-01`,
      period_end: `${currentYear}-12-31`,
      deadline: `${currentYear + 1}-05-31`,
      status: 'pending',
      responsible_party: 'Tax Department',
      notes: 'Annual Corporate Income Tax return',
    },
    {
      client_id: clientId,
      jurisdiction: 'NL',
      tax_type: 'Dutch Payroll Tax',
      period_label: `${currentYear}-Jan`,
      period_start: `${currentYear}-01-01`,
      period_end: `${currentYear}-01-31`,
      deadline: `${currentYear}-02-28`,
      status: 'pending',
      responsible_party: 'Payroll Department',
      notes: 'Monthly payroll tax filing',
    },
  ];
}

function getDefaultRiskMatrixTemplates(clientId: string) {
  return [
    {
      client_id: clientId,
      risk_code: 'VAT-001',
      likelihood: 3,
      impact: 4,
      score: 12,
      score_color: 'amber',
      matrix_row: 3,
      matrix_col: 4,
    },
    {
      client_id: clientId,
      risk_code: 'CIT-001',
      likelihood: 2,
      impact: 5,
      score: 10,
      score_color: 'amber',
      matrix_row: 2,
      matrix_col: 5,
    },
    {
      client_id: clientId,
      risk_code: 'TP-001',
      likelihood: 4,
      impact: 5,
      score: 20,
      score_color: 'red',
      matrix_row: 4,
      matrix_col: 5,
    },
    {
      client_id: clientId,
      risk_code: 'WHT-001',
      likelihood: 2,
      impact: 3,
      score: 6,
      score_color: 'green',
      matrix_row: 2,
      matrix_col: 3,
    },
  ];
}

function getDefaultRiskControlTemplates(clientId: string) {
  return [
    {
      client_id: clientId,
      risk_code: 'VAT-001',
      risk_description: 'Incorrect VAT treatment on cross-border transactions',
      inherent_likelihood: 3,
      inherent_impact: 4,
      inherent_score: 12,
      inherent_color: 'amber',
      control_required: true,
      control_description: 'Monthly review of all cross-border invoices by tax specialist',
      monitoring_frequency: 'Monthly',
      monitoring_months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      owner: 'Tax Manager',
    },
    {
      client_id: clientId,
      risk_code: 'CIT-001',
      risk_description: 'Non-deductible expenses incorrectly claimed',
      inherent_likelihood: 2,
      inherent_impact: 5,
      inherent_score: 10,
      inherent_color: 'amber',
      control_required: true,
      control_description: 'Quarterly review of expense categories and tax adjustments',
      monitoring_frequency: 'Quarterly',
      monitoring_months: [3, 6, 9, 12],
      owner: 'Finance Director',
    },
    {
      client_id: clientId,
      risk_code: 'TP-001',
      risk_description: 'Transfer pricing documentation not aligned with OECD guidelines',
      inherent_likelihood: 4,
      inherent_impact: 5,
      inherent_score: 20,
      inherent_color: 'red',
      control_required: true,
      control_description: 'Annual transfer pricing study and benchmarking analysis',
      monitoring_frequency: 'Yearly',
      monitoring_months: [12],
      owner: 'Tax Director',
    },
    {
      client_id: clientId,
      risk_code: 'WHT-001',
      risk_description: 'Withholding tax not correctly applied on dividend payments',
      inherent_likelihood: 2,
      inherent_impact: 3,
      inherent_score: 6,
      inherent_color: 'green',
      control_required: true,
      control_description: 'Review of all dividend payments and applicable tax treaties',
      monitoring_frequency: 'Quarterly',
      monitoring_months: [3, 6, 9, 12],
      owner: 'Tax Specialist',
    },
  ];
}

function getDefaultTaxFunctionTemplates(clientId: string) {
  return [
    {
      client_id: clientId,
      process_name: 'VAT Compliance',
      process_description: 'Monthly VAT return preparation and filing',
      stakeholders: ['Finance', 'Tax', 'Accounting'],
      frequency: 'Monthly',
      notes: 'Includes reconciliation of VAT accounts and submission to tax authorities',
      order_index: 1,
    },
    {
      client_id: clientId,
      process_name: 'Corporate Income Tax',
      process_description: 'Annual CIT return preparation and tax planning',
      stakeholders: ['Finance', 'Tax', 'Management'],
      frequency: 'Yearly',
      notes: 'Includes tax provision calculation and deferred tax analysis',
      order_index: 2,
    },
    {
      client_id: clientId,
      process_name: 'Transfer Pricing',
      process_description: 'Transfer pricing documentation and compliance',
      stakeholders: ['Tax', 'Legal', 'Finance'],
      frequency: 'Yearly',
      notes: 'Maintain arm\'s length pricing for intercompany transactions',
      order_index: 3,
    },
    {
      client_id: clientId,
      process_name: 'Payroll Tax',
      process_description: 'Monthly payroll tax calculation and remittance',
      stakeholders: ['Payroll', 'HR', 'Finance'],
      frequency: 'Monthly',
      notes: 'Includes wage tax, social security contributions, and reporting',
      order_index: 4,
    },
    {
      client_id: clientId,
      process_name: 'Tax Risk Management',
      process_description: 'Ongoing identification and mitigation of tax risks',
      stakeholders: ['Tax', 'Finance', 'Legal', 'Audit'],
      frequency: 'Quarterly',
      notes: 'Regular review of tax positions and control effectiveness',
      order_index: 5,
    },
  ];
}

export async function provisionDefaultTemplates(
  supabase: SupabaseClient,
  clientId: string
): Promise<ProvisioningResult> {
  const result: ProvisioningResult = {
    success: false,
    taxCalendarCount: 0,
    riskMatrixCount: 0,
    riskControlCount: 0,
    taxFunctionCount: 0,
  };

  try {
    logger.info('Starting default template provisioning', { clientId });

    // Tax Calendar: Check existing entries and insert only missing ones
    const taxCalendarTemplates = getDefaultTaxCalendarTemplates(clientId);
    const { data: existingTaxCalendar } = await supabase
      .from('tax_return_calendar_entries')
      .select('jurisdiction, tax_type, period_label, deadline')
      .eq('client_id', clientId);

    const existingTaxCalendarKeys = new Set(
      (existingTaxCalendar || []).map(
        (e: any) => `${e.jurisdiction}|${e.tax_type}|${e.period_label}|${e.deadline}`
      )
    );

    const newTaxCalendarTemplates = taxCalendarTemplates.filter((template) => {
      const key = `${template.jurisdiction}|${template.tax_type}|${template.period_label}|${template.deadline}`;
      return !existingTaxCalendarKeys.has(key);
    });

    if (newTaxCalendarTemplates.length > 0) {
      const { data: taxCalendarData, error: taxCalendarError } = await supabase
        .from('tax_return_calendar_entries')
        .insert(newTaxCalendarTemplates)
        .select('id');

      if (taxCalendarError) {
        throw new AppError(
          `Failed to provision tax calendar templates: ${taxCalendarError.message}`,
          500
        );
      }
      result.taxCalendarCount = taxCalendarData?.length ?? 0;
    }
    logger.info('Tax calendar templates provisioned', {
      clientId,
      count: result.taxCalendarCount,
      skipped: taxCalendarTemplates.length - newTaxCalendarTemplates.length,
    });

    // Risk Matrix: Check existing entries and insert only missing ones
    const riskMatrixTemplates = getDefaultRiskMatrixTemplates(clientId);
    const { data: existingRiskMatrix } = await supabase
      .from('tax_risk_matrix_entries')
      .select('risk_code')
      .eq('client_id', clientId);

    const existingRiskMatrixCodes = new Set(
      (existingRiskMatrix || []).map((e: any) => e.risk_code)
    );

    const newRiskMatrixTemplates = riskMatrixTemplates.filter(
      (template) => !existingRiskMatrixCodes.has(template.risk_code)
    );

    if (newRiskMatrixTemplates.length > 0) {
      const { data: riskMatrixData, error: riskMatrixError } = await supabase
        .from('tax_risk_matrix_entries')
        .insert(newRiskMatrixTemplates)
        .select('id');

      if (riskMatrixError) {
        throw new AppError(
          `Failed to provision risk matrix templates: ${riskMatrixError.message}`,
          500
        );
      }
      result.riskMatrixCount = riskMatrixData?.length ?? 0;
    }
    logger.info('Risk matrix templates provisioned', {
      clientId,
      count: result.riskMatrixCount,
      skipped: riskMatrixTemplates.length - newRiskMatrixTemplates.length,
    });

    // Risk Control: Check existing entries and insert only missing ones
    const riskControlTemplates = getDefaultRiskControlTemplates(clientId);
    const { data: existingRiskControl } = await supabase
      .from('tax_risk_control_rows')
      .select('risk_code')
      .eq('client_id', clientId);

    const existingRiskControlCodes = new Set(
      (existingRiskControl || []).map((e: any) => e.risk_code)
    );

    const newRiskControlTemplates = riskControlTemplates.filter(
      (template) => !existingRiskControlCodes.has(template.risk_code)
    );

    if (newRiskControlTemplates.length > 0) {
      const { data: riskControlData, error: riskControlError } = await supabase
        .from('tax_risk_control_rows')
        .insert(newRiskControlTemplates)
        .select('id');

      if (riskControlError) {
        throw new AppError(
          `Failed to provision risk control templates: ${riskControlError.message}`,
          500
        );
      }
      result.riskControlCount = riskControlData?.length ?? 0;
    }
    logger.info('Risk control templates provisioned', {
      clientId,
      count: result.riskControlCount,
      skipped: riskControlTemplates.length - newRiskControlTemplates.length,
    });

    // Tax Function: Check existing entries and insert only missing ones
    const taxFunctionTemplates = getDefaultTaxFunctionTemplates(clientId);
    const { data: existingTaxFunction } = await supabase
      .from('tax_function_rows')
      .select('process_name')
      .eq('client_id', clientId);

    const existingProcessNames = new Set(
      (existingTaxFunction || []).map((e: any) => e.process_name)
    );

    const newTaxFunctionTemplates = taxFunctionTemplates.filter(
      (template) => !existingProcessNames.has(template.process_name)
    );

    if (newTaxFunctionTemplates.length > 0) {
      const { data: taxFunctionData, error: taxFunctionError } = await supabase
        .from('tax_function_rows')
        .insert(newTaxFunctionTemplates)
        .select('id');

      if (taxFunctionError) {
        throw new AppError(
          `Failed to provision tax function templates: ${taxFunctionError.message}`,
          500
        );
      }
      result.taxFunctionCount = taxFunctionData?.length ?? 0;
    }
    logger.info('Tax function templates provisioned', {
      clientId,
      count: result.taxFunctionCount,
      skipped: taxFunctionTemplates.length - newTaxFunctionTemplates.length,
    });

    result.success = true;
    logger.info('Default template provisioning completed successfully', {
      clientId,
      result,
    });

    return result;
  } catch (error: any) {
    logger.error('Failed to provision default templates', {
      clientId,
      error: error.message,
      stack: error.stack,
    });

    result.error = error.message;
    throw error;
  }
}

export const provisioningService = {
  provisionDefaultTemplates,
};
