import { PowerPlatformClient } from '../PowerPlatformClient.js';

/**
 * Service for option set operations.
 * Handles global option set definitions.
 */
export class OptionSetService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get a global option set definition by name
   * @param optionSetName The name of the global option set
   * @returns The global option set definition
   */
  async getGlobalOptionSet(optionSetName: string): Promise<any> {
    return this.client.get(`api/data/v9.2/GlobalOptionSetDefinitions(Name='${optionSetName}')`);
  }
}
