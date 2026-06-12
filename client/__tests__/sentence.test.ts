import { describe, it, expect } from 'vitest';
import { findFirstSentenceEnd } from '@/lib/sentence';

describe('findFirstSentenceEnd', () => {
  it('returns -1 when no sentence has completed yet', () => {
    expect(findFirstSentenceEnd('Hello there, how can I')).toBe(-1);
  });

  it('returns -1 when punctuation is not yet followed by whitespace', () => {
    // The stream may end mid-sentence — wait for the next chunk to confirm
    expect(findFirstSentenceEnd('That costs $3.')).toBe(-1);
  });

  it('finds a simple sentence boundary', () => {
    const text = 'Hello there. How can I help?';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('Hello there. ');
    expect(text.slice(end)).toBe('How can I help?');
  });

  it('handles exclamation and question marks', () => {
    const text = 'Great question! Let me check.';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('Great question! ');
  });

  it('does not split after honorifics like Dr.', () => {
    const text = 'Dr. Smith is available tomorrow. Shall I book it?';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('Dr. Smith is available tomorrow. ');
  });

  it('does not split after Mr. or Mrs.', () => {
    const text = 'I found Mr. Jones and Mrs. Lee in the system. Both are active.';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('I found Mr. Jones and Mrs. Lee in the system. ');
  });

  it('does not split after single-letter initials', () => {
    const text = 'The account owner is J. Doe from Acme. Want details?';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('The account owner is J. Doe from Acme. ');
  });

  it('does not split after e.g. or i.e.', () => {
    const text = 'Try a filter, e.g. by region. That narrows results.';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('Try a filter, e.g. by region. ');
  });

  it('does not treat a numbered list marker as a sentence end', () => {
    const text = '1. Check the order status first. 2. Then escalate.';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('1. Check the order status first. ');
  });

  it('does not split decimals followed by more text', () => {
    const text = 'The total is 3.5 hours of work. Should I proceed?';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('The total is 3.5 hours of work. ');
  });

  it('consumes multiple whitespace characters after the boundary', () => {
    const text = 'Done.\n\nNext steps are listed below.';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end)).toBe('Done.\n\n');
    expect(text.slice(end)).toBe('Next steps are listed below.');
  });

  it('slicing at the boundary loses no characters', () => {
    const text = 'First sentence. Second sentence.';
    const end = findFirstSentenceEnd(text);
    expect(text.slice(0, end) + text.slice(end)).toBe(text);
  });
});
