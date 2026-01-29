/**
 * Type definitions for SystemForm entity and FormXML structures.
 */

/**
 * Form types in Dataverse
 */
export enum FormType {
  Dashboard = 0,
  AppointmentBook = 1,
  Main = 2,
  MiniCampaignBO = 3,
  Preview = 4,
  Mobile = 5,
  QuickView = 6,
  QuickCreate = 7,
  Dialog = 8,
  TaskFlow = 9,
  InteractionCentricDashboard = 10,
  Card = 11,
  MainInteractiveExperience = 12,
  ContextualDashboard = 13,
  Other = 100,
  MainBackup = 101,
  AppointmentBookBackup = 102,
  PowerBIDashboard = 103
}

/**
 * Form activation states
 */
export enum FormActivationState {
  Inactive = 0,
  Active = 1
}

/**
 * SystemForm entity from Dataverse
 */
export interface SystemForm {
  formid: string;
  name: string;
  objecttypecode: string;
  type: number;
  formxml: string;
  formactivationstate: number;
  isdefault: boolean;
  description?: string;
  formjson?: string;
  introducedversion?: string;
  isairmerged?: boolean;
  iscustomizable?: {
    Value: boolean;
    CanBeChanged: boolean;
  };
  ismanaged?: boolean;
  istabletenabled?: boolean;
  uniquename?: string;
  version?: number;
  _organizationid_value?: string;
  _ancestorformid_value?: string;
}

/**
 * Options for querying forms
 */
export interface FormQueryOptions {
  entityLogicalName?: string;
  formType?: number;
  isDefault?: boolean;
  isActive?: boolean;
  nameContains?: string;
  maxRecords?: number;
}

/**
 * Update definition for form metadata
 */
export interface FormUpdateDefinition {
  name?: string;
  description?: string;
}

// ============================================================================
// FormXML Structure Types
// ============================================================================

/**
 * Represents a control in FormXML
 */
export interface FormControl {
  id: string;
  classid?: string;
  datafieldname?: string;
  disabled?: boolean;
  label?: string;
  showlabel?: boolean;
  visible?: boolean;
  parameters?: Record<string, string>;
}

/**
 * Represents a cell in FormXML
 */
export interface FormCell {
  id: string;
  colspan?: number;
  rowspan?: number;
  showlabel?: boolean;
  locklevel?: number;
  control?: FormControl;
}

/**
 * Represents a row in FormXML
 */
export interface FormRow {
  cells: FormCell[];
}

/**
 * Represents a section in FormXML
 */
export interface FormSection {
  id: string;
  name: string;
  label?: string;
  showlabel?: boolean;
  showbar?: boolean;
  visible?: boolean;
  columns?: number;
  rows: FormRow[];
}

/**
 * Represents a column within a tab in FormXML
 */
export interface FormColumn {
  width?: string;
  sections: FormSection[];
}

/**
 * Represents a tab in FormXML
 */
export interface FormTab {
  id: string;
  name: string;
  label?: string;
  showlabel?: boolean;
  visible?: boolean;
  expanded?: boolean;
  columns: FormColumn[];
}

/**
 * Represents header/footer sections
 */
export interface FormHeaderFooter {
  id?: string;
  rows: FormRow[];
}

/**
 * Parsed representation of FormXML
 */
export interface ParsedForm {
  formId?: string;
  tabs: FormTab[];
  header?: FormHeaderFooter;
  footer?: FormHeaderFooter;
  navigation?: FormNavigation;
  events?: FormEvents;
}

/**
 * Navigation items in FormXML
 */
export interface FormNavigation {
  items: FormNavigationItem[];
}

export interface FormNavigationItem {
  id: string;
  relationshipName?: string;
  show?: boolean;
}

/**
 * Events configuration in FormXML
 */
export interface FormEvents {
  onload?: FormEventHandler[];
  onsave?: FormEventHandler[];
}

export interface FormEventHandler {
  libraryName: string;
  functionName: string;
  enabled?: boolean;
  parameters?: string;
  passExecutionContext?: boolean;
}

// ============================================================================
// Tab/Section/Control Definition Types for Creation
// ============================================================================

/**
 * Definition for creating a new tab
 */
export interface TabDefinition {
  name: string;
  label: string;
  visible?: boolean;
  expanded?: boolean;
  showLabel?: boolean;
  columns?: number;
}

/**
 * Definition for creating a new section
 */
export interface SectionDefinition {
  name: string;
  label: string;
  visible?: boolean;
  showLabel?: boolean;
  showBar?: boolean;
  columns?: number;
}

/**
 * Definition for creating a new control/field
 */
export interface ControlDefinition {
  fieldName: string;
  label?: string;
  showLabel?: boolean;
  visible?: boolean;
  disabled?: boolean;
}

// ============================================================================
// Form Type Helpers
// ============================================================================

/**
 * Get human-readable form type name
 */
export function getFormTypeName(type: number): string {
  switch (type) {
    case FormType.Dashboard: return 'Dashboard';
    case FormType.AppointmentBook: return 'Appointment Book';
    case FormType.Main: return 'Main';
    case FormType.MiniCampaignBO: return 'Mini Campaign BO';
    case FormType.Preview: return 'Preview';
    case FormType.Mobile: return 'Mobile';
    case FormType.QuickView: return 'Quick View';
    case FormType.QuickCreate: return 'Quick Create';
    case FormType.Dialog: return 'Dialog';
    case FormType.TaskFlow: return 'Task Flow';
    case FormType.InteractionCentricDashboard: return 'Interaction Centric Dashboard';
    case FormType.Card: return 'Card';
    case FormType.MainInteractiveExperience: return 'Main Interactive Experience';
    case FormType.ContextualDashboard: return 'Contextual Dashboard';
    case FormType.Other: return 'Other';
    case FormType.MainBackup: return 'Main Backup';
    case FormType.AppointmentBookBackup: return 'Appointment Book Backup';
    case FormType.PowerBIDashboard: return 'Power BI Dashboard';
    default: return `Unknown (${type})`;
  }
}

/**
 * Get activation state name
 */
export function getActivationStateName(state: number): string {
  return state === FormActivationState.Active ? 'Active' : 'Inactive';
}
