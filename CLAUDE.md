# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- `npm run build` - Compile TypeScript to `build/` directory
- `npm run dev` - Build and run the server
- `npm run start` - Run compiled server from `build/index.js`
- `npm run inspector` - Launch MCP Inspector for debugging (uses dotenv-cli)

## Architecture

PowerPlatform MCP Server provides AI assistants access to Microsoft Power Platform/Dataverse through the Model Context Protocol. It connects to Dataverse Web API using Azure MSAL client credentials authentication.

### Core Components

**PowerPlatformClient** (`src/PowerPlatformClient.ts`)
- Base HTTP client with Azure MSAL OAuth2 authentication
- Handles token caching with 5-minute early refresh buffer
- Supports national clouds via optional `POWERPLATFORM_AUTHORITY_URL`

**ServiceContext** (`src/types.ts`)
- Provides lazy initialization of services via getter functions
- All services receive PowerPlatformClient via constructor injection

### Layer Structure

```
src/
├── index.ts              # MCP server entry, tool/prompt registration
├── services/             # Business logic (5 services)
│   ├── EntityService     # Entity metadata, attributes, relationships
│   ├── RecordService     # CRUD operations on records
│   ├── OptionSetService  # Global option set definitions
│   ├── PluginService     # Plugin assembly/step inspection
│   └── DependencyService # Component dependency checking
├── tools/                # MCP tool implementations (Zod validation → service call)
├── prompts/              # MCP prompt templates with dynamic content
└── models/               # API response types (OData wrappers)
```

### Key Patterns

- **Tool Pattern**: Zod schema validates input → service method called → returns structured content + text summary
- **API Responses**: `ApiCollectionResponse<T>` wraps OData `{ value: T[] }` responses
- **Attribute Filtering**: EntityService removes system attributes (msdyn_*, adx_*) and yominame duplicates

## Environment Configuration

Required in `.env` (see `.env.example`):
```
POWERPLATFORM_URL           # Dataverse org URL (e.g., https://org.crm.dynamics.com)
POWERPLATFORM_CLIENT_ID     # Azure app registration client ID
POWERPLATFORM_CLIENT_SECRET # Azure app client secret
POWERPLATFORM_TENANT_ID     # Azure AD tenant ID
POWERPLATFORM_AUTHORITY_URL # Optional: for GCC High/China/Germany clouds
```

## MCP Integration

The server uses stdio transport with JSON-RPC. It registers:
- **12 tools** for querying entities, records, option sets, plugins, dependencies
- **4 prompts** for entity overview, attributes, query building, relationship mapping

Debug with `npm run inspector` which launches the MCP Inspector sidepanel.
