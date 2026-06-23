export type Ring = number[][];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export interface GeoFeature {
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: Polygon | MultiPolygon;
  };
  properties: Record<string, string | null | undefined>;
}

export interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}
