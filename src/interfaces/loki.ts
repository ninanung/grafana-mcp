export interface LokiLabelsResponse {
  status: string;
  data: string[];
}

export interface LokiLabelValuesResponse {
  status: string;
  data: string[];
}

export interface LokiStreamEntry {
  stream: Record<string, string>;
  values: [string, string][]; // [ns timestamp, line]
}

export interface LokiQueryRangeResponse {
  status: string;
  data: {
    resultType: "streams" | "matrix" | "vector";
    result: LokiStreamEntry[];
  };
}

export interface LogLine {
  timestampNs: string;
  timestampIso: string;
  line: string;
  labels: Record<string, string>;
}
