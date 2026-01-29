# Testing the MCP Inspector with the Playwright MCP Server

This guide shows how to use the MCP Inspector alongside the Playwright MCP server to validate that the **create-table** tool works end-to-end.

## Prerequisites

- Power Platform environment credentials set in your shell (`POWERPLATFORM_URL`, `POWERPLATFORM_CLIENT_ID`, `POWERPLATFORM_CLIENT_SECRET`, `POWERPLATFORM_TENANT_ID`).
- A dev environment (do **not** use production) because creating a table is a destructive change.

## 1) Start the MCP Inspector

From the repo root:

```bash
npm run inspector
```

The inspector will print a local URL when it starts (copy that for later).

## 2) Start the Playwright MCP server

Run the Playwright MCP server in another terminal. Use the command recommended by the Playwright MCP server documentation in your environment.

> Tip: If you use the official MCP Playwright package, the command is typically:
>
> ```bash
> npx @modelcontextprotocol/server-playwright
> ```

Note the server URL or transport details so you can add it to the inspector.

## 3) Connect the servers in the Inspector

In the MCP Inspector UI:

1. Add this **PowerPlatform MCP** server (the one started by `npm run inspector`).
2. Add the **Playwright MCP** server (from step 2).

## 4) Use the Inspector to create a table

Open the **create-table** tool in the Inspector and use a payload like the example below (change the prefix to match your environment):

```json
{
  "schemaName": "new_project",
  "displayName": "Project",
  "displayCollectionName": "Projects",
  "description": "Test table created through MCP Inspector",
  "primaryColumnName": "new_name",
  "primaryColumnDisplayName": "Name",
  "primaryColumnMaxLength": 100,
  "ownershipType": "UserOwned"
}
```

When the request succeeds, the response will include a `metadataId` for the table. You should publish customizations before the table is visible in the maker UI.

## 5) (Optional) Drive the UI with Playwright

If you want to validate the UI path as well, use the Playwright MCP server to open the Power Platform maker portal and confirm that the new table is visible after publishing. This is optional but useful for verifying the inspector round-trip in a real UI flow.

## Cleanup

Use the **delete-table** tool when you are done with testing.

```json
{
  "logicalName": "new_project"
}
```
