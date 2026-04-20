import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "../../lib/markdown";

function html(source: string): string {
  const { container } = render(<Markdown source={source} />);
  return container.innerHTML;
}

describe("Markdown", () => {
  it("returns null for an empty source", () => {
    const { container } = render(<Markdown source="" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a plain paragraph", () => {
    expect(html("hello world")).toContain("<p");
    expect(html("hello world")).toContain("hello world");
  });

  it("renders **bold** as <strong>", () => {
    expect(html("**bold**")).toContain("<strong>bold</strong>");
  });

  it("renders *italic* as <em>", () => {
    expect(html("*italic*")).toContain("<em>italic</em>");
  });

  it("renders `code` as <code>", () => {
    expect(html("call `fn()` now")).toContain("<code");
    expect(html("call `fn()` now")).toContain("fn()");
  });

  it("renders [text](https://url) as an external link", () => {
    const out = html("go [home](https://example.com)");
    expect(out).toContain('<a');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noreferrer"');
  });

  it("does not turn non-http URLs into clickable links", () => {
    const out = html("bad [x](javascript:alert(1))");
    // The text may still appear literally, but we must not emit an anchor
    // with a javascript: href (that would be the actual XSS vector).
    expect(out).not.toContain("<a");
    expect(out).not.toContain('href="javascript:');
  });

  it("renders a bullet list (dashes or stars)", () => {
    const out = html("- one\n- two\n* three");
    expect(out).toContain("<ul");
    expect(out.match(/<li/g)?.length).toBe(3);
  });

  it("renders an ordered list", () => {
    const out = html("1. first\n2. second");
    expect(out).toContain("<ol");
    expect(out.match(/<li/g)?.length).toBe(2);
  });

  it("splits content into multiple paragraphs on blank lines", () => {
    const out = html("para one\n\npara two");
    expect(out.match(/<p/g)?.length).toBe(2);
  });

  it("converts single newlines within a paragraph to <br>", () => {
    const out = html("line one\nline two");
    expect(out).toContain("<br");
  });

  it("mixes inline marks in a paragraph", () => {
    const out = html("a **bold** and *italic* with `code`");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<code");
  });

  it("handles a list followed by a paragraph", () => {
    const out = html("- item a\n- item b\n\nafter");
    expect(out).toContain("<ul");
    expect(out).toContain("<p");
  });

  it("does not emit raw HTML from user input (XSS-safe by construction)", () => {
    const out = html("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("applies the className prop to the wrapper", () => {
    const { container } = render(
      <Markdown source="hi" className="my-wrap" />,
    );
    expect(container.firstChild).toHaveClass("my-wrap");
  });
});
