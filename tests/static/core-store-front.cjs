/* Validate registered pages, local imports and DIY names for both targets. */
'use strict';
const fs = require('fs');
const path = require('path');
const lib = path.resolve(__dirname, '../../template/admin/node_modules');
const parser = require(path.join(lib, '@babel/parser'));
const compiler = require(path.join(lib, 'vue-template-compiler'));
const root = path.resolve(__dirname, '../../template/uni-app');
const admin = path.resolve(__dirname, '../../template/admin/src');

function preprocess(source, target) {
  const stack = [];
  let active = true;
  return source.split('\n').filter(line => {
    const match = line.match(/#(ifdef|ifndef)\s+([\w\s|&!-]+?)(?:\s*-->|\s*\*\/|\s*$)/);
    if (match) {
      const expr = match[2].trim().replace(/[A-Z][A-Z0-9_-]*/g, key => String(key === target || key === 'MP' && target === 'MP-WEIXIN'));
      let yes = Function('return (' + expr + ')')();
      if (match[1] === 'ifndef') yes = !yes;
      stack.push({ outer: active, yes });
      active = active && yes;
      return false;
    }
    if (/#else\b/.test(line) && stack.length) {
      const top = stack[stack.length - 1];
      active = top.outer && !top.yes;
      return false;
    }
    if (/#endif\b/.test(line) && stack.length) {
      active = stack.pop().outer;
      return false;
    }
    return active;
  }).join('\n');
}

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'unpackage'].includes(entry.name)) continue;
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(name);
    else if (/\.(vue|js)$/.test(name)) files.push(name);
  }
}
walk(root);
const errors = [];
function existsImport(file, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('@/')) return true;
  const resolved = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
  return ['', '.js', '.vue', '.json', '/index.js', '/index.vue'].some(ext => fs.existsSync(resolved + ext) && fs.statSync(resolved + ext).isFile());
}
for (const target of ['H5', 'MP-WEIXIN']) {
  for (const file of files) {
    let source = preprocess(fs.readFileSync(file, 'utf8'), target);
    if (file.endsWith('.vue')) source = (compiler.parseComponent(source).script || {}).content || '';
    try {
      const ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['dynamicImport', 'objectRestSpread'] });
      for (const statement of ast.program.body) {
        if ((statement.type === 'ImportDeclaration' || statement.type === 'ExportNamedDeclaration') && statement.source && !existsImport(file, statement.source.value)) {
          errors.push(`${target} ${path.relative(root, file)}: missing import ${statement.source.value}`);
        }
      }
    } catch (error) {
      errors.push(`${target} ${path.relative(root, file)}: ${error.message}`);
    }
  }
}
const pages = JSON.parse(fs.readFileSync(path.join(root, 'pages.json'), 'utf8'));
for (const page of pages.pages || []) {
  if (!fs.existsSync(path.join(root, page.path + '.vue'))) errors.push(`Missing main page ${page.path}`);
}
for (const group of pages.subPackages || []) {
  for (const page of group.pages) {
    if (!fs.existsSync(path.join(root, group.root, page.path + '.vue'))) errors.push(`Missing subpackage page ${group.root}/${page.path}`);
  }
}

function names(file, variable) {
  const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module' });
  const declaration = ast.program.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration && node.declaration.declarations && node.declaration.declarations.some(item => item.id.name === variable));
  if (!declaration) throw Error(`Missing DIY registry: ${file}`);
  return declaration.declaration.declarations.find(item => item.id.name === variable).init.elements.map(item => item.value);
}
try {
  const client = names(path.join(root, 'utils/diyRegistry.js'), 'diyComponentNames');
  const editor = names(path.join(admin, 'utils/diyRegistry.js'), 'retainedDiyNames').filter(name => name !== 'bottomMenu');
  if (new Set(client).size !== client.length || JSON.stringify(client) !== JSON.stringify(editor)) errors.push('DIY client/editor registry mismatch');
  const template = compiler.parseComponent(fs.readFileSync(path.join(root, 'subpackage/diyComponents/pageDesign.vue'), 'utf8')).template.content;
  for (const match of template.matchAll(/item\.name\s*==\s*['"]([^'"]+)['"]/g)) {
    if (!client.includes(match[1])) errors.push(`Unregistered DIY component: ${match[1]}`);
  }
  for (const required of ['combination', 'presale', 'newVip', 'coupon', 'customerService']) {
    if (!client.includes(required)) errors.push(`Missing retained DIY component: ${required}`);
  }
} catch (error) {
  errors.push(error.message);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Both targets parsed: ${files.length} source files; registered pages, local imports and DIY names checked.`);
}
