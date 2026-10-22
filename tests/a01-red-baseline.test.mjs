/** Standalone intentionally-red ACCEPTED-PRODUCT tests for the R4 baseline.
 * Run directly: node --test tests/a01-red-baseline.test.mjs
 * Excluded from old fast glob deliberately, since A01 is not an A02–A08 fix.
 */
import {test} from 'node:test';
import {PRODUCT_ORACLES} from '../scripts/a01-product-oracles.mjs';
for(const [id,assertProduct] of PRODUCT_ORACLES)
  test(id,assertProduct);
