import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseListPageHtml } from "./parser.ts";

describe("parseListPageHtml", () => {
  // Real HTML observed from https://superkts.com/lotto/list/?pg=124
  // (2026-09-11) — not a fabricated fixture. Rounds 1-3, the oldest draws on
  // the site (pg=124 is the last page). The 7th <span class="nN"> per row is
  // the bonus number; the first 6 are the main numbers, already sorted
  // ascending in the source markup.
  const REAL_HTML = `
    <table>
    <tr><td>3</td><td><span class="n2">11</span></td><td><span class="n2">16</span></td><td><span class="n2">19</span></td><td><span class="n3">21</span></td><td><span class="n3">27</span></td><td><span class="n4">31</span></td><td><span class="n3">30</span></td><td><a href="/lotto/3">보기</a></td></tr>
    <tr><td>2</td><td><span class="n1">9</span></td><td><span class="n2">13</span></td><td><span class="n3">21</span></td><td><span class="n3">25</span></td><td><span class="n4">32</span></td><td><span class="n5">42</span></td><td><span class="n1">2</span></td><td><a href="/lotto/2">보기</a></td></tr>
    <tr><td>1</td><td><span class="n1">10</span></td><td><span class="n3">23</span></td><td><span class="n3">29</span></td><td><span class="n4">33</span></td><td><span class="n4">37</span></td><td><span class="n4">40</span></td><td><span class="n2">16</span></td><td><a href="/lotto/1">보기</a></td></tr>
    </table>
  `;

  test("extracts round, 6 sorted main numbers, and bonus from each row", () => {
    const draws = parseListPageHtml(REAL_HTML);
    assert.equal(draws.length, 3);
    assert.deepEqual(draws[0], { round: 3, main: [11, 16, 19, 21, 27, 31], bonus: 30 });
    assert.deepEqual(draws[1], { round: 2, main: [9, 13, 21, 25, 32, 42], bonus: 2 });
    assert.deepEqual(draws[2], { round: 1, main: [10, 23, 29, 33, 37, 40], bonus: 16 });
  });

  test("returns an empty array for HTML with no matching rows", () => {
    assert.deepEqual(parseListPageHtml("<html><body>no draws here</body></html>"), []);
  });

  test("skips a malformed row that doesn't have exactly 7 numbers", () => {
    const malformed = `<tr><td>99</td><td><span class="n1">1</span></td><td><span class="n2">2</span></td></tr>`;
    assert.deepEqual(parseListPageHtml(malformed), []);
  });
});
