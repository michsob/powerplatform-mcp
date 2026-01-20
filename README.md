[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/michsob-powerplatform-mcp-badge.png)](https://mseep.ai/app/michsob-powerplatform-mcp)

# PowerPlatform MCP Server

A Model Context Protocol (MCP) server that provides intelligent access to PowerPlatform/Dataverse entities and records. This tool offers context-aware assistance, entity exploration and metadata access.

<a href="https://glama.ai/mcp/servers/@michsob/powerplatform-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@michsob/powerplatform-mcp/badge" alt="PowerPlatform MCP server" />
</a>

Key features:
- Rich entity metadata exploration with formatted, context-aware prompts
- Advanced OData query support with intelligent filtering
- Comprehensive relationship mapping and visualization
- AI-assisted query building and data modeling through AI agent
- Full access to entity attributes, relationships, and global option sets

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

### For Development

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/michsob/powerplatform-mcp.git
   cd powerplatform-mcp
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. Build and test:
   ```bash
   npm run build
   npm run inspector:debug
   ```

## Usage

This is an MCP server designed to work with MCP-compatible clients like Cursor, Claude App and GitHub Copilot. Once running, it will expose tools for retrieving PowerPlatform entity metadata and records.

### Available Tools

- `get-entity-metadata`: Get metadata about a PowerPlatform entity
- `get-entity-attributes`: Get attributes/fields of a PowerPlatform entity
- `get-entity-attribute`: Get a specific attribute/field of a PowerPlatform entity
- `get-entity-relationships`: Get relationships for a PowerPlatform entity
- `get-global-option-set`: Get a global option set definition
- `get-record`: Get a specific record by entity name and ID
- `query-records`: Query records using an OData filter expression
- `use-powerplatform-prompt`: Use pre-defined prompt templates for PowerPlatform entities

## MCP Prompts

The server includes a prompts feature that provides formatted, context-rich information about PowerPlatform entities.

### Available Prompt Types

The `use-powerplatform-prompt` tool supports the following prompt types:

1. **ENTITY_OVERVIEW**: Comprehensive overview of an entity
2. **ATTRIBUTE_DETAILS**: Detailed information about a specific entity attribute
3. **QUERY_TEMPLATE**: OData query template for an entity with example filters
4. **RELATIONSHIP_MAP**: Visual map of entity relationships

### Examples

#### Entity Overview Prompt

```javascript
// Example client code
await mcpClient.invoke("use-powerplatform-prompt", {
  promptType: "ENTITY_OVERVIEW",
  entityName: "account"
});
```

**Output:**
```
## Power Platform Entity: account

This is an overview of the 'account' entity in Microsoft Power Platform/Dataverse:

### Entity Details
- Display Name: Account
- Schema Name: Account
- Description: Business that represents a customer or potential customer
- Primary Key: accountid
- Primary Name: name

### Key Attributes
- name: String (Account Name)
- emailaddress1: String (Email)
- telephone1: String (Main Phone)
- address1_city: String (City)
- statecode: Status (Status)
- accountnumber: String (Account Number)
- industrycode: OptionSetValue (Industry)
- revenue: Money (Annual Revenue)
- ownerid: Owner (Owner)
- createdon: DateTime (Created On)

### Relationships
- One-to-Many Relationships: 42
- Many-to-Many Relationships: 8

You can query this entity using OData filters against the plural name.
```

#### Attribute Details Prompt

```javascript
await mcpClient.invoke("use-powerplatform-prompt", {
  promptType: "ATTRIBUTE_DETAILS",
  entityName: "account",
  attributeName: "revenue"
});
```

**Output:**
```
## Attribute: revenue

Details for the 'revenue' attribute of the 'account' entity:

- Display Name: Annual Revenue
- Description: Annual revenue for the account
- Type: Money
- Format: Currency
- Is Required: No
- Is Searchable: true

### Usage Notes
- Data Type: Money
- Required: No
- Max Length: N/A
```

#### Query Template Prompt

```javascript
await mcpClient.invoke("use-powerplatform-prompt", {
  promptType: "QUERY_TEMPLATE",
  entityName: "account"
});
```

**Output:**
```
## OData Query Template for accounts

Use this template to build queries against the accounts entity:
accounts?$select=name,emailaddress1,telephone1, address1_city,statecode&$filter=name eq 'Example'&$orderby=name asc&$top=50
```

### Common Filter Examples
- Equals: `name eq 'Contoso'`
- Contains: `contains(name, 'Contoso')`
- Greater than date: `createdon gt 2023-01-01T00:00:00Z`
- Multiple conditions: `name eq 'Contoso' and statecode eq 0`
```

#### Relationship Map Prompt

```javascript
await mcpClient.invoke("use-powerplatform-prompt", {
  promptType: "RELATIONSHIP_MAP",
  entityName: "contact"
});
```

**Output:**
```
## Relationship Map for contact

This shows all relationships for the 'contact' entity:

### One-to-Many Relationships (contact as Primary)
- contact_activity_parties: contact (1) → activityparty (N)
- contact_connections1: contact (1) → connection (N)
- contact_connections2: contact (1) → connection (N)
- contact_customer_contacts: contact (1) → contact (N)
- contact_master_contact: contact (1) → contact (N)

### One-to-Many Relationships (contact as Related)
- account_primary_contact: account (1) → contact (N)
- customer_contacts: customer (1) → contact (N)
- system_user_contacts: systemuser (1) → contact (N)

### Many-to-Many Relationships
- contactleads_association: contact (N) ↔ lead (N)
- contactopportunities_association: contact (N) ↔ opportunity (N)
- contactquotes_association: contact (N) ↔ quote (N)
```

## Prompt Examples

Here are some examples of how you can interact with assistant using the PowerPlatform MCP prompts:

### 1. Entity Understanding

You can ask assistant about entities in natural language:

```
User: "Tell me about the Account entity in our PowerPlatform environment"

Response:
[uses ENTITY_OVERVIEW prompt internally]

Here's what I found about the Account entity:
- It's a core business entity representing customers and potential customers
- The primary identifier is 'accountid' and the primary name field is 'name'
- Key fields include:
  * name (Account Name)
  * emailaddress1 (Email)
  * telephone1 (Main Phone)
  * revenue (Annual Revenue)
- It has 42 one-to-many relationships and 8 many-to-many relationships
```

### 2. Building Queries

You can ask for help constructing queries:

```
User: "Help me write a query to find active accounts with revenue over $1M in California"

Response:
[uses QUERY_TEMPLATE prompt internally]

Here's the OData query you need:
accounts?$select=name,revenue,statecode,address1_stateorprovince
&$filter=statecode eq 0 
    and revenue gt 1000000 
    and address1_stateorprovince eq 'California'
&$orderby=revenue desc

This query:
1. Selects relevant fields
2. Filters for active accounts (statecode eq 0)
3. Checks revenue > $1M
4. Filters for California location
5. Orders by revenue highest to lowest
```

### 3. Understanding Relationships

You can explore entity relationships naturally:

```
User: "How are Accounts and Contacts related in our system?"

Response:
[uses RELATIONSHIP_MAP prompt for both entities internally]

Here are the key relationships between Accounts and Contacts:

1. Primary Contact (One-to-Many):
   - account_primary_contact: Account (1) → Contact (N)
   - An account can have many contacts, but one designated as primary

2. Customer Relationship:
   - contact_customer_accounts: Contact (N) ← Account (1)
   - Contacts can be associated with customer accounts

3. Additional Relationships:
   - accountleads_association: For lead tracking
   - account_connections: For relationship management
```

### 4. Field/Attribute Investigation

You can ask about specific fields:

```
User: "What kind of field is the revenue field on Account?"

Response:
[uses ATTRIBUTE_DETAILS prompt internally]

The revenue field on Account is:
- Data Type: Money
- Format: Currency
- Not required
- Searchable: Yes
- Used for: Tracking annual revenue for the account
- Can be used in advanced find and filtered views
```

### 5. Complex Data Modeling

You can get help with data modeling decisions:

```
User: "I need to design a solution for tracking product reviews. Which entities should I relate to?"

Response:
[uses multiple ENTITY_OVERVIEW and RELATIONSHIP_MAP prompts internally]

Based on the existing data model, here's a suggested approach:

1. Product (existing entity):
   - Already has relationships with:
     * Price lists
     * Product categories
     * Inventory units

2. New Review entity should relate to:
   - Product (N:1) - Each review is for one product
   - Contact (N:1) - Reviews are written by contacts
   - Account (N:1) - Optional link to company if B2B review




These examples show how AI assistant can leverage the MCP prompts to provide context-aware, accurate assistance for PowerPlatform development tasks. The AI understands your environment's specific configuration and can help with both simple queries and complex architectural decisions.

## License

MIT