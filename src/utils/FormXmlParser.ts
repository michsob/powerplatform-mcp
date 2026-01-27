/**
 * Utility for parsing and manipulating FormXML.
 *
 * FormXML has a nested structure: form > tabs > tab > columns > column > sections > section > rows > row > cell > control
 */

import type {
  ParsedForm,
  FormTab,
  FormColumn,
  FormSection,
  FormRow,
  FormCell,
  FormControl,
  FormHeaderFooter,
  TabDefinition,
  SectionDefinition,
  ControlDefinition,
} from '../models/FormTypes.js';

// Simple XML parser using regex (no external dependencies)
// For production use, consider a proper XML parser library

interface XmlElement {
  tag: string;
  attributes: Record<string, string>;
  children: (XmlElement | string)[];
  selfClosing: boolean;
}

/**
 * Parse an XML string into a simple element structure
 */
function parseXmlString(xml: string): XmlElement | null {
  // Remove XML declaration and normalize whitespace
  xml = xml.replace(/<\?xml[^?]*\?>/gi, '').trim();

  const stack: XmlElement[] = [];
  let current: XmlElement | null = null;
  let pos = 0;

  while (pos < xml.length) {
    // Find next tag
    const tagStart = xml.indexOf('<', pos);
    if (tagStart === -1) break;

    // Capture text before tag
    if (tagStart > pos && current) {
      const text = xml.substring(pos, tagStart).trim();
      if (text) {
        current.children.push(text);
      }
    }

    const tagEnd = xml.indexOf('>', tagStart);
    if (tagEnd === -1) break;

    const tagContent = xml.substring(tagStart + 1, tagEnd);

    // Skip comments and CDATA
    if (tagContent.startsWith('!')) {
      pos = tagEnd + 1;
      continue;
    }

    // Closing tag
    if (tagContent.startsWith('/')) {
      if (stack.length > 0) {
        const finished: XmlElement | null = current;
        current = stack.pop() || null;
        if (current && finished) {
          current.children.push(finished);
        } else if (!current && finished) {
          current = finished;
        }
      }
      pos = tagEnd + 1;
      continue;
    }

    // Parse opening tag
    const selfClosing = tagContent.endsWith('/');
    const cleanTag = selfClosing ? tagContent.slice(0, -1).trim() : tagContent;

    // Extract tag name and attributes
    const spaceIndex = cleanTag.indexOf(' ');
    const tagName = spaceIndex === -1 ? cleanTag : cleanTag.substring(0, spaceIndex);
    const attrString = spaceIndex === -1 ? '' : cleanTag.substring(spaceIndex);

    const attributes: Record<string, string> = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
      attributes[match[1].toLowerCase()] = match[2];
    }

    const element: XmlElement = {
      tag: tagName.toLowerCase(),
      attributes,
      children: [],
      selfClosing
    };

    if (selfClosing) {
      if (current) {
        current.children.push(element);
      } else {
        current = element;
      }
    } else {
      if (current) {
        stack.push(current);
      }
      current = element;
    }

    pos = tagEnd + 1;
  }

  return current;
}

/**
 * Find child elements by tag name
 */
function findChildren(element: XmlElement, tagName: string): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement => typeof child !== 'string' && child.tag === tagName
  );
}

/**
 * Find first child element by tag name
 */
function findChild(element: XmlElement, tagName: string): XmlElement | undefined {
  return element.children.find(
    (child): child is XmlElement => typeof child !== 'string' && child.tag === tagName
  );
}

/**
 * Get attribute value with default
 */
function getAttr(element: XmlElement, name: string, defaultValue?: string): string | undefined {
  return element.attributes[name.toLowerCase()] ?? defaultValue;
}

/**
 * Get boolean attribute
 */
function getBoolAttr(element: XmlElement, name: string, defaultValue: boolean = true): boolean {
  const val = getAttr(element, name);
  if (val === undefined) return defaultValue;
  return val === 'true' || val === '1';
}

/**
 * Parse a control element
 */
function parseControl(element: XmlElement): FormControl {
  const control: FormControl = {
    id: getAttr(element, 'id') || '',
    classid: getAttr(element, 'classid'),
    datafieldname: getAttr(element, 'datafieldname'),
    disabled: getBoolAttr(element, 'disabled', false),
    visible: getBoolAttr(element, 'visible', true),
  };

  // Parse labels element for label text
  const labels = findChild(element, 'labels');
  if (labels) {
    const label = findChild(labels, 'label');
    if (label) {
      control.label = getAttr(label, 'description');
      control.showlabel = getBoolAttr(label, 'showlabel', true);
    }
  }

  // Parse parameters
  const params = findChild(element, 'parameters');
  if (params) {
    control.parameters = {};
    for (const child of params.children) {
      if (typeof child !== 'string') {
        const textContent = child.children.find((c): c is string => typeof c === 'string');
        if (textContent) {
          control.parameters[child.tag] = textContent;
        }
      }
    }
  }

  return control;
}

/**
 * Parse a cell element
 */
function parseCell(element: XmlElement): FormCell {
  const cell: FormCell = {
    id: getAttr(element, 'id') || '',
    colspan: getAttr(element, 'colspan') ? parseInt(getAttr(element, 'colspan')!) : undefined,
    rowspan: getAttr(element, 'rowspan') ? parseInt(getAttr(element, 'rowspan')!) : undefined,
    showlabel: getBoolAttr(element, 'showlabel', true),
    locklevel: getAttr(element, 'locklevel') ? parseInt(getAttr(element, 'locklevel')!) : undefined,
  };

  const controlEl = findChild(element, 'control');
  if (controlEl) {
    cell.control = parseControl(controlEl);
  }

  return cell;
}

/**
 * Parse a row element
 */
function parseRow(element: XmlElement): FormRow {
  const cells = findChildren(element, 'cell').map(parseCell);
  return { cells };
}

/**
 * Parse a section element
 */
function parseSection(element: XmlElement): FormSection {
  const section: FormSection = {
    id: getAttr(element, 'id') || '',
    name: getAttr(element, 'name') || '',
    showlabel: getBoolAttr(element, 'showlabel', true),
    showbar: getBoolAttr(element, 'showbar', false),
    visible: getBoolAttr(element, 'visible', true),
    columns: getAttr(element, 'columns') ? parseInt(getAttr(element, 'columns')!) : undefined,
    rows: [],
  };

  // Parse labels
  const labels = findChild(element, 'labels');
  if (labels) {
    const label = findChild(labels, 'label');
    if (label) {
      section.label = getAttr(label, 'description');
    }
  }

  // Parse rows
  const rowsEl = findChild(element, 'rows');
  if (rowsEl) {
    section.rows = findChildren(rowsEl, 'row').map(parseRow);
  }

  return section;
}

/**
 * Parse a column element (within a tab)
 */
function parseColumn(element: XmlElement): FormColumn {
  const column: FormColumn = {
    width: getAttr(element, 'width'),
    sections: [],
  };

  const sectionsEl = findChild(element, 'sections');
  if (sectionsEl) {
    column.sections = findChildren(sectionsEl, 'section').map(parseSection);
  }

  return column;
}

/**
 * Parse a tab element
 */
function parseTab(element: XmlElement): FormTab {
  const tab: FormTab = {
    id: getAttr(element, 'id') || '',
    name: getAttr(element, 'name') || '',
    visible: getBoolAttr(element, 'visible', true),
    expanded: getBoolAttr(element, 'expanded', true),
    showlabel: getBoolAttr(element, 'showlabel', true),
    columns: [],
  };

  // Parse labels
  const labels = findChild(element, 'labels');
  if (labels) {
    const label = findChild(labels, 'label');
    if (label) {
      tab.label = getAttr(label, 'description');
    }
  }

  // Parse columns
  const columnsEl = findChild(element, 'columns');
  if (columnsEl) {
    tab.columns = findChildren(columnsEl, 'column').map(parseColumn);
  }

  return tab;
}

/**
 * Parse header or footer element
 */
function parseHeaderFooter(element: XmlElement): FormHeaderFooter {
  const result: FormHeaderFooter = {
    id: getAttr(element, 'id'),
    rows: [],
  };

  const rowsEl = findChild(element, 'rows');
  if (rowsEl) {
    result.rows = findChildren(rowsEl, 'row').map(parseRow);
  }

  return result;
}

/**
 * Parse FormXML string into a structured object
 */
export function parseFormXml(formXml: string): ParsedForm {
  const root = parseXmlString(formXml);

  if (!root) {
    return { tabs: [] };
  }

  const form: ParsedForm = {
    formId: getAttr(root, 'id'),
    tabs: [],
  };

  // Parse tabs
  const tabsEl = findChild(root, 'tabs');
  if (tabsEl) {
    form.tabs = findChildren(tabsEl, 'tab').map(parseTab);
  }

  // Parse header
  const headerEl = findChild(root, 'header');
  if (headerEl) {
    form.header = parseHeaderFooter(headerEl);
  }

  // Parse footer
  const footerEl = findChild(root, 'footer');
  if (footerEl) {
    form.footer = parseHeaderFooter(footerEl);
  }

  return form;
}

/**
 * Generate a unique ID for form elements
 */
function generateId(): string {
  return '{' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }) + '}';
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Add a tab to FormXML
 */
export function addTab(formXml: string, definition: TabDefinition, position?: number): string {
  const tabId = generateId();
  const columns = definition.columns || 1;

  // Build column sections
  let columnsXml = '';
  for (let i = 0; i < columns; i++) {
    const sectionId = generateId();
    const sectionName = `${definition.name}_section_${i}`;
    columnsXml += `
      <column width="100%">
        <sections>
          <section id="${sectionId}" name="${sectionName}" showlabel="false" showbar="false" columns="1">
            <labels>
              <label description="" languagecode="1033" />
            </labels>
            <rows />
          </section>
        </sections>
      </column>`;
  }

  const tabXml = `
    <tab id="${tabId}" name="${escapeXml(definition.name)}" visible="${definition.visible !== false}" expanded="${definition.expanded !== false}" showlabel="${definition.showLabel !== false}">
      <labels>
        <label description="${escapeXml(definition.label)}" languagecode="1033" />
      </labels>
      <columns>${columnsXml}
      </columns>
    </tab>`;

  // Find the closing </tabs> tag and insert before it
  const tabsEndIndex = formXml.lastIndexOf('</tabs>');
  if (tabsEndIndex === -1) {
    throw new Error('Invalid FormXML: missing </tabs> element');
  }

  // If position specified, try to insert at that position
  if (position !== undefined && position >= 0) {
    const tabMatches = [...formXml.matchAll(/<tab\s/gi)];
    if (position < tabMatches.length) {
      const insertIndex = tabMatches[position].index!;
      return formXml.slice(0, insertIndex) + tabXml + formXml.slice(insertIndex);
    }
  }

  // Default: append at end
  return formXml.slice(0, tabsEndIndex) + tabXml + formXml.slice(tabsEndIndex);
}

/**
 * Remove a tab from FormXML by name
 */
export function removeTab(formXml: string, tabName: string): string {
  // Match tab with the specified name
  const tabRegex = new RegExp(`<tab[^>]*\\sname="${escapeXml(tabName)}"[^>]*>([\\s\\S]*?)<\\/tab>`, 'i');
  const match = formXml.match(tabRegex);

  if (!match) {
    throw new Error(`Tab '${tabName}' not found in FormXML`);
  }

  return formXml.replace(tabRegex, '');
}

/**
 * Add a section to a tab in FormXML
 * Searches by name attribute first, then by label description if name not found
 */
export function addSection(formXml: string, tabName: string, definition: SectionDefinition, columnIndex: number = 0): string {
  const sectionId = generateId();
  const columns = definition.columns || 1;

  const sectionXml = `
          <section id="${sectionId}" name="${escapeXml(definition.name)}" showlabel="${definition.showLabel !== false}" showbar="${definition.showBar === true}" visible="${definition.visible !== false}" columns="${columns}">
            <labels>
              <label description="${escapeXml(definition.label)}" languagecode="1033" />
            </labels>
            <rows />
          </section>`;

  // Try to find tab by name attribute first
  let tabRegex = new RegExp(`(<tab[^>]*\\sname="${escapeXml(tabName)}"[^>]*>[\\s\\S]*?<columns>)([\\s\\S]*?)(<\\/columns>)`, 'i');
  let tabMatch = formXml.match(tabRegex);

  // If not found by name, try finding by label description
  if (!tabMatch) {
    tabRegex = new RegExp(`(<tab[^>]*>[\\s\\S]*?<label\\s+description="${escapeXml(tabName)}"[^/]*/>[\\s\\S]*?<columns>)([\\s\\S]*?)(<\\/columns>)`, 'i');
    tabMatch = formXml.match(tabRegex);
  }

  if (!tabMatch) {
    throw new Error(`Tab '${tabName}' not found in FormXML (searched by name and label)`);
  }

  const columnsContent = tabMatch[2];

  // Find the column at the specified index
  const columnMatches = [...columnsContent.matchAll(/<column[^>]*>[\s\S]*?<\/column>/gi)];

  if (columnIndex >= columnMatches.length) {
    throw new Error(`Column index ${columnIndex} not found in tab '${tabName}'. Tab has ${columnMatches.length} columns.`);
  }

  const targetColumn = columnMatches[columnIndex];

  // Find the </sections> tag within this column
  const sectionsEndIndex = targetColumn[0].lastIndexOf('</sections>');
  if (sectionsEndIndex === -1) {
    throw new Error(`Invalid FormXML: missing </sections> in column`);
  }

  // Insert section before </sections>
  const updatedColumn = targetColumn[0].slice(0, sectionsEndIndex) + sectionXml + targetColumn[0].slice(sectionsEndIndex);

  // Replace the column in the columns content
  const updatedColumnsContent = columnsContent.slice(0, targetColumn.index!) +
    updatedColumn +
    columnsContent.slice(targetColumn.index! + targetColumn[0].length);

  // Replace in the original XML
  return formXml.replace(tabRegex, `$1${updatedColumnsContent}$3`);
}

/**
 * Remove a section from FormXML by name
 */
export function removeSection(formXml: string, sectionName: string): string {
  const sectionRegex = new RegExp(`<section[^>]*\\sname="${escapeXml(sectionName)}"[^>]*>[\\s\\S]*?<\\/section>`, 'i');
  const match = formXml.match(sectionRegex);

  if (!match) {
    throw new Error(`Section '${sectionName}' not found in FormXML`);
  }

  return formXml.replace(sectionRegex, '');
}

/**
 * Add a control/field to a section in FormXML
 * Searches by name attribute first, then by label description if name not found
 */
export function addControl(formXml: string, sectionName: string, definition: ControlDefinition): string {
  const controlId = escapeXml(definition.fieldName);

  // Generate minimal cell XML matching Dataverse schema
  const cellXml = `
              <row>
                <cell id="${generateId()}">
                  <labels>
                    <label description="${escapeXml(definition.label || definition.fieldName)}" languagecode="1033" />
                  </labels>
                  <control id="${controlId}" classid="{4273EDBD-AC1D-40d3-9FB2-095C621B552D}" datafieldname="${escapeXml(definition.fieldName)}" />
                </cell>
              </row>`;

  // Try to find section by name attribute first
  let sectionRegex = new RegExp(`(<section[^>]*\\sname="${escapeXml(sectionName)}"[^>]*>[\\s\\S]*?<rows>)([\\s\\S]*?)(<\\/rows>)`, 'i');
  let match = formXml.match(sectionRegex);

  // If not found by name, try finding by label description
  if (!match) {
    sectionRegex = new RegExp(`(<section[^>]*>[\\s\\S]*?<label\\s+description="${escapeXml(sectionName)}"[^/]*/>[\\s\\S]*?<rows>)([\\s\\S]*?)(<\\/rows>)`, 'i');
    match = formXml.match(sectionRegex);
  }

  // If still not found, try finding by ID (guid format)
  if (!match && (sectionName.startsWith('{') || sectionName.match(/^[0-9a-f-]+$/i))) {
    const cleanId = sectionName.replace(/[{}]/g, '');
    sectionRegex = new RegExp(`(<section[^>]*\\sid="\\{?${cleanId}\\}?"[^>]*>[\\s\\S]*?<rows>)([\\s\\S]*?)(<\\/rows>)`, 'i');
    match = formXml.match(sectionRegex);
  }

  if (!match) {
    throw new Error(`Section '${sectionName}' not found in FormXML (searched by name, label, and id)`);
  }

  // Insert row before </rows>
  return formXml.replace(sectionRegex, `$1$2${cellXml}$3`);
}

/**
 * Remove a control/field from FormXML by field name
 */
export function removeControl(formXml: string, fieldName: string): string {
  // Match the row containing the control with the specified datafieldname
  const controlRegex = new RegExp(`<row>[\\s\\S]*?<control[^>]*\\sdatafieldname="${escapeXml(fieldName)}"[^>]*\\/>[\\s\\S]*?<\\/row>`, 'i');

  // Also match self-closing control within row
  const controlRegex2 = new RegExp(`<row>[\\s\\S]*?<control[^>]*\\sdatafieldname="${escapeXml(fieldName)}"[^>]*>[\\s\\S]*?<\\/control>[\\s\\S]*?<\\/row>`, 'i');

  let match = formXml.match(controlRegex);
  if (!match) {
    match = formXml.match(controlRegex2);
  }

  if (!match) {
    throw new Error(`Control with field '${fieldName}' not found in FormXML`);
  }

  return formXml.replace(match[0], '');
}

/**
 * Update tab properties in FormXML
 */
export function updateTab(formXml: string, tabName: string, updates: Partial<TabDefinition>): string {
  let result = formXml;

  // Find the tab
  const tabRegex = new RegExp(`(<tab[^>]*\\sname="${escapeXml(tabName)}")([^>]*>)`, 'i');
  const match = result.match(tabRegex);

  if (!match) {
    throw new Error(`Tab '${tabName}' not found in FormXML`);
  }

  let tabAttrs = match[1] + match[2];

  // Update attributes
  if (updates.visible !== undefined) {
    tabAttrs = tabAttrs.replace(/visible="[^"]*"/, `visible="${updates.visible}"`);
  }
  if (updates.expanded !== undefined) {
    tabAttrs = tabAttrs.replace(/expanded="[^"]*"/, `expanded="${updates.expanded}"`);
  }
  if (updates.showLabel !== undefined) {
    tabAttrs = tabAttrs.replace(/showlabel="[^"]*"/, `showlabel="${updates.showLabel}"`);
  }

  result = result.replace(tabRegex, tabAttrs);

  // Update label if provided
  if (updates.label !== undefined) {
    const labelRegex = new RegExp(`(<tab[^>]*\\sname="${escapeXml(tabName)}"[^>]*>[\\s\\S]*?<labels>[\\s\\S]*?<label\\s+description=")[^"]*("\\s+languagecode="1033"[^/]*/>[\\s\\S]*?</labels>)`, 'i');
    result = result.replace(labelRegex, `$1${escapeXml(updates.label)}$2`);
  }

  return result;
}

/**
 * Get a summary of the form structure
 */
export function getFormStructureSummary(form: ParsedForm): string {
  const lines: string[] = [];

  for (const tab of form.tabs) {
    lines.push(`Tab: ${tab.name} (${tab.label || 'no label'})`);

    for (let colIdx = 0; colIdx < tab.columns.length; colIdx++) {
      const col = tab.columns[colIdx];

      for (const section of col.sections) {
        lines.push(`  Section: ${section.name} (${section.label || 'no label'})`);

        const fields: string[] = [];
        for (const row of section.rows) {
          for (const cell of row.cells) {
            if (cell.control?.datafieldname) {
              fields.push(cell.control.datafieldname);
            }
          }
        }

        if (fields.length > 0) {
          lines.push(`    Fields: ${fields.join(', ')}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Find all controls/fields in a parsed form
 */
export function getAllControls(form: ParsedForm): FormControl[] {
  const controls: FormControl[] = [];

  for (const tab of form.tabs) {
    for (const col of tab.columns) {
      for (const section of col.sections) {
        for (const row of section.rows) {
          for (const cell of row.cells) {
            if (cell.control) {
              controls.push(cell.control);
            }
          }
        }
      }
    }
  }

  // Also check header and footer
  const headerFooterRows = [
    ...(form.header?.rows || []),
    ...(form.footer?.rows || []),
  ];

  for (const row of headerFooterRows) {
    for (const cell of row.cells) {
      if (cell.control) {
        controls.push(cell.control);
      }
    }
  }

  return controls;
}

/**
 * Check if a field exists in the form
 */
export function hasField(form: ParsedForm, fieldName: string): boolean {
  const controls = getAllControls(form);
  return controls.some(c => c.datafieldname?.toLowerCase() === fieldName.toLowerCase());
}

/**
 * Find section by name
 */
export function findSection(form: ParsedForm, sectionName: string): { tab: FormTab; section: FormSection } | null {
  for (const tab of form.tabs) {
    for (const col of tab.columns) {
      for (const section of col.sections) {
        if (section.name.toLowerCase() === sectionName.toLowerCase()) {
          return { tab, section };
        }
      }
    }
  }
  return null;
}

/**
 * Find tab by name
 */
export function findTab(form: ParsedForm, tabName: string): FormTab | null {
  return form.tabs.find(t => t.name.toLowerCase() === tabName.toLowerCase()) || null;
}
