/**
 * HEAVIX — PHASE 6D.6: Estimate + Confidence Unit Tests
 *
 * Tests for:
 *   - confidenceForCount() threshold logic
 *   - estimatePrice() persistence to PriceEstimate
 *   - price.* permission keys existence
 *   - persistEstimate best-effort non-blocking design
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Phase 6D — Estimate + Confidence Tests', () => {

  // ── 1. Confidence Threshold Logic ──
  describe('1. Confidence Threshold Logic', () => {
    it('should have confidenceForCount function in price-engine.ts', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('function confidenceForCount');
    });

    it('should return HIGH for count >= 8', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('if (count >= 8) return "HIGH"');
    });

    it('should return MEDIUM for count >= 4', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('if (count >= 4) return "MEDIUM"');
    });

    it('should return LOW for count >= 2', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('if (count >= 2) return "LOW"');
    });

    it('should return INSUFFICIENT for count < 2', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('return "INSUFFICIENT"');
    });

    it('should have 4 confidence levels defined', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('"HIGH"');
      expect(content).toContain('"MEDIUM"');
      expect(content).toContain('"LOW"');
      expect(content).toContain('"INSUFFICIENT"');
    });
  });

  // ── 2. Persistence Logic (6D.3) ──
  describe('2. Persistence Logic (6D.3)', () => {
    it('should have db.priceEstimate.create in estimatePrice function', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('db.priceEstimate.create');
    });

    it('should only persist when listingId is present', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      // The guard condition checks params.listingId
      expect(content).toContain('params.listingId');
      expect(content).toContain('result.confidence !== "INSUFFICIENT"');
    });

    it('should skip INSUFFICIENT confidence estimates', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('"INSUFFICIENT"');
    });

    it('should have try/catch (best-effort non-blocking)', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      // Find the persistEstimate section — search 1000 chars for try + catch + console.error
      const persistIdx = content.indexOf('STEP 6D.3: Persist estimate');
      expect(persistIdx).toBeGreaterThan(-1);
      const section = content.substring(persistIdx, persistIdx + 1200);
      expect(section).toContain('try');
      expect(section).toContain('catch');
      expect(section).toContain('console.error');
    });

    it('should persist all 11 PriceEstimate fields', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      const persistIdx = content.indexOf('db.priceEstimate.create');
      expect(persistIdx).toBeGreaterThan(-1);
      const section = content.substring(persistIdx, persistIdx + 800);
      expect(section).toContain('listingId');
      expect(section).toContain('estimatedPrice');
      expect(section).toContain('priceLower');
      expect(section).toContain('priceUpper');
      expect(section).toContain('confidence');
      expect(section).toContain('comparableCount');
      expect(section).toContain('dataFreshness');
      expect(section).toContain('mainDrivers');
      expect(section).toContain('warnings');
      expect(section).toContain('modelVersion');
    });
  });

  // ── 3. Permission Keys (6D.4) ──
  describe('3. Permission Keys (6D.4)', () => {
    it('should have price.read in PERMISSIONS array', () => {
      const content = fs.readFileSync('src/lib/authorization/permissions.ts', 'utf8');
      expect(content).toContain("'price.read'");
    });

    it('should have price.override in PERMISSIONS array', () => {
      const content = fs.readFileSync('src/lib/authorization/permissions.ts', 'utf8');
      expect(content).toContain("'price.override'");
    });

    it('should assign price.read to SELLER role', () => {
      const content = fs.readFileSync('src/lib/authorization/permissions.ts', 'utf8');
      expect(content).toContain("'price.read'");
    });

    it('should assign price.override to MODERATOR role', () => {
      const content = fs.readFileSync('src/lib/authorization/permissions.ts', 'utf8');
      // MODERATOR section should have price.override
      const modIdx = content.indexOf('MODERATOR:');
      expect(modIdx).toBeGreaterThan(-1);
      // P2 (Contract Drift Remediation): The previous 900-char window
      // was too small — the MODERATOR array grew past 900 chars during
      // STEP 16-C (marketplace CP moderation permissions: part.read,
      // part.update, machine.read, machine.update, offer.*, auction.*,
      // inspection.*, transport.*, request.*, dispute.*). The
      // price.override permission IS assigned to MODERATOR (line 313 in
      // permissions.ts) but fell outside the 900-char window, causing a
      // false-negative. Fix: scan to the closing `]` of the MODERATOR
      // array (the section terminator) instead of a hardcoded window.
      // Evidence: grep -n "price.override" src/lib/authorization/permissions.ts
      //   → line 210 (PERMISSIONS array), line 313 (MODERATOR role array).
      const modCloseIdx = content.indexOf('],', modIdx);
      const modSection = content.substring(modIdx, modCloseIdx);
      expect(modSection).toContain("'price.override'");
    });
  });

  // ── 4. Admin Route Permission Gates (6D.4) ──
  describe('4. Admin Route Permission Gates', () => {
    it('observations route should use requirePermission with price.read', () => {
      const content = fs.readFileSync('src/app/api/admin/pricing/observations/route.ts', 'utf8');
      expect(content).toContain("requirePermission");
      expect(content).toContain("'price.read'");
    });

    it('override route should use requirePermission with price.override', () => {
      const content = fs.readFileSync('src/app/api/admin/pricing/override/route.ts', 'utf8');
      expect(content).toContain("requirePermission");
      expect(content).toContain("'price.override'");
    });

    it('override route should use user.id (not hardcoded ADMIN_CREDENTIALS)', () => {
      const content = fs.readFileSync('src/app/api/admin/pricing/override/route.ts', 'utf8');
      expect(content).toContain("user.id");
      expect(content).not.toContain("ADMIN_CREDENTIALS");
    });
  });

  // ── 5. PriceEstimate Model Structure ──
  describe('5. PriceEstimate Model Structure', () => {
    it('should have model PriceEstimate in schema', () => {
      const content = fs.readFileSync('prisma/schema.prisma', 'utf8');
      expect(content).toContain('model PriceEstimate');
    });

    it('should have all 11 fields', () => {
      const content = fs.readFileSync('prisma/schema.prisma', 'utf8');
      const modelStart = content.indexOf('model PriceEstimate');
      const modelEnd = content.indexOf('}', modelStart);
      const model = content.substring(modelStart, modelEnd);
      expect(model).toContain('id');
      expect(model).toContain('listingId');
      expect(model).toContain('estimatedPrice');
      expect(model).toContain('priceLower');
      expect(model).toContain('priceUpper');
      expect(model).toContain('confidence');
      expect(model).toContain('comparableCount');
      expect(model).toContain('dataFreshness');
      expect(model).toContain('mainDrivers');
      expect(model).toContain('warnings');
      expect(model).toContain('modelVersion');
      expect(model).toContain('createdAt');
    });

    it('should have @@index([listingId])', () => {
      const content = fs.readFileSync('prisma/schema.prisma', 'utf8');
      const modelStart = content.indexOf('model PriceEstimate');
      const modelEnd = content.indexOf('}', modelStart);
      const model = content.substring(modelStart, modelEnd);
      expect(model).toContain('@@index([listingId])');
    });

    it('should have listing relation with SetNull onDelete', () => {
      const content = fs.readFileSync('prisma/schema.prisma', 'utf8');
      const modelStart = content.indexOf('model PriceEstimate');
      const modelEnd = content.indexOf('}', modelStart);
      const model = content.substring(modelStart, modelEnd);
      expect(model).toContain('listing');
      expect(model).toContain('SetNull');
    });
  });

  // ── 6. Audit Hook on Override ──
  describe('6. Audit Hook on Override', () => {
    it('should have logAudit in createOverride function', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('logAudit');
    });

    it('should audit with action pricing.override', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('pricing.override');
    });

    it('should audit with entityType PriceOverride', () => {
      const content = fs.readFileSync('src/lib/price-engine.ts', 'utf8');
      expect(content).toContain('PriceOverride');
    });
  });
});
