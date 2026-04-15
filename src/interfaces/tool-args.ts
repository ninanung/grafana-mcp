export interface SearchDashboardsArgs {
  query?: string;
  tag?: string[];
  type?: "dash-db" | "dash-folder";
  limit?: number;
}

export interface GetDashboardArgs {
  uid: string;
}

export interface ListDataSourcesArgs {
  // no args
}

export interface QueryDataSourceArgs {
  datasource_uid: string;
  query: string;
  from?: string;
  to?: string;
  max_data_points?: number;
}

export type LogOutputMode = "raw" | "summarize" | "json";

export interface QueryLogsArgs {
  service: string;
  datasource_uid?: string;
  service_label?: string;
  level?: string;
  keyword?: string;
  time_from?: string;
  time_to?: string;
  limit?: number;
  output?: LogOutputMode;
  refresh?: boolean;
}

export interface GetLogCacheArgs {
  keyword?: string;
}

export interface RefreshLogCacheArgs {
  service?: string;
  all?: boolean;
}

export interface ExportLogCacheArgs {
  path: string;
}

export interface ImportLogCacheArgs {
  path: string;
  mode?: "merge" | "replace";
}

export interface ListLogDataSourcesArgs {
  // no args
}
