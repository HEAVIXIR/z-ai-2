import { describe, expect, it } from "vitest";
import { convertIranDivisionsCsv } from "../../scripts/geospatial/convert-iran-divisions.mjs";

function fixture() {
  const rows = [
    ["1", "", "ایران", "00", "0"],
    ["2", "1", "تهران", "01", "1"],
    ["3", "2", "تهران", "01", "2"],
    ["4", "3", "مرکزی", "01", "3"],
    ["5", "4", "تهران", "1001", "5"],
    ["6", "5", "تهران ۱", "2001", "7"],
    ["7", "4", "آبادی نمونه", "100001", "6"],
  ];
  return ["Id,ParentCountryDivisionId,Name,Code,DivisionType", ...rows.map((r) => r.join(","))].join("\r\n");
}

describe("Iran administrative CSV converter", () => {
  it("parses quoted commas, escaped quotes, CRLF, and UTF-8 BOM", () => {
    const rows = fixture().replace("ایران", '"ایران, عزیز"').replace("مرکزی", '"مرکزی ""بخش"" "');
    const text = "\uFEFF" + rows + "\r\n";
    expect(() => convertIranDivisionsCsv(text)).toThrow(/Expected 31 provinces/);
  });

  it("rejects duplicate source IDs before hierarchy resolution", () => {
    const text = fixture() + "\r\n5,4,شهر تکراری,1002,5";
    expect(() => convertIranDivisionsCsv(text)).toThrow(/Duplicate source Id/);
  });

  it("rejects orphaned administrative rows outside the selected city levels", () => {
    const text = [
      "Id,ParentCountryDivisionId,Name,Code,DivisionType",
      "1,,ایران,00,0",
      "2,missing,شهرستان,01,2",
    ].join("\n");
    expect(() => convertIranDivisionsCsv(text)).toThrow(/missing parent/);
  });

  it("rejects a city whose ancestry cannot reach a province", () => {
    const text = [
      "Id,ParentCountryDivisionId,Name,Code,DivisionType",
      "1,,ایران,00,0",
      "2,99,شهر,1001,5",
    ].join("\n");
    expect(() => convertIranDivisionsCsv(text)).toThrow(/no resolvable province ancestor/);
  });

  it("keeps urban zones separate and resolves city province through county and district", () => {
    const rows = [];
    rows.push(["1", "", "ایران", "00", "0"]);
    rows.push(["2", "1", "تهران", "01", "1"]);
    rows.push(["3", "2", "شهرستان", "01", "2"]);
    rows.push(["4", "3", "بخش", "01", "3"]);
    rows.push(["5", "4", "شهر", "1001", "5"]);
    for (let i = 2; i <= 31; i++) rows.push([String(i + 10), "1", `استان ${i}`, String(i).padStart(2, "0"), "1"]);
    for (let i = 2; i <= 1481; i++) rows.push([String(i + 100), "4", `شهر ${i}`, String(1000 + i), "5"]);
    rows.push(["9999", "5", "منطقه شهری", "2001", "7"]);
    const text = ["Id,ParentCountryDivisionId,Name,Code,DivisionType", ...rows.map((r) => r.join(","))].join("\n");
    const result = convertIranDivisionsCsv(text);
    expect(result.dataset.countries).toHaveLength(1);
    expect(result.dataset.provinces).toHaveLength(31);
    expect(result.dataset.cities).toHaveLength(1481);
    expect(result.dataset.cities[0].provinceCode).toBe("province:01");
    expect(result.sourceCounts.urbanZone).toBe(1);
  });
});
