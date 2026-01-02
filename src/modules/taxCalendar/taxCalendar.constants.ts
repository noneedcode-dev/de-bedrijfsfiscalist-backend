export const TAX_CALENDAR_STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  NOT_APPLICABLE: 'not_applicable',
} as const;

export type TaxCalendarStatus = typeof TAX_CALENDAR_STATUSES[keyof typeof TAX_CALENDAR_STATUSES];

export const TAX_CALENDAR_STATUS_VALUES = Object.values(TAX_CALENDAR_STATUSES);
