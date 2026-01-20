/**
 * Pre-defined PowerPlatform prompt templates.
 */
export const powerPlatformPrompts = {
  // Entity exploration prompts
  ENTITY_OVERVIEW: (entityName: string) =>
    `## Power Platform Entity: ${entityName}\n\n` +
    `This is an overview of the '${entityName}' entity in Microsoft Power Platform/Dataverse:\n\n` +
    `### Entity Details\n{{entity_details}}\n\n` +
    `### Attributes\n{{key_attributes}}\n\n` +
    `### Relationships\n{{relationships}}\n\n` +
    `You can query this entity using OData filters against the plural name.`,

  ATTRIBUTE_DETAILS: (entityName: string, attributeName: string) =>
    `## Attribute: ${attributeName}\n\n` +
    `Details for the '${attributeName}' attribute of the '${entityName}' entity:\n\n` +
    `{{attribute_details}}\n\n` +
    `### Usage Notes\n` +
    `- Data Type: {{data_type}}\n` +
    `- Required: {{required}}\n` +
    `- Max Length: {{max_length}}`,

  // Query builder prompts
  QUERY_TEMPLATE: (entityNamePlural: string) =>
    `## OData Query Template for ${entityNamePlural}\n\n` +
    `Use this template to build queries against the ${entityNamePlural} entity:\n\n` +
    `\`\`\`\n${entityNamePlural}?$select={{selected_fields}}&$filter={{filter_conditions}}&$orderby={{order_by}}&$top={{max_records}}\n\`\`\`\n\n` +
    `### Common Filter Examples\n` +
    `- Equals: \`name eq 'Contoso'\`\n` +
    `- Contains: \`contains(name, 'Contoso')\`\n` +
    `- Greater than date: \`createdon gt 2023-01-01T00:00:00Z\`\n` +
    `- Multiple conditions: \`name eq 'Contoso' and statecode eq 0\``,

  // Relationship exploration prompts
  RELATIONSHIP_MAP: (entityName: string) =>
    `## Relationship Map for ${entityName}\n\n` +
    `This shows all relationships for the '${entityName}' entity:\n\n` +
    `### One-to-Many Relationships (${entityName} as Primary)\n{{one_to_many_primary}}\n\n` +
    `### One-to-Many Relationships (${entityName} as Related)\n{{one_to_many_related}}\n\n` +
    `### Many-to-Many Relationships\n{{many_to_many}}\n\n`,
};
