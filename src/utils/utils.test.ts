import { expect, test, vi, describe } from "vitest";
import { gate, sanitizeMarkdownHeadersToRfcBullets } from "./utils";

describe("gate", () => {
  test("allows and blocks as expected", () => {
    const g = gate();

    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubscribeA = g.listen(listenerA);
    g.listen(listenerB);

    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).not.toHaveBeenCalled();

    unsubscribeA();

    g.open();

    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalledTimes(1);

    g.open(); // second open is a no-op

    expect(listenerB).toHaveBeenCalledTimes(1);

    const lateListener = vi.fn();
    const unsubscribeLate = g.listen(lateListener);

    expect(lateListener).toHaveBeenCalledTimes(1);

    unsubscribeLate();
  });
});

describe("sanitizeMarkdownHeadersToRfcBullets", () => {
  test("converts single top-level heading", () => {
    const input = "# Title";
    const output = sanitizeMarkdownHeadersToRfcBullets(input);
    expect(output).toBe("**1 Title**");
  });

  test("converts multiple top-level headings with incremental numbering", () => {
    const input = ["# First", "# Second", "# Third"].join("\n");
    const output = sanitizeMarkdownHeadersToRfcBullets(input);
    expect(output).toBe(
      ["**1 First**", "**2 Second**", "**3 Third**"].join("\n")
    );
  });

  test("handles nested headings with hierarchical numbering", () => {
    const input = ["# Section", "## Subsection A", "## Subsection B"].join(
      "\n"
    );
    const output = sanitizeMarkdownHeadersToRfcBullets(input);
    expect(output).toBe(
      ["**1 Section**", "**1.1 Subsection A**", "**1.2 Subsection B**"].join(
        "\n"
      )
    );
  });

  test("handles three levels of headings", () => {
    const input = ["# Section", "## Sub", "### Detail"].join("\n");
    const output = sanitizeMarkdownHeadersToRfcBullets(input);
    expect(output).toBe(
      ["**1 Section**", "**1.1 Sub**", "**1.1.1 Detail**"].join("\n")
    );
  });

  test("resets deeper levels when returning to higher level", () => {
    const input = ["# One", "## A", "### a1", "## B", "# Two", "## C"].join(
      "\n"
    );
    const output = sanitizeMarkdownHeadersToRfcBullets(input);
    expect(output).toBe(
      [
        "**1 One**",
        "**1.1 A**",
        "**1.1.1 a1**",
        "**1.2 B**",
        "**2 Two**",
        "**2.1 C**",
      ].join("\n")
    );
  });

  test("leaves non-heading lines unchanged", () => {
    const input = ["Paragraph", "- list item", "Not a # heading"].join("\n");
    const output = sanitizeMarkdownHeadersToRfcBullets(input);
    expect(output).toBe(input);
  });

  test("ignores headings inside fenced code blocks", () => {
    const input = [
      "```",
      "# Not a heading",
      "## Still not",
      "```",
      "# Real heading",
    ].join("\n");
    const output = sanitizeMarkdownHeadersToRfcBullets(input);
    expect(output).toBe(
      [
        "```",
        "# Not a heading",
        "## Still not",
        "```",
        "**1 Real heading**",
      ].join("\n")
    );
  });

  test("is idempotent when called multiple times", () => {
    const input = ["# Title", "## Sub"].join("\n");
    const once = sanitizeMarkdownHeadersToRfcBullets(input);
    const twice = sanitizeMarkdownHeadersToRfcBullets(once);
    expect(twice).toBe(once);
  });
});
