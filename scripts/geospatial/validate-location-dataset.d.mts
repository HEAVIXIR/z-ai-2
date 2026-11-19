export interface LocationDatasetManifest {
  sourceUrl: string;
  sourceName: string;
  license: string;
  sourceVersion: string;
  sourceDate: string;
  rightsReviewStatus: string;
  commercialUseAllowed?: boolean;
  sha256: string;
}
export interface LocationDatasetReport {
  structurallyValid: boolean;
  importEligible: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: string[];
  counts: { countries: number; provinces: number; cities: number };
}
export function validateLocationDataset(
  dataset: unknown,
  manifest: LocationDatasetManifest,
  actualSha256?: string,
): LocationDatasetReport;
export function validateLocationDatasetFiles(
  datasetPath: string,
  manifestPath: string,
): Promise<LocationDatasetReport>;
