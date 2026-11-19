export interface IranLocationCatalog {
  schemaVersion: number;
  countries: Array<Record<string, unknown>>;
  provinces: Array<{
    sourceCode: string;
    sourceId: number;
    name: string;
    nameEn: string | null;
    countryCode: string;
    sortOrder: number;
    cityCount: number;
  }>;
  cities: Array<{
    sourceCode: string;
    name: string;
    nameEn: string | null;
    provinceCode: string;
    sourceProvinceId: number;
    sortOrder: number;
  }>;
  metadata: Record<string, unknown>;
}
export interface IranLocationCatalogManifest {
  datasetFile: string;
  sha256: string;
  sourceFile: string;
  sourceBlobSha: string;
  sourceUrl: string;
  sourceVersion: string;
  officialSourceYear: number;
  sourceLicense: string;
  sourceRecords: number;
  distinctCities: number;
  provinces: number;
  countries: number;
  normalization: string;
  duplicatePolicy: string;
  rightsReviewStatus: string;
  commercialUseAllowed: boolean;
}
export function buildIranLocationCatalog(sourceBytes: Uint8Array): {
  dataset: IranLocationCatalog;
  manifest: IranLocationCatalogManifest;
  datasetBytes: Uint8Array;
  manifestBytes: Uint8Array;
};
