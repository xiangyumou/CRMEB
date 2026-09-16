/* Syntax and registered-page checks for both supported uni-app targets. */
const fs=require('fs'),path=require('path');
const lib=path.resolve(__dirname,'../../template/admin/node_modules');
const parser=require(path.join(lib,'@babel/parser'));
const compiler=require(path.join(lib,'vue-template-compiler'));
const root=path.resolve(__dirname,'../../template/uni-app');
function preprocess(source,target){const stack=[];let active=true;return source.split('\n').filter(line=>{let m=line.match(/#(ifdef|ifndef)\s+([\w\s|&!-]+?)(?:\s*-->|\s*\*\/|\s*$)/);if(m){const expr=m[2].trim().replace(/[A-Z][A-Z0-9_-]*/g,k=>String(k===target||k==='MP'&&target==='MP-WEIXIN'));let yes=Function('return ('+expr+')')();if(m[1]==='ifndef')yes=!yes;stack.push({outer:active,yes});active=active&&yes;return false;}if(/#else\b/.test(line)&&stack.length){const top=stack[stack.length-1];active=top.outer&&!top.yes;return false;}if(/#endif\b/.test(line)&&stack.length){active=stack.pop().outer;return false;}return active;}).join('\n');}
let files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','unpackage'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(vue|js)$/.test(p))files.push(p);}}walk(root);
let errors=[];
for(const target of ['H5','MP-WEIXIN'])for(const file of files){let source=preprocess(fs.readFileSync(file,'utf8'),target);if(file.endsWith('.vue'))source=(compiler.parseComponent(source).script||{}).content||'';try{parser.parse(source,{sourceType:'unambiguous',plugins:['dynamicImport','objectRestSpread']});}catch(e){errors.push(`${target} ${path.relative(root,file)}: ${e.message}`);}}
const pages=JSON.parse(fs.readFileSync(path.join(root,'pages.json'),'utf8'));for(const s of pages.subPackages)for(const p of s.pages){const file=path.join(root,s.root,p.path+'.vue');if(!fs.existsSync(file))errors.push('Missing registered page '+file);}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Both targets parsed: ${files.length} source files; all registered subpackage pages exist.`);
