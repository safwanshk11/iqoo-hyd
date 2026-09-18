import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, nearbyRadiusKm } from "../src/shared/location.mjs";
test("nearby search distances separate local Hyderabad parking from airport inventory", () => {
  const jubilee = [17.433, 78.407];
  assert.equal(distanceKm(jubilee, jubilee), 0);
  assert.ok(distanceKm(jubilee, [17.4363, 78.4065]) < 0.5);
  assert.ok(distanceKm(jubilee, [17.4411, 78.3788]) < nearbyRadiusKm);
  assert.ok(distanceKm(jubilee, [17.2602, 78.388]) > nearbyRadiusKm);
  assert.ok(Math.abs(distanceKm([0, 0], [1, 0]) - 111.195) < 0.01);
});
