// Replace the complete quoted key when supplying its value, so accepting a
// suggestion moves the cursor into the value instead of before the key quote.
function keyEdit(text, node, key, valueSnippet) {
  const escape = value => value.replace(/[\\$}]/g, '\\$&');
  if (node?.type === 'string') {
    const property = node.parent?.type === 'property' ? node.parent : undefined;
    const after = text.slice(node.offset + node.length);
    if (property?.children?.[1] || /^\s*:/.test(after)) return { start: node.offset + 1, end: node.offset + node.length - 1, text: JSON.stringify(key).slice(1, -1), snippet: false };
    return { start: node.offset, end: node.offset + node.length, text: escape(JSON.stringify(key)) + ': ' + valueSnippet, snippet: true };
  }
  return { text: escape(JSON.stringify(key)) + ': ' + valueSnippet, snippet: true };
}
module.exports = {keyEdit};
