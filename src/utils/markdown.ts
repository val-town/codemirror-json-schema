export type MarkdownRenderer = (markdown: string) => string;

/**
 * Default markdown renderer that returns the input as-is.
 * Users can provide their own renderer (e.g. using markdown-it)
 * via the options on hover, completion, and validation.
 */
export const defaultMarkdownRenderer: MarkdownRenderer = (markdown) => markdown;
