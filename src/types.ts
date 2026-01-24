import type { EntityService } from "./services/EntityService.js";
import type { RecordService } from "./services/RecordService.js";
import type { OptionSetService } from "./services/OptionSetService.js";
import type { PluginService } from "./services/PluginService.js";
import type { DependencyService } from "./services/DependencyService.js";

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
