# PowerPlatform MCP / CLI

A Model Context Protocol (MCP) server **and** standalone CLI for querying **and configuring** PowerPlatform / Dataverse environments. Supports multiple environments, entity metadata, records, plugins, flows, solutions, workflows, business rules, security roles, custom APIs, web resources, and more — including write operations for automated environment setup.

## Why MCP + CLI?

**MCP** integrates directly with AI clients (Claude, Cursor, GitHub Copilot) for interactive, conversational exploration of your environments.

**CLI** writes results to a **file system cache** instead of returning them inline. MCP tool responses are bound by the AI client's context window, which can truncate or degrade results when querying environments with hundreds of entities, flows, or plugin steps. The CLI avoids this limitation by persisting full results to disk, making them available for follow-up analysis without context pressure. Both interfaces share the same tools and capabilities.

## Installation

Requires **Node.js 22+** (< 25).

### MCP Server

```bash
npm install -g powerplatform-mcp
# or
npx powerplatform-mcp
```

### CLI

```bash
npm install -g powerplatform-cli
# or
npx powerplatform-cli
```

### Docker

```bash
# MCP Server
docker pull ghcr.io/michsob/powerplatform-mcp
docker run --env-file .env ghcr.io/michsob/powerplatform-mcp

# CLI
docker pull ghcr.io/michsob/powerplatform-cli
docker run --env-file .env ghcr.io/michsob/powerplatform-cli entity-attributes account
```

## Configuration

The tool supports **multiple environments**. Define them via environment variables:

```bash
POWERPLATFORM_ENVIRONMENTS=DEV,UAT,PROD

# For each environment, set:
POWERPLATFORM_DEV_URL=https://dev-org.crm.dynamics.com
POWERPLATFORM_DEV_CLIENT_ID=your-client-id
POWERPLATFORM_DEV_CLIENT_SECRET=your-client-secret
POWERPLATFORM_DEV_TENANT_ID=your-tenant-id

POWERPLATFORM_UAT_URL=https://uat-org.crm.dynamics.com
POWERPLATFORM_UAT_CLIENT_ID=...
POWERPLATFORM_UAT_CLIENT_SECRET=...
POWERPLATFORM_UAT_TENANT_ID=...
```

For local development, copy `.env.example` to `.env` and fill in your credentials.

Optionally, `POWERPLATFORM_ENVIRONMENT_ID` sets the Power Platform environment id that the Flow API calls use (flow run details, cancel, resubmit). Without it, the id is looked up from Dataverse.

The Flow API (api.flow.microsoft.com) refuses an app registration that has no maker access in the environment, whatever its Dataverse security roles. You'll see this as `403 EnvironmentAccessDenied`. Run lists, with each run's status and error, come from Dataverse and keep working.

## MCP Server

The MCP server is designed for AI-powered clients (Claude, Cursor, GitHub Copilot).

### Available MCP Tools (66)

All tools accept an optional `environment` parameter to target a specific environment (defaults to the first configured).

List tools stop at `maxRecords` and say so: `hasMore` is true when more rows match, `requestedMax` is the cap, and `totalMatching` is the full count when Dataverse counted it (up to 5,000). When the list was cut, a warning comes before the data. Caps above 5,000 are read page by page.

#### Entity

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-entity-metadata` | Get entity metadata | `entityName` | |
| `get-entity-attributes` | List all attributes/fields | `entityName` | |
| `get-entity-attribute` | Get a specific attribute | `entityName`, `attributeName` | |
| `get-entity-relationships` | Get 1:N and N:N relationships | `entityName` | |
| `create-entity-string-attribute` | Create a Single Line of Text column | `entityName`, `schemaName`, `displayName` | `maxLength`, `requiredLevel`, `description`, `solutionName` |
| `get-entity-keys` | List alternate keys on an entity | `entityName` | |
| `create-entity-alternate-key` | Create an alternate key | `entityName`, `schemaName`, `displayName`, `keyAttributes` | `languageCode`, `solutionName` |

#### Records

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-record` | Get a record by ID | `entityNamePlural`, `recordId` | |
| `query-records` | OData query | `entityNamePlural`, `filter` | `maxRecords` (default 50) |

#### Plugins

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-plugin-assemblies` | List plugin assemblies | | `includeManaged`, `maxRecords` |
| `get-plugin-assembly-complete` | Assembly with types, steps, images | `assemblyName` | `includeDisabled` |
| `get-entity-plugin-pipeline` | Plugins executing on an entity | `entityName` | `messageFilter`, `includeDisabled` |
| `get-plugin-trace-logs` | Plugin trace logs | | `entityName`, `messageName`, `correlationId`, `pluginStepId`, `exceptionOnly`, `hoursBack`, `maxRecords` |
| `get-all-plugin-steps` | All SDK message processing steps | | `includeDisabled`, `maxRecords` |
| `get-plugin-type` | Look up a plugin type by class name | `typeName` | |
| `get-sdk-message` | Look up an SDK message by name | `messageName` | |
| `create-plugin-step` | Register a plugin step | `name`, `pluginTypeId`, `sdkMessageId`, `stage`, `mode` | `rank`, `supportedDeployment`, `description`, `configuration`, `sdkMessageFilterId`, `solutionName` |

#### Flows (Power Automate)

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-flows` | List cloud flows (smart filtering) | | `activeOnly`, `maxRecords`, `nameContains`, `excludeSystem`, `excludeCustomerInsights`, `excludeCopilotSales` |
| `search-workflows` | Search workflows and flows | | `name`, `primaryEntity`, `description`, `category`, `statecode`, `includeDescription`, `maxResults` |
| `get-flow-definition` | Full definition or parsed summary | `flowId` | `summary` |
| `get-flow-runs` | Flow run history | `flowId` | `status`, `startedAfter`, `startedBefore`, `maxRecords` |
| `get-flow-run-details` | Run details with action-level errors | `flowId`, `runId` | |
| `cancel-flow-run` | Cancel a running/waiting run | `flowId`, `runId` | |
| `resubmit-flow-run` | Retry a failed run | `flowId`, `runId` | |
| `scan-flow-health` | Batch health scan (success rates) | | `daysBack`, `maxRunsPerFlow`, `maxFlows`, `activeOnly` |
| `get-flow-inventory` | Lightweight flow inventory | | `maxRecords` |

#### Solutions

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-publishers` | List publishers, with `isreadonly` (read-only ones came with managed solutions) | | `writableOnly` |
| `get-solutions` | List visible solutions | | |
| `get-solution` | Get solution by unique name | `uniqueName` | |
| `get-solution-components` | List components in a solution | `solutionUniqueName` | |
| `export-solution` | Export solution (base64) | `solutionName` | `managed` |
| `add-solution-component` | Add a component to a solution | `solutionUniqueName`, `componentId`, `componentType` | `addRequiredComponents` |
| `publish-customizations` | Publish entity or all customizations | | `entityLogicalName` |

#### Workflows (Classic)

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-workflows` | List classic workflows | | `activeOnly`, `maxRecords` |
| `get-workflow-definition` | XAML definition or summary | `workflowId` | `summary` |
| `get-ootb-workflows` | Background, BPFs, actions, on-demand | | `maxRecords`, `categories` |

#### Business Rules

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-business-rules` | List business rules | | `activeOnly`, `maxRecords` |
| `get-business-rule` | Business rule with XAML | `workflowId` | |

#### Option Sets

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `get-global-option-set` | Get a global option set definition | `optionSetName` |

#### Configuration

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-connection-references` | Connection references | | `maxRecords`, `managedOnly`, `hasConnection`, `inactive` |
| `get-environment-variables` | Environment variable definitions + values, with the effective value (credential values masked) | | `maxRecords`, `managedOnly` |
| `create-environment-variable` | Create an environment variable definition | `schemaName`, `displayName`, `type` | `defaultValue`, `description`, `solutionName` |
| `set-environment-variable-value` | Set or update an environment variable value | `definitionId`, `value` | `existingValueId` |

#### Custom APIs

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-custom-apis` | List Custom API definitions | | `maxRecords`, `includeManaged` |
| `get-custom-api` | Get a Custom API by unique name | `uniqueName` | |
| `create-custom-api` | Create a Custom API definition | `uniqueName`, `name`, `displayName`, `bindingType`, `isFunction`, `isPrivate`, `allowedCustomProcessingStepType` | `description`, `pluginTypeId`, `pluginTypeName`, `boundEntityLogicalName`, `solutionName` |
| `get-custom-api-response-properties` | List response properties | `customApiId` | |
| `create-custom-api-response-property` | Create a response property | `customApiId`, `uniqueName`, `name`, `displayName`, `type` | `description`, `logicalEntityName`, `isOptional`, `solutionName` |
| `get-custom-api-request-parameters` | List request parameters | `customApiId` | |
| `create-custom-api-request-parameter` | Create a request parameter | `customApiId`, `uniqueName`, `name`, `displayName`, `type` | `description`, `logicalEntityName`, `isOptional`, `solutionName` |

#### Web Resources

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-web-resources` | List web resources | | `maxRecords`, `webResourceType`, `nameFilter` |
| `get-web-resource` | Get a web resource by name | `name` | |
| `create-web-resource` | Upload a new web resource | `name`, `displayName`, `webResourceType`, `content` | `description`, `solutionName` |

#### Security Roles

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-security-roles` | List customizable security roles | | `solutionUniqueName`, `excludeSystemRoles`, `includePrivileges`, `maxRecords` |
| `get-security-role-privileges` | Privileges for a role (name, accessright, depth mask) | `roleId` | `entityFilter`, `accessRightFilter` |
| `list-privileges` | Browse the system privilege catalog to discover `privilegeId` GUIDs and supported depths | | `entityFilter`, `accessRightFilter`, `maxRecords` |
| `create-security-role` | Create a new role (defaults to root BU); optional `solutionUniqueName` adds it to a solution in one step | `name` | `businessUnitId`, `description`, `solutionUniqueName` |
| `clone-security-role` | Clone a role with its privileges. Uses `CloneAsRole` with a create-then-copy fallback when the action isn't available | `sourceRoleId` | `newName`, `targetBusinessUnitId`, `solutionUniqueName` |
| `update-security-role` | Update a role's name, description, or business unit | `roleId` | `name`, `description`, `businessUnitId`, `solutionUniqueName` |
| `delete-security-role` | Delete a role (destructive — requires `confirm: true`) | `roleId`, `confirm` | |
| `add-security-role-privileges` | Append privileges to a role (`AddPrivilegesRole` — leaves existing privileges intact) | `roleId`, `privileges[]` | |
| `remove-security-role-privileges` | Remove privileges from a role (loops `RemovePrivilegeRole`) | `roleId`, `privilegeIds[]` | |
| `replace-security-role-privileges` | Wipe and replace the full privilege set (`ReplacePrivilegesRole` — destructive, requires `confirm: true`) | `roleId`, `privileges[]`, `confirm` | |

Each item in `privileges[]` is `{ privilegeId, depth, businessUnitId? }`. Depth is one of `Basic` (user), `Local` (BU), `Deep` (BU + child), `Global` (org).

#### Dependencies

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `check-component-dependencies` | Dependencies blocking deletion | `componentId`, `componentType` |
| `check-delete-eligibility` | Check if a component can be deleted | `componentId`, `componentType` |

#### Service Endpoints

| Tool | Description | Optional |
|------|-------------|----------|
| `get-service-endpoints` | Service Bus, webhooks, Event Hub, Event Grid | `maxRecords` |

### MCP Prompts

| Prompt | Description | Required Args |
|--------|-------------|---------------|
| `entity-overview` | Entity overview with key attributes and relationships | `entityName` |
| `attribute-details` | Detailed attribute info (type, format, requirements) | `entityName`, `attributeName` |
| `query-template` | OData query template with example filters | `entityName` |
| `relationship-map` | Complete 1:N and N:N relationship map | `entityName` |

---

## CLI

Same tools as the MCP server, but results are cached to the file system for full-fidelity output on large data sets.

### Global Option

`--env <name>` — target environment (defaults to first configured).

A list command that stops at `--max` prints a `⚠` line saying so, with the total when Dataverse counted it. `flow-health` also warns when a flow had more runs in the window than `--max-runs` (its success rate then covers the latest runs only), when it stopped at `--max-flows`, and when a flow's runs couldn't be read.

### Commands

#### Entity
```
entity-metadata <entityName>
entity-attributes <entityName>
entity-attribute <entityName> <attributeName>
entity-relationships <entityName>
entity-keys <entityName>
create-entity <schemaName> <displayName> <displayCollectionName>  [--primary-name-schema <name>] [--primary-name-display <name>] [--description <desc>] [--ownership <UserOwned|OrganizationOwned>] [--has-activities] [--has-notes] [--solution <name>]
create-entity-string-attribute <entityName> <schemaName> <displayName>  [--max-length <n>] [--required-level <level>] [--description <desc>] [--solution <name>]
create-entity-memo-attribute <entityName> <schemaName> <displayName>  [--max-length <n>] [--required-level <level>] [--description <desc>] [--solution <name>]
create-entity-file-attribute <entityName> <schemaName> <displayName>  [--max-size-kb <n>] [--required-level <level>] [--description <desc>] [--solution <name>]
create-entity-integer-attribute <entityName> <schemaName> <displayName>  [--min <n>] [--max <n>] [--required-level <level>] [--description <desc>] [--solution <name>]
create-entity-decimal-attribute <entityName> <schemaName> <displayName>  [--precision <n>] [--min <n>] [--max <n>] [--required-level <level>] [--description <desc>] [--solution <name>]
create-entity-money-attribute <entityName> <schemaName> <displayName>  [--precision-source <0|1|2>] [--precision <n>] [--min <n>] [--max <n>] [--required-level <level>] [--description <desc>] [--solution <name>]
create-entity-boolean-attribute <entityName> <schemaName> <displayName>  [--true-label <label>] [--false-label <label>] [--default-value <true|false>] [--required-level <level>] [--description <desc>] [--solution <name>]
create-entity-datetime-attribute <entityName> <schemaName> <displayName>  [--format <DateOnly|DateAndTime>] [--behavior <UserLocal|DateOnly|TimeZoneIndependent>] [--required-level <level>] [--description <desc>] [--solution <name>]
create-entity-picklist-attribute <entityName> <schemaName> <displayName>  [-o <value:label>]... | [--global-option-set <name>] [--default-value <value>] [--required-level <level>] [--description <desc>] [--language-code <lcid>] [--solution <name>]
create-entity-lookup <referencingEntity> <referencedEntity> <relationshipSchemaName> <lookupSchemaName> <displayName>  [--required-level <level>] [--description <desc>] [--cascade-delete <NoCascade|RemoveLink|Restrict|Cascade>] [--solution <name>]
create-entity-alternate-key <entityName> <schemaName> <displayName> <keyAttributes...>  [--language-code <lcid>] [--solution <name>]
delete-entity-alternate-key <entityName> <keyName>
set-entity-change-tracking <entityName> <on|off>  [--solution <name>] [--no-publish]
delete-entity-attribute <entityName> <attributeName>
```

#### Records
```
record <entityNamePlural> <recordId>
query-records <entityNamePlural> <filter>  [--max <n>]
create-record <entityNamePlural> <jsonBody>
update-record <entityNamePlural> <recordId> <jsonBody>
delete-record <entityNamePlural> <recordId>
associate-records <entityNamePlural> <recordId> <navigationProperty> <relatedEntityNamePlural> <relatedRecordId>
disassociate-records <entityNamePlural> <recordId> <navigationProperty> [relatedRecordId]
```

#### Plugins
```
plugin-assemblies                          [--include-managed] [--max <n>]
plugin-assembly <assemblyName>             [--include-disabled]
plugin-packages                            [--include-managed] [--max <n>]
plugin-type <typeName>
entity-pipeline <entityName>               [--message <msg>] [--include-disabled]
plugin-trace-logs                          [--entity <name>] [--message <msg>] [--correlation-id <id>] [--step-id <id>] [--hours <n>] [--max <n>] [--exceptions-only]
all-plugin-steps                           [--include-disabled] [--max <n>]
sdk-message <messageName>
register-plugin-package <filePath>         --name <name> --unique-name <uniqueName> [--pkg-version <version>] [--solution <name>]
update-plugin-package <filePath>           --plugin-package-id <id> [--pkg-version <version>]
create-plugin-step <name> <pluginTypeId> <sdkMessageId>  [--stage <n>] [--mode <n>] [--rank <n>] [--supported-deployment <n>] [--description <desc>] [--configuration <cfg>] [--message-filter-id <id>] [--solution <name>]
create-plugin-step-image <stepId>          [--name <name>] [--entity-alias <alias>] [--image-type <0|1|2>] [--message-property-name <name>] [--attributes <csv>]
```

#### Flows
```
flows                                      [--active] [--name <contains>] [--include-managed] [--max <n>]
flow-definition <flowId>                   [--summary]
flow-inventory                             [--max <n>]
flow-runs <flowId>                         [--status <s>] [--after <iso>] [--before <iso>] [--max <n>]
flow-run-details <flowId> <runId>
flow-health                                [--days <n>] [--max-runs <n>] [--max-flows <n>] [--active]
search-workflows                           [--name <name>] [--entity <entity>] [--category <n>] [--active] [--max <n>]
create-cloud-flow <clientDataFile>         --name <name> [--primary-entity <entity>] [--solution <name>]
activate-flow <flowId>
deactivate-flow <flowId>
```

#### Solutions
```
solutions
solution <uniqueName>
solution-components <uniqueName>
publishers                                 [--writable-only]
add-solution-component <solutionUniqueName> <componentId> <componentType>  [--add-required]
publish-customizations                     [--entity <logicalName>]
```

#### Workflows
```
workflows                                  [--active] [--max <n>]
workflow-definition <workflowId>           [--summary]
ootb-workflows                             [--categories <0,1,2,3,4>] [--max <n>]
```

#### Business Rules
```
business-rules                             [--active] [--max <n>]
business-rule <workflowId>
```

#### Option Sets
```
optionset <optionSetName>
```

#### Dependencies
```
check-dependencies <componentId> <componentType>
```

#### Configuration
```
connection-references                      [--managed-only] [--has-connection] [--no-connection] [--inactive] [--max-records <n>]
create-connection-reference <logicalName> <displayName> <connectorId>  [--description <desc>] [--solution <name>]
environment-variables                      [--managed-only] [--max-records <n>] [--show-values]
create-environment-variable <schemaName> <displayName>  [--type <type>] [--default-value <val>] [--description <desc>] [--solution <name>]
set-environment-variable-value <definitionId> <value>   [--existing-value-id <id>]
```

`environment-variables` and the `get-environment-variables` tool mask credential values as `*** (N chars)`. A value is masked when the variable is Secret-type, its name looks like a credential (secret, password, key, token, connection string, …), the value itself looks like one (a JWT, `AccountKey=`, `Bearer …`), or it is JSON with a credential-named key. Each variable says `valueMasked` and `maskReason`. `plaintextCredential` flags a literal credential stored in place of a Key Vault reference. The MCP tool always masks; the CLI prints and caches values in clear only with `--show-values`.

#### Custom APIs
```
custom-apis                                [--include-managed] [--max <n>]
custom-api <uniqueName>
create-custom-api <uniqueName> <displayName>  [--binding-type <n>] [--bound-entity <name>] [--is-function] [--is-private] [--processing-type <n>] [--plugin-type-id <id>] [--plugin-type-name <name>] [--description <desc>] [--solution <name>]
custom-api-response-properties <customApiId>
create-custom-api-response-property <customApiId> <uniqueName> <displayName>  [--type <n>] [--description <desc>] [--logical-entity <name>] [--solution <name>]
custom-api-request-parameters <customApiId>
create-custom-api-request-parameter <customApiId> <uniqueName> <displayName>  [--type <n>] [--description <desc>] [--logical-entity <name>] [--optional] [--solution <name>]
```

#### Web Resources
```
web-resources                              [--type <n>] [--name <contains>] [--max <n>]
web-resource <name>
create-web-resource <name> <displayName> <filePath>  [--type <n>] [--description <desc>] [--solution <name>]
set-entity-icon <entityName> <svgFilePath>  [--solution <name>] [--web-resource-name <name>] [--display-name <name>] [--no-publish]
```

#### Forms & Views
```
entity-forms <entityName>                  [--type <n>]
entity-form-fields <formId>
add-form-field <entityName> <formId> <attributeName>
remove-form-field <entityName> <formId> <attributeName>
set-form-layout <entityName> <formId> <layoutFile>       [--dry-run]
entity-views <entityName>
add-view-column <entityName> <viewId> <attributeName>   [--width <n>]
set-view-columns <entityName> <viewId> <columns...>     [--order-by <attr>] [--desc] [--find-columns <a,b>]
create-view <entityName> <name> <columns...>            [--order-by <attr>] [--desc] [--description <text>] [--state <active|inactive|all>] [--filter-xml <xml>] [--solution <name>]
remove-view-column <entityName> <viewId> <attributeName>
```

`set-view-columns` takes columns as `name:width` (e.g. `contoso_name:250`) and keeps the view's filters. On a Quick Find view, `--find-columns` also replaces the text and lookup columns the search box matches on.

`create-view` creates a public view on the table. If the table already has a view with that name, it updates that view instead, so you can safely run it again. By default the view lists active records; `--filter-xml` adds extra FetchXML `<filter>` elements.

`set-form-layout` replaces the form's tabs with the layout in a JSON file. It also replaces the header if the file has a `header` key; leave the key out to keep the current header, or set it to `[]` to remove it. Events, libraries, navigation and the footer are kept.
- **Fields:** an item is a column logical name, or an object when it needs other settings. Labels default to the column's display name, and each control gets the classid for its column type.
- **Ids:** tab, section and cell ids are derived from the form id and names. Re-applying a layout keeps the same ids.
- **Checks:** the command rejects unknown or duplicate columns. It lists any custom columns left off the form.
- **`--dry-run`:** builds the formxml into the cache without saving it.

```json
{
  "header": [{ "field": "contoso_score", "readOnly": true }, "contoso_band"],
  "tabs": [{
    "name": "general", "label": "General",
    "columns": [
      { "width": "66%", "sections": [
        { "name": "details", "label": "Details", "items": ["contoso_name", { "field": "contoso_points", "readOnly": true }] },
        { "name": "points", "label": "Points", "columns": 2, "items": ["contoso_bonuspoints", "contoso_basepoints"] },
        { "name": "tasks", "label": "Tasks", "showLabel": false, "items": [{
          "subgrid": "Tasks", "label": "Tasks", "entity": "contoso_task",
          "relationship": "contoso_project_contoso_task_projectid",
          "viewId": "00000000-0000-0000-0000-000000000001", "recordsPerPage": 10
        }] },
        { "name": "hidden", "label": "Hidden", "visible": false, "items": ["contoso_state"] }
      ] },
      { "width": "34%", "sections": [
        { "name": "system", "label": "System", "items": [{ "field": "createdon", "readOnly": true }, { "field": "ownerid", "visible": false }] }
      ] }
    ]
  }]
}
```

A tab can give `sections` in place of `columns`, as shorthand for a single 100% column. These are the item options:

| Item | Options |
|------|---------|
| Field | `field`, `label`, `readOnly`, `visible`, `showLabel` |
| Subgrid | `subgrid` (control name), `label`, `entity`, `relationship` (leave out to list all records), `viewId`, `recordsPerPage` (default 5), `enableViewPicker`, `enableQuickFind`, `showLabel`, `visible` |

Sections take `name`, `label`, `showLabel`, `visible`, `columns` (1–4) and `items`; tabs take `name`, `label`, `showLabel`, `visible`, `expanded` and `columns` or `sections`. Subgrids are written without `rowspan`: Unified Interface sizes the grid from `recordsPerPage`, and a `rowspan` would hide the cells below it.

#### PAC Integration
```
pac-auth                                   Authenticate pac CLI using environment credentials
generate-models <outdirectory>             [--settings <path>] [--entities <filter>] [--namespace <ns>]
deploy-plugin <pluginFile>                 --plugin-id <id> [--type <Nuget|Assembly>] [--configuration <config>]
```

#### Security Roles
```
security-roles                             [--solution <name>] [--include-system] [--include-privileges] [--max-records <n>]
security-role-privileges <roleId>          [--entity <name>] [--access-right <type>]
privileges                                 [--entity <name>] [--access-right <type>] [--max-records <n>]
create-security-role                       --name <name> [--bu <id>] [--description <desc>] [--solution <name>]
clone-security-role <sourceRoleId>         [--name <name>] [--target-bu <id>] [--solution <name>]
update-security-role <roleId>              [--name <name>] [--description <desc>] [--bu <id>] [--solution <name>]
delete-security-role <roleId>              --yes
add-role-privileges <roleId>               --privileges <spec>     # JSON array or shorthand <guid>:<Basic|Local|Deep|Global>,...
remove-role-privileges <roleId>            --privileges <id,id,id>
replace-role-privileges <roleId>           --privileges <spec> --yes
```

#### Service Endpoints
```
service-endpoints                          [--max <n>]
```

---

## Development

```bash
git clone https://github.com/michsob/powerplatform-mcp.git
cd powerplatform-mcp
npm install
cp .env.example .env   # fill in credentials
npm run build
npm run inspector      # test with MCP Inspector
```

## Releasing

To publish a new version:

1. Update `version` in `package.json` and `package.cli.json` (the CLI is published with the version from `package.json`; keep the two in step)
2. Merge the change to `main`
3. Tag that commit on `main` with the same version and push the tag:
   ```bash
   VERSION=v$(node -p "require('./package.json').version")
   git tag "$VERSION"
   git push origin "$VERSION"
   ```
   The publish workflow refuses a tag that is not on `main` or does not match `package.json`.

GitHub Actions will automatically publish:

| Package | npm | GitHub Packages | Docker (GHCR) |
|---------|-----|-----------------|---------------|
| MCP Server | `npm i powerplatform-mcp` | `npm i @michsob/powerplatform-mcp` | `ghcr.io/michsob/powerplatform-mcp` |
| CLI | `npm i powerplatform-cli` | `npm i @michsob/powerplatform-cli` | `ghcr.io/michsob/powerplatform-cli` |

npm publishing uses [Trusted Publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/) — no tokens or secrets needed. GitHub Packages and GHCR use the built-in `GITHUB_TOKEN` automatically.

## License

MIT

<a href="https://glama.ai/mcp/servers/@michsob/powerplatform-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@michsob/powerplatform-mcp/badge" alt="PowerPlatform MCP server" />
</a>

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/michsob-powerplatform-mcp-badge.png)](https://mseep.ai/app/michsob-powerplatform-mcp)
