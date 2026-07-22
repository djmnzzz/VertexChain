import { GeoService } from './geo.service';
import * as fc from 'fast-check';

describe('GeoService', () => {
  let service: GeoService;

  beforeEach(() => {
    service = new GeoService();
  });

  describe('encode', () => {
    it('should encode Abuja coordinates to the correct geohash', () => {
      const hash = service.encode(9.0579, 7.4951);
      expect(hash).toBe('s1t7d8c');
    });

    it('should return a string of the requested precision', () => {
      expect(service.encode(9.0579, 7.4951, 5)).toHaveLength(5);
      expect(service.encode(9.0579, 7.4951, 7)).toHaveLength(7);
      expect(service.encode(9.0579, 7.4951, 9)).toHaveLength(9);
    });

    it('should encode New York coordinates', () => {
      const hash = service.encode(40.7128, -74.006, 7);
      expect(hash).toHaveLength(7);
      expect(hash.startsWith('dr5r')).toBe(true);
    });

    it('should encode origin (0, 0)', () => {
      const hash = service.encode(0, 0, 5);
      expect(hash).toHaveLength(5);
    });

    it('should encode extreme coordinates', () => {
      expect(service.encode(89.9, 179.9, 5)).toHaveLength(5);
      expect(service.encode(-89.9, -179.9, 5)).toHaveLength(5);
    });

    it('should return different hashes for different locations', () => {
      const abuja = service.encode(9.0579, 7.4951, 7);
      const lagos = service.encode(6.5244, 3.3792, 7);
      expect(abuja).not.toBe(lagos);
    });
  });

  describe('decode', () => {
    it('should decode a geohash back to approximate coordinates', () => {
      const hash = service.encode(9.0579, 7.4951, 7);
      const { lat, lon } = service.decode(hash);
      // Allow ~0.01 degree tolerance for precision 7
      expect(Math.abs(lat - 9.0579)).toBeLessThan(0.01);
      expect(Math.abs(lon - 7.4951)).toBeLessThan(0.01);
    });

    it('should decode New York geohash', () => {
      const { lat, lon } = service.decode('dr5r7');
      expect(Math.abs(lat - 40.7128)).toBeLessThan(0.5);
      expect(Math.abs(lon - -74.006)).toBeLessThan(0.5);
    });

    it('should be consistent: encode then decode returns original coords', () => {
      const pairs = [
        [9.0579, 7.4951],
        [40.7128, -74.006],
        [-33.8688, 151.2093], // Sydney
        [51.5074, -0.1278], // London
      ];

      for (const [lat, lon] of pairs) {
        const hash = service.encode(lat, lon, 7);
        const decoded = service.decode(hash);
        expect(Math.abs(decoded.lat - lat)).toBeLessThan(0.01);
        expect(Math.abs(decoded.lon - lon)).toBeLessThan(0.01);
      }
    });
  });

  // ------------------------------------------------------------------
  // Property-based (fuzz) tests with fast-check
  // ------------------------------------------------------------------

  describe('property-based (fuzz)', () => {
    // Geohash idempotency: encode(decode(encode(x))) ≈ encode(x)
    it('encode(decode(encode(x))) should equal encode(x) for random lat/lon pairs', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -90, max: 90, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
          (lat, lon) => {
            const hash = service.encode(lat, lon, 7);
            const decoded = service.decode(hash);
            const reencoded = service.encode(decoded.lat, decoded.lon, 7);
            expect(reencoded).toBe(hash);
          },
        ),
        { numRuns: 1000 },
      );
    });

    // Round-trip: encode then decode gives a point within the expected tolerance
    it('decode(encode(lat, lon)) should be within precision tolerance', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -90, max: 90, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
          (lat, lon) => {
            const hash = service.encode(lat, lon, 7);
            const decoded = service.decode(hash);
            // For precision 7, error should be < ~0.01 degrees
            expect(Math.abs(decoded.lat - lat)).toBeLessThan(0.02);
            expect(Math.abs(decoded.lon - lon)).toBeLessThan(0.02);
          },
        ),
        { numRuns: 1000 },
      );
    });

    // Pole cases: lat = ±90 produces a stable hash
    it('should produce stable hashes at the poles', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -180, max: 180, noNaN: true }),
          (lon) => {
            const hashNorth = service.encode(90, lon, 7);
            const hashSouth = service.encode(-90, lon, 7);
            expect(hashNorth).toHaveLength(7);
            expect(hashSouth).toHaveLength(7);
            // All north pole hashes at any longitude should be the same
            // because latitude is clamped by the geohash algorithm
            const { lat: latNorth } = service.decode(hashNorth);
            const { lat: latSouth } = service.decode(hashSouth);
            expect(latNorth).toBeGreaterThan(89);
            expect(latSouth).toBeLessThan(-89);
          },
        ),
        { numRuns: 100 },
      );
    });

    // Antimeridian: lon = ±180 produces a stable hash
    it('should produce stable hashes at the antimeridian', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -90, max: 90, noNaN: true }),
          (lat) => {
            const hash180 = service.encode(lat, 180, 7);
            const hashNeg180 = service.encode(lat, -180, 7);
            expect(hash180).toHaveLength(7);
            expect(hashNeg180).toHaveLength(7);
            // Both should decode to the same cell (or adjacent)
            const decoded180 = service.decode(hash180);
            const decodedNeg180 = service.decode(hashNeg180);
            expect(Math.abs(decoded180.lon)).toBeGreaterThan(179);
            expect(Math.abs(decodedNeg180.lon)).toBeGreaterThan(179);
          },
        ),
        { numRuns: 100 },
      );
    });

    // All geohash characters are valid base32
    it('geohash should only contain valid base32 characters', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -90, max: 90, noNaN: true }),
          fc.double({ min: -180, max: 180, noNaN: true }),
          (lat, lon) => {
            const hash = service.encode(lat, lon, 7);
            expect(hash).toMatch(/^[0123456789bcdefghjkmnpqrstuvwxyz]+$/);
          },
        ),
        { numRuns: 1000 },
      );
    });

    // Hash length matches requested precision
    it('encode should respect precision parameter', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 12 }),
          (precision) => {
            const hash = service.encode(9.0579, 7.4951, precision);
            expect(hash).toHaveLength(precision);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
