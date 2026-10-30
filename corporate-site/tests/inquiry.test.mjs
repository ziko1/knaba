import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInquiry,
  emptyInquiry,
  inquiryLimits,
  isKnownService,
  validateInquiry,
} from "../src/lib/inquiry.ts";

const valid = () => ({
  service: "bueroreinigung",
  objectType: "Büro / Gewerbe",
  postcode: "10315",
  area: "",
  frequency: "Regelmäßig",
  name: "Erika Muster",
  email: "erika@example.com",
  phone: "",
  message: "",
});

test("empty inquiry requires service, object, location, frequency and contact identity", () => {
  assert.deepEqual(Object.keys(validateInquiry(emptyInquiry())).sort(), [
    "email",
    "frequency",
    "name",
    "objectType",
    "postcode",
    "service",
  ]);
});
test("valid inquiry allows unknown area and optional phone/message without pricing", () => {
  const result = buildInquiry(valid());
  assert.deepEqual(validateInquiry(valid()), {});
  assert.match(result.body, /Ungefähre Fläche: Noch offen/);
  assert.match(result.href, /^mailto:kontakt@knaba\.de\?/);
  assert.doesNotMatch(result.body, /€|EUR|Preis:/);
});
test("invalid service is rejected instead of accepted from an untrusted query", () => {
  assert.equal(isKnownService("https://evil.example"), false);
  assert.equal(isKnownService("baureinigung"), true);
  assert.throws(
    () => buildInquiry({ ...valid(), service: "other" }),
    /Leistung/,
  );
});
test("postcode preserves leading zero and rejects incomplete or nonnumeric inputs", () => {
  assert.equal(
    validateInquiry({ ...valid(), postcode: "03046" }).postcode,
    undefined,
  );
  for (const postcode of ["1031", "103150", "ABCDE", "10\n15"])
    assert.ok(validateInquiry({ ...valid(), postcode }).postcode);
});
test("area is optional but if provided is a positive bounded integer", () => {
  for (const area of ["0", "-1", "1.5", "1000001", "1e4", "abc"])
    assert.ok(validateInquiry({ ...valid(), area }).area);
  assert.equal(validateInquiry({ ...valid(), area: "250" }).area, undefined);
});
test("message query punctuation cannot inject recipients or additional mailto parameters", () => {
  const message =
    "Fenster & Türen?\ncc=attacker@example.com&bcc=other@example.com # prüfen";
  const result = buildInquiry({ ...valid(), message });
  const url = new URL(result.href);
  assert.equal(url.pathname, "kontakt@knaba.de");
  assert.deepEqual([...url.searchParams.keys()], ["subject", "body"]);
  assert.equal(url.searchParams.get("body"), result.body);
  assert.ok(result.body.includes(message));
  assert.equal(url.hash, "");
});
test("email/header-like control characters and oversized fields are rejected", () => {
  assert.ok(
    validateInquiry({ ...valid(), name: "Name\r\nBcc: attack@example.com" })
      .name,
  );
  assert.ok(
    validateInquiry({
      ...valid(),
      email: "me@example.com\r\ncc:other@example.com",
    }).email,
  );
  assert.ok(validateInquiry({ ...valid(), message: "x".repeat(501) }).message);
  assert.ok(validateInquiry({ ...valid(), phone: "+49\n1234" }).phone);
});
test("maximum unicode inputs produce a bounded, round-trip-safe mailto", () => {
  const result = buildInquiry({
    ...valid(),
    name: "字".repeat(80),
    message: "字".repeat(500),
  });
  assert.ok(result.href.length < inquiryLimits.mailto);
  assert.equal(new URL(result.href).searchParams.get("body"), result.body);
});
