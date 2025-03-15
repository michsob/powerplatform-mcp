# PowerPlatform MCP Server

A Model Context Protocol (MCP) server for PowerPlatform/Dataverse entities. This tool provides access to entity metadata and attributes in the PowerPlatform environment.

## Installation

You can install and run this tool in two ways:

### Option 1: Install globally

```bash
npm install -g powerplatform-mcp
```

Then run it:

```bash
powerplatform-mcp
```

### Option 2: Run directly with npx

Run without installing:

```bash
npx powerplatform-mcp
```

## Configuration

Before running, set the following environment variables:

```bash
# PowerPlatform/Dataverse connection details
POWERPLATFORM_URL=https://yourenvironment.crm.dynamics.com
POWERPLATFORM_CLIENT_ID=your-azure-app-client-id
POWERPLATFORM_CLIENT_SECRET=your-azure-app-client-secret
POWERPLATFORM_TENANT_ID=your-azure-tenant-id
```

## Usage

This is an MCP server designed to work with MCP-compatible clients like GitHub Copilot. Once running, it will expose tools for retrieving PowerPlatform entity metadata.

### Available Tools

- `get-entity-metadata`: Get metadata about a PowerPlatform entity
- `get-entity-attributes`: Get attributes/fields of a PowerPlatform entity

## License

MIT