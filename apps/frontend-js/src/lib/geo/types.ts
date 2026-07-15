import type { Feature, FeatureCollection, Polygon as GeoJsonPolygon, MultiPolygon as GeoJsonMultiPolygon, Position } from 'geojson';

export type Ring = Position[];
export type Polygon = Position[][];
export type MultiPolygon = Position[][][];

type GeoProperties = Record<string, string | null | undefined>;

export type GeoFeature = Feature<GeoJsonPolygon | GeoJsonMultiPolygon, GeoProperties>;
export type GeoCollection = FeatureCollection<GeoJsonPolygon | GeoJsonMultiPolygon, GeoProperties>;
