/** Character offsets into the full deck source. */
export type SourceRange = { from: number; to: number };
export type Warning = { message: string; range: SourceRange; slideIndex?: number };
export type Grid = { cols: number; rows: number };
/** 1-based, inclusive. */
export type Span = [start: number, end: number];
