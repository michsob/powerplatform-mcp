/**
 * Interface for API responses with value collections.
 * Common response format from PowerPlatform OData API endpoints.
 */
export interface ApiCollectionResponse<T> {
  value: T[];
  [key: string]: any;
}
