// Replace the complete quoted key when supplying its value, so accepting a
// suggestion moves the cursor into the value instead of before the key quote.
const json = require('jsonc-parser');
function needsComma(text, offset, container) {
  const scanner=json.createScanner(text,false); scanner.setPosition(offset);
  function next() { let token; do { token=scanner.scan(); } while([json.SyntaxKind.Trivia,json.SyntaxKind.LineBreakTrivia,json.SyntaxKind.LineCommentTrivia,json.SyntaxKind.BlockCommentTrivia].includes(token)); return token; }
  const token=next();
  if(container==='object') return token===json.SyntaxKind.StringLiteral && next()===json.SyntaxKind.ColonToken;
  if(container==='array') return [json.SyntaxKind.StringLiteral,json.SyntaxKind.NumericLiteral,json.SyntaxKind.TrueKeyword,json.SyntaxKind.FalseKeyword,json.SyntaxKind.NullKeyword,json.SyntaxKind.OpenBraceToken,json.SyntaxKind.OpenBracketToken].includes(token);
  return false;
}
function valueEdit(text,node,offset,value) {
  if(node && ['string','number','boolean','null'].includes(node.type)) {
    const end=node.offset+node.length, container=node.parent?.type==='property' && node.parent.children[1]===node ? node.parent.parent?.type : node.parent?.type;
    return {start:node.offset,end,text:JSON.stringify(value)+(needsComma(text,end,container)?',':'')};
  }
  const location=json.getLocation(text,offset), tree=json.parseTree(text), parent=json.findNodeAtLocation(tree,location.path.slice(0,-1));
  return {start:offset,end:offset,text:JSON.stringify(value)+(needsComma(text,offset,parent?.type)?',':'')};
}
function keyEdit(text, node, key, valueSnippet, offset) {
  const escape = value => value.replace(/[\\$}]/g, '\\$&');
  if (node?.type === 'string') {
    const property = node.parent?.type === 'property' ? node.parent : undefined;
    const after = text.slice(node.offset + node.length);
    if (property?.children?.[1] || /^\s*:/.test(after)) return { start: node.offset + 1, end: node.offset + node.length - 1, text: JSON.stringify(key).slice(1, -1), snippet: false };
    return { start: node.offset, end: node.offset + node.length, text: escape(JSON.stringify(key)) + ': ' + valueSnippet + (needsComma(text,node.offset+node.length,'object')?',':''), snippet: true };
  }
  return { text: escape(JSON.stringify(key)) + ': ' + valueSnippet + (Number.isInteger(offset)&&needsComma(text,offset,'object')?',':''), snippet: true };
}
module.exports = {keyEdit,valueEdit,needsComma};
