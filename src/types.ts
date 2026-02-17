import type { EntityService } from "./services/entity-service.js";
import type { RecordService } from "./services/record-service.js";
import type { OptionSetService } from "./services/optionset-service.js";
import type { PluginService } from "./services/plugin-service.js";
import type { DependencyService } from "./services/dependency-service.js";

/**
 * Service context providing lazy-initialized service getters.
 * Used by tools and prompts to access PowerPlatform services.
 */
export interface ServiceContext {
  getEntityService: () => EntityService;
  getRecordService: () => RecordService;
  getOptionSetService: () => OptionSetService;
  getPluginService: () => PluginService;
  getDependencyService: () => DependencyService;
}
