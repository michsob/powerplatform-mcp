# PowerPlatform MCP / CLI

A Model Context Protocol (MCP) server **and** standalone CLI for querying PowerPlatform / Dataverse environments. Supports multiple environments, entity metadata, records, plugins, flows, solutions, workflows, business rules, security roles, and more.

## Why MCP + CLI?

**MCP** integrates directly with AI clients (Claude, Cursor, GitHub Copilot) for interactive, conversational exploration of your environments.

**CLI** writes results to a **file system cache** instead of returning them inline. MCP tool responses are bound by the AI client's context window, which can truncate or degrade results when querying environments with hundreds of entities, flows, or plugin steps. The CLI avoids this limitation by persisting full results to disk, making them available for follow-up analysis without context pressure. Both interfaces share the same tools and capabilities.

## Installation

```bash
# Install globally
npm install -g powerplatform-mcp

# Or run directly
npx powerplatform-mcp
```

Requires **Node.js 22+** (< 25).

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

## MCP Server

The MCP server is designed for AI-powered clients (Claude, Cursor, GitHub Copilot). Start it with:

```bash
powerplatform-mcp          # if installed globally
npx powerplatform-mcp      # without installing
```

### Docker

```bash
docker build -t powerplatform-mcp .
docker run --env-file .env powerplatform-mcp
```

### Available MCP Tools (38)

All tools accept an optional `environment` parameter to target a specific environment (defaults to the first configured).

#### Entity

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `get-entity-metadata` | Get entity metadata | `entityName` |
| `get-entity-attributes` | List all attributes/fields | `entityName` |
| `get-entity-attribute` | Get a specific attribute | `entityName`, `attributeName` |
| `get-entity-relationships` | Get 1:N and N:N relationships | `entityName` |

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

#### Flows (Power Automate)

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-flows` | List cloud flows (smart filtering) | | `activeOnly`, `maxRecords`, `nameContains`, `excludeSystem`, `excludeCustomerInsights`, `excludeCopilotSales` |
| `search-workflows` | Search workflows and flows | | `name`, `primaryEntity`, `description`, `category`, `statecode`, `maxResults` |
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
| `get-publishers` | List non-readonly publishers | | |
| `get-solutions` | List visible solutions | | |
| `get-solution` | Get solution by unique name | `uniqueName` | |
| `get-solution-components` | List components in a solution | `solutionUniqueName` | |
| `export-solution` | Export solution (base64) | `solutionName` | `managed` |

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

| Tool | Description | Optional |
|------|-------------|----------|
| `get-connection-references` | Connection references | `maxRecords`, `managedOnly`, `hasConnection`, `inactive` |
| `get-environment-variables` | Environment variable definitions + values | `maxRecords`, `managedOnly` |

#### Security Roles

| Tool | Description | Required Params | Optional |
|------|-------------|-----------------|----------|
| `get-security-roles` | List customizable security roles | | `solutionUniqueName`, `excludeSystemRoles`, `includePrivileges`, `maxRecords` |
| `get-security-role-privileges` | Privileges for a role | `roleId` | `entityFilter`, `accessRightFilter` |

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

```bash
# Run via node directly
node build/cli.js <command> [options]
```

### Docker

```bash
docker build -f Dockerfile.cli -t powerplatform-cli .
docker run --env-file .env powerplatform-cli entity-attributes account
```

### Global Option

`--env <name>` — target environment (defaults to first configured).

### Commands

#### Entity
```
entity-metadata <entityName>
entity-attributes <entityName>
entity-attribute <entityName> <attributeName>
entity-relationships <entityName>
```

#### Records
```
record <entityNamePlural> <recordId>
query-records <entityNamePlural> <filter>  [--max <n>]
```

#### Plugins
```
plugin-assemblies                          [--include-managed] [--max <n>]
plugin-assembly <assemblyName>
entity-pipeline <entityName>               [--message <msg>] [--include-disabled]
```

#### Flows
```
flows                                      [--active] [--name <contains>] [--max <n>]
flow-definition <flowId>                   [--summary]
search-workflows                           (interactive filters)
```

#### Solutions
```
solutions
solution <uniqueName>
solution-components <uniqueName>
```

#### Workflows
```
workflows                                  [--active] [--max <n>]
workflow-definition <workflowId>           [--summary]
ootb-workflows                             [--categories <0,1,2,3,4>]
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
environment-variables                      [--managed-only] [--max-records <n>]
```

#### Security Roles
```
security-roles                             [--solution <name>] [--include-system] [--include-privileges] [--max-records <n>]
security-role-privileges <roleId>          [--entity <name>] [--access-right <type>]
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

## License

MIT

<a href="https://glama.ai/mcp/servers/@michsob/powerplatform-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@michsob/powerplatform-mcp/badge" alt="PowerPlatform MCP server" />
</a>

[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/michsob-powerplatform-mcp-badge.png)](https://mseep.ai/app/michsob-powerplatform-mcp)
