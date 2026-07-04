declare module "osmtogeojson" {
  export default function osmtogeojson(input: unknown): {
    features: Array<{
      id?: string;
      properties?: Record<string, string> & { tags?: Record<string, string> };
      geometry?: {
        type: string;
        coordinates: unknown;
      } | null;
    }>;
  };
}
