/**
 * FlowFilter
 *
 * Pure-function filter system for cloud flows.
 * Supports whitelist/blacklist patterns matching the Python
 * Automation-Health-Monitor filter logic.
 */

export interface FilterPatterns {
  /** Exclude flows whose name starts with any of these prefixes (case-insensitive) */
  namePrefixes?: string[];
  /** Exclude flows whose name contains any of these substrings (case-insensitive) */
  nameContains?: string[];
  /** Exclude flows matching these exact names (case-insensitive) */
  nameExact?: string[];
  /** Exclude flows matching these regex patterns against the name */
  namePatterns?: string[];
  /** Exclude flows modified by any of these users (case-insensitive) */
  modifiedBy?: string[];
  /** Exclude flows with these state codes (0=Draft, 1=Activated, 2=Suspended) */
  excludeStates?: number[];
}

export interface FlowFilterConfig {
  whitelist?: FilterPatterns;
  blacklist?: FilterPatterns;
  /**
   * Filter mode:
   * - 'both': Flow must match whitelist AND not be blacklisted (default)
   * - 'whitelist_only': Only apply whitelist
   * - 'blacklist_only': Only apply blacklist
   * - 'none': No filtering
   */
  mode?: 'both' | 'whitelist_only' | 'blacklist_only' | 'none';
}

export interface FilterableFlow {
  name: string;
  statecode: number;
  modifiedBy: string | null;
}

export interface FlowFilterResult<T> {
  included: T[];
  excluded: number;
}

/**
 * Check if a flow matches any of the given patterns.
 */
function matchesPatterns(flow: FilterableFlow, patterns: FilterPatterns): boolean {
  const nameLower = flow.name.toLowerCase();

  if (patterns.namePrefixes?.length) {
    for (const prefix of patterns.namePrefixes) {
      if (nameLower.startsWith(prefix.toLowerCase())) return true;
    }
  }

  if (patterns.nameContains?.length) {
    for (const sub of patterns.nameContains) {
      if (nameLower.includes(sub.toLowerCase())) return true;
    }
  }

  if (patterns.nameExact?.length) {
    for (const exact of patterns.nameExact) {
      if (nameLower === exact.toLowerCase()) return true;
    }
  }

  if (patterns.namePatterns?.length) {
    for (const pattern of patterns.namePatterns) {
      try {
        if (new RegExp(pattern, 'i').test(flow.name)) return true;
      } catch {
        // Skip invalid regex patterns
      }
    }
  }

  if (patterns.modifiedBy?.length && flow.modifiedBy) {
    const modifiedByLower = flow.modifiedBy.toLowerCase();
    for (const user of patterns.modifiedBy) {
      if (modifiedByLower === user.toLowerCase()) return true;
    }
  }

  if (patterns.excludeStates?.length) {
    if (patterns.excludeStates.includes(flow.statecode)) return true;
  }

  return false;
}

/**
 * Apply whitelist/blacklist filter configuration to a flow list.
 * Returns the included flows and the count of excluded flows.
 */
export function applyFlowFilters<T extends FilterableFlow>(
  flows: T[],
  config?: FlowFilterConfig,
): FlowFilterResult<T> {
  if (!config || config.mode === 'none') {
    return { included: flows, excluded: 0 };
  }

  const mode = config.mode ?? 'both';
  let result = flows;

  // Apply whitelist (include-only)
  if ((mode === 'both' || mode === 'whitelist_only') && config.whitelist) {
    result = result.filter((flow) => matchesPatterns(flow, config.whitelist!));
  }

  // Apply blacklist (exclude)
  if ((mode === 'both' || mode === 'blacklist_only') && config.blacklist) {
    result = result.filter((flow) => !matchesPatterns(flow, config.blacklist!));
  }

  return {
    included: result,
    excluded: flows.length - result.length,
  };
}
