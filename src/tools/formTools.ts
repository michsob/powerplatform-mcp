import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServiceContext } from "../types.js";
import { getFormTypeName, getActivationStateName, FormType } from "../models/FormTypes.js";

/**
 * Register form tools with the MCP server.
 */
export function registerFormTools(server: McpServer, ctx: ServiceContext): void {

  // ============================================================================
  // Read Operations
  // ============================================================================

  // Get Entity Forms
  server.registerTool(
    "get-entity-forms",
    {
      title: "Get Entity Forms",
      description: "List all forms for a Dataverse entity. Returns form metadata including ID, name, type, and activation state.",
      inputSchema: {
        entityLogicalName: z.string().describe("The logical name of the entity (e.g., 'account', 'contact')"),
        formType: z.number().optional().describe("Optional form type filter (2=Main, 5=Mobile, 6=QuickView, 7=QuickCreate)"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        entityName: z.string(),
        formCount: z.number(),
        forms: z.array(z.object({
          formId: z.string(),
          name: z.string(),
          type: z.number(),
          typeName: z.string(),
          isDefault: z.boolean(),
          isActive: z.boolean(),
        })),
      }),
    },
    async ({ entityLogicalName, formType }) => {
      try {
        const service = ctx.getFormService();
        const forms = await service.getEntityForms(entityLogicalName, formType);

        const formList = forms.map(f => ({
          formId: f.formid,
          name: f.name,
          type: f.type,
          typeName: getFormTypeName(f.type),
          isDefault: f.isdefault,
          isActive: f.formactivationstate === 1,
        }));

        const typeFilter = formType !== undefined ? ` (type: ${getFormTypeName(formType)})` : '';

        return {
          structuredContent: {
            success: true,
            entityName: entityLogicalName,
            formCount: forms.length,
            forms: formList,
          },
          content: [
            {
              type: "text",
              text: `Found ${forms.length} forms for '${entityLogicalName}'${typeFilter}:\n${formList.map(f =>
                `- ${f.name} (${f.typeName})${f.isDefault ? ' [DEFAULT]' : ''}${!f.isActive ? ' [INACTIVE]' : ''}`
              ).join('\n')}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting entity forms:", error);
        return {
          structuredContent: { success: false, entityName: entityLogicalName, formCount: 0, forms: [] },
          content: [
            {
              type: "text",
              text: `Failed to get forms for '${entityLogicalName}': ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Get Form
  server.registerTool(
    "get-form",
    {
      title: "Get Form",
      description: "Get detailed information about a specific form including its FormXML structure.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form"),
        includeXml: z.boolean().optional().default(false).describe("Whether to include the raw FormXML in the response"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        form: z.object({
          formId: z.string(),
          name: z.string(),
          entityName: z.string(),
          type: z.number(),
          typeName: z.string(),
          isDefault: z.boolean(),
          isActive: z.boolean(),
          description: z.string().optional(),
          formXml: z.string().optional(),
          structure: z.string().optional(),
        }).optional(),
      }),
    },
    async ({ formId, includeXml }) => {
      try {
        const service = ctx.getFormService();
        const form = await service.getForm(formId);
        const structure = await service.getFormStructure(formId);

        const formInfo = {
          formId: form.formid,
          name: form.name,
          entityName: form.objecttypecode,
          type: form.type,
          typeName: getFormTypeName(form.type),
          isDefault: form.isdefault,
          isActive: form.formactivationstate === 1,
          description: form.description,
          formXml: includeXml ? form.formxml : undefined,
          structure: structure,
        };

        return {
          structuredContent: { success: true, form: formInfo },
          content: [
            {
              type: "text",
              text: `Form: ${form.name}\nEntity: ${form.objecttypecode}\nType: ${getFormTypeName(form.type)}\nDefault: ${form.isdefault ? 'Yes' : 'No'}\nActive: ${form.formactivationstate === 1 ? 'Yes' : 'No'}\n\nStructure:\n${structure}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error getting form:", error);
        return {
          structuredContent: { success: false },
          content: [
            {
              type: "text",
              text: `Failed to get form '${formId}': ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  // Copy Form
  server.registerTool(
    "copy-form",
    {
      title: "Copy Form",
      description: "Create a new form by copying an existing one.",
      inputSchema: {
        sourceFormId: z.string().describe("The ID of the form to copy"),
        newName: z.string().describe("The name for the new form"),
        solutionUniqueName: z.string().optional().describe("Solution to add the form to"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        newFormId: z.string().optional(),
        newFormName: z.string(),
      }),
    },
    async ({ sourceFormId, newName, solutionUniqueName }) => {
      try {
        const service = ctx.getFormService();
        const newFormId = await service.copyForm(sourceFormId, newName, solutionUniqueName);

        return {
          structuredContent: { success: true, newFormId, newFormName: newName },
          content: [
            {
              type: "text",
              text: `Successfully copied form to '${newName}' (ID: ${newFormId}). Remember to publish the entity to make changes available.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error copying form:", error);
        return {
          structuredContent: { success: false, newFormName: newName },
          content: [
            {
              type: "text",
              text: `Failed to copy form: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Update Form
  server.registerTool(
    "update-form",
    {
      title: "Update Form",
      description: "Update form metadata such as name and description.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form"),
        name: z.string().optional().describe("New name for the form"),
        description: z.string().optional().describe("New description for the form"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
      }),
    },
    async ({ formId, name, description }) => {
      try {
        const service = ctx.getFormService();

        // DEBUG: Get before values
        const formBefore = await service.getForm(formId);
        const descBefore = formBefore.description;

        await service.updateForm(formId, { name, description });

        // DEBUG: Get after values
        const formAfter = await service.getForm(formId);
        const descAfter = formAfter.description;

        return {
          structuredContent: { success: true, formId, descBefore, descAfter },
          content: [
            {
              type: "text",
              text: `Updated form. Description before: '${descBefore}', after: '${descAfter}'. Remember to publish.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error updating form:", error);
        return {
          structuredContent: { success: false, formId, error: error.message },
          content: [
            {
              type: "text",
              text: `Failed to update form: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Delete Form
  server.registerTool(
    "delete-form",
    {
      title: "Delete Form",
      description: "Delete a form. Cannot delete the last active form for an entity.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form to delete"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
      }),
    },
    async ({ formId }) => {
      try {
        const service = ctx.getFormService();
        await service.deleteForm(formId);

        return {
          structuredContent: { success: true, formId },
          content: [
            {
              type: "text",
              text: `Successfully deleted form '${formId}'.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error deleting form:", error);
        return {
          structuredContent: { success: false, formId },
          content: [
            {
              type: "text",
              text: `Failed to delete form: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Set Default Form
  server.registerTool(
    "set-default-form",
    {
      title: "Set Default Form",
      description: "Set a form as the default form for its entity.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form to set as default"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
      }),
    },
    async ({ formId }) => {
      try {
        const service = ctx.getFormService();
        await service.setDefaultForm(formId);

        return {
          structuredContent: { success: true, formId },
          content: [
            {
              type: "text",
              text: `Successfully set form '${formId}' as default. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error setting default form:", error);
        return {
          structuredContent: { success: false, formId },
          content: [
            {
              type: "text",
              text: `Failed to set default form: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Activate Form
  server.registerTool(
    "activate-form",
    {
      title: "Activate Form",
      description: "Activate a form to make it available to users.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form to activate"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
      }),
    },
    async ({ formId }) => {
      try {
        const service = ctx.getFormService();
        await service.setFormActivationState(formId, true);

        return {
          structuredContent: { success: true, formId },
          content: [
            {
              type: "text",
              text: `Successfully activated form '${formId}'. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error activating form:", error);
        return {
          structuredContent: { success: false, formId },
          content: [
            {
              type: "text",
              text: `Failed to activate form: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Deactivate Form
  server.registerTool(
    "deactivate-form",
    {
      title: "Deactivate Form",
      description: "Deactivate a form to hide it from users. Cannot deactivate the last active form.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form to deactivate"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
      }),
    },
    async ({ formId }) => {
      try {
        const service = ctx.getFormService();
        await service.setFormActivationState(formId, false);

        return {
          structuredContent: { success: true, formId },
          content: [
            {
              type: "text",
              text: `Successfully deactivated form '${formId}'. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error deactivating form:", error);
        return {
          structuredContent: { success: false, formId },
          content: [
            {
              type: "text",
              text: `Failed to deactivate form: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Publish Form
  server.registerTool(
    "publish-form",
    {
      title: "Publish Form",
      description: "Publish form changes for an entity to make them available in the UI.",
      inputSchema: {
        entityLogicalName: z.string().describe("The logical name of the entity whose forms should be published"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        entityName: z.string(),
      }),
    },
    async ({ entityLogicalName }) => {
      try {
        const service = ctx.getFormService();
        await service.publishForm(entityLogicalName);

        return {
          structuredContent: { success: true, entityName: entityLogicalName },
          content: [
            {
              type: "text",
              text: `Successfully published forms for '${entityLogicalName}'.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error publishing form:", error);
        return {
          structuredContent: { success: false, entityName: entityLogicalName },
          content: [
            {
              type: "text",
              text: `Failed to publish forms: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // ============================================================================
  // Layout Modification Tools
  // ============================================================================

  // Add Form Tab
  server.registerTool(
    "add-form-tab",
    {
      title: "Add Form Tab",
      description: "Add a new tab to a form.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form"),
        tabName: z.string().describe("Internal name for the tab (no spaces, alphanumeric)"),
        tabLabel: z.string().describe("Display label for the tab"),
        visible: z.boolean().optional().default(true).describe("Whether the tab is visible"),
        expanded: z.boolean().optional().default(true).describe("Whether the tab is expanded by default"),
        showLabel: z.boolean().optional().default(true).describe("Whether to show the tab label"),
        columns: z.number().optional().default(1).describe("Number of columns in the tab (1-3)"),
        position: z.number().optional().describe("Position index (0-based). Appends at end if not specified."),
        solutionUniqueName: z.string().optional().describe("Solution context for the change"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
        tabName: z.string(),
      }),
    },
    async ({ formId, tabName, tabLabel, visible, expanded, showLabel, columns, position, solutionUniqueName }) => {
      try {
        const service = ctx.getFormService();
        await service.addTab(formId, {
          name: tabName,
          label: tabLabel,
          visible,
          expanded,
          showLabel,
          columns,
        }, position, solutionUniqueName);

        return {
          structuredContent: { success: true, formId, tabName },
          content: [
            {
              type: "text",
              text: `Successfully added tab '${tabLabel}' to form. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error adding tab:", error);
        return {
          structuredContent: { success: false, formId, tabName },
          content: [
            {
              type: "text",
              text: `Failed to add tab: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Remove Form Tab
  server.registerTool(
    "remove-form-tab",
    {
      title: "Remove Form Tab",
      description: "Remove a tab from a form.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form"),
        tabName: z.string().describe("The name of the tab to remove"),
        solutionUniqueName: z.string().optional().describe("Solution context for the change"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
        tabName: z.string(),
      }),
    },
    async ({ formId, tabName, solutionUniqueName }) => {
      try {
        const service = ctx.getFormService();
        await service.removeTab(formId, tabName, solutionUniqueName);

        return {
          structuredContent: { success: true, formId, tabName },
          content: [
            {
              type: "text",
              text: `Successfully removed tab '${tabName}' from form. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error removing tab:", error);
        return {
          structuredContent: { success: false, formId, tabName },
          content: [
            {
              type: "text",
              text: `Failed to remove tab: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Add Form Section
  server.registerTool(
    "add-form-section",
    {
      title: "Add Form Section",
      description: "Add a new section to a tab in a form.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form"),
        tabName: z.string().describe("The name of the tab to add the section to"),
        sectionName: z.string().describe("Internal name for the section (no spaces, alphanumeric)"),
        sectionLabel: z.string().describe("Display label for the section"),
        visible: z.boolean().optional().default(true).describe("Whether the section is visible"),
        showLabel: z.boolean().optional().default(true).describe("Whether to show the section label"),
        showBar: z.boolean().optional().default(false).describe("Whether to show a divider bar"),
        columns: z.number().optional().default(1).describe("Number of columns in the section (1-3)"),
        columnIndex: z.number().optional().default(0).describe("Column index within the tab (0-based)"),
        solutionUniqueName: z.string().optional().describe("Solution context for the change"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
        sectionName: z.string(),
      }),
    },
    async ({ formId, tabName, sectionName, sectionLabel, visible, showLabel, showBar, columns, columnIndex, solutionUniqueName }) => {
      try {
        const service = ctx.getFormService();
        await service.addSection(formId, tabName, {
          name: sectionName,
          label: sectionLabel,
          visible,
          showLabel,
          showBar,
          columns,
        }, columnIndex, solutionUniqueName);

        return {
          structuredContent: { success: true, formId, sectionName },
          content: [
            {
              type: "text",
              text: `Successfully added section '${sectionLabel}' to tab '${tabName}'. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error adding section:", error);
        return {
          structuredContent: { success: false, formId, sectionName },
          content: [
            {
              type: "text",
              text: `Failed to add section: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Remove Form Section
  server.registerTool(
    "remove-form-section",
    {
      title: "Remove Form Section",
      description: "Remove a section from a form.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form"),
        sectionName: z.string().describe("The name of the section to remove"),
        solutionUniqueName: z.string().optional().describe("Solution context for the change"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
        sectionName: z.string(),
      }),
    },
    async ({ formId, sectionName, solutionUniqueName }) => {
      try {
        const service = ctx.getFormService();
        await service.removeSection(formId, sectionName, solutionUniqueName);

        return {
          structuredContent: { success: true, formId, sectionName },
          content: [
            {
              type: "text",
              text: `Successfully removed section '${sectionName}' from form. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error removing section:", error);
        return {
          structuredContent: { success: false, formId, sectionName },
          content: [
            {
              type: "text",
              text: `Failed to remove section: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Add Form Field
  server.registerTool(
    "add-form-field",
    {
      title: "Add Form Field",
      description: "Add a field/control to a section in a form. Automatically publishes the form after adding the field.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form"),
        sectionName: z.string().describe("The name of the section to add the field to"),
        fieldName: z.string().describe("The logical name of the field/attribute to add"),
        label: z.string().optional().describe("Custom label for the field (uses field name if not specified)"),
        showLabel: z.boolean().optional().default(true).describe("Whether to show the field label"),
        visible: z.boolean().optional().default(true).describe("Whether the field is visible"),
        disabled: z.boolean().optional().default(false).describe("Whether the field is read-only"),
        solutionUniqueName: z.string().optional().describe("Solution context for the change"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
        fieldName: z.string(),
        error: z.string().optional(),
      }),
    },
    async ({ formId, sectionName, fieldName, label, showLabel, visible, disabled, solutionUniqueName }) => {
      try {
        const service = ctx.getFormService();
        await service.addField(formId, sectionName, {
          fieldName,
          label,
          showLabel,
          visible,
          disabled,
        }, solutionUniqueName);

        return {
          structuredContent: { success: true, formId, fieldName },
          content: [
            {
              type: "text",
              text: `Successfully added field '${fieldName}' to section '${sectionName}' and published the form.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error adding field:", error);
        return {
          structuredContent: { success: false, formId, fieldName, error: error.message },
          content: [
            {
              type: "text",
              text: `Failed to add field: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Remove Form Field
  server.registerTool(
    "remove-form-field",
    {
      title: "Remove Form Field",
      description: "Remove a field/control from a form.",
      inputSchema: {
        formId: z.string().describe("The unique identifier of the form"),
        fieldName: z.string().describe("The logical name of the field to remove"),
        solutionUniqueName: z.string().optional().describe("Solution context for the change"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        formId: z.string(),
        fieldName: z.string(),
      }),
    },
    async ({ formId, fieldName, solutionUniqueName }) => {
      try {
        const service = ctx.getFormService();
        await service.removeField(formId, fieldName, solutionUniqueName);

        return {
          structuredContent: { success: true, formId, fieldName },
          content: [
            {
              type: "text",
              text: `Successfully removed field '${fieldName}' from form. Remember to publish the entity.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error removing field:", error);
        return {
          structuredContent: { success: false, formId, fieldName },
          content: [
            {
              type: "text",
              text: `Failed to remove field: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // Debug tool to test formxml PATCH
  server.registerTool(
    "test-formxml-patch",
    {
      title: "Test FormXML PATCH",
      description: "Debug tool to test if formxml PATCH works",
      inputSchema: {
        formId: z.string().describe("The form ID to test"),
      },
      outputSchema: z.object({
        success: z.boolean(),
        result: z.object({
          beforeLen: z.number(),
          modifiedLen: z.number(),
          afterLen: z.number(),
          afterPublishLen: z.number(),
          changeApplied: z.boolean(),
          changeAppliedAfterPublish: z.boolean(),
        }).optional(),
        error: z.string().optional(),
      }),
    },
    async ({ formId }) => {
      try {
        const service = ctx.getFormService();
        const result = await service.testFormXmlPatch(formId);

        return {
          structuredContent: { success: true, result },
          content: [
            {
              type: "text",
              text: `Test: before=${result.beforeLen}, after=${result.afterLen}, afterPublish=${result.afterPublishLen}, applied=${result.changeApplied}, appliedAfterPublish=${result.changeAppliedAfterPublish}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          structuredContent: { success: false, error: error.message },
          content: [
            {
              type: "text",
              text: `Test failed: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
