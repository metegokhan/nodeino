let parser;
let CppLanguage;

// Initialize Tree-sitter and load the WASM from CDN to prevent file:// CORS errors
async function initParser() {
  console.log("Tree-Sitter yükleniyor...");
  try {
    await TreeSitter.init({
      locateFile() {
        return 'https://unpkg.com/web-tree-sitter@0.20.8/tree-sitter.wasm';
      }
    });
    parser = new TreeSitter();
    
    CppLanguage = await TreeSitter.Language.load('https://unpkg.com/tree-sitter-wasms@0.1.11/out/tree-sitter-cpp.wasm');
    parser.setLanguage(CppLanguage);
    
    console.log("Tree-Sitter C++ ayrıştırıcı hazır!");
  } catch(e) {
    console.error("Tree-Sitter yüklenirken hata oluştu:", e);
  }
}

// Ham kodu AST'ye (Abstract Syntax Tree) çevirip fonksiyonları, değişkenleri ve çağrılarını çıkarır
function parseCodeToMindmap(code) {
  if (!parser) {
    console.error("Parser henüz yüklenmedi!");
    return null;
  }

  const tree = parser.parse(code);
  const root = tree.rootNode;
  
  const mapData = {
    functions: [],
    calls: [],
    globals: [],
    memUsage: []
  };

  // 1. Global Değişkenleri Bul
  root.children.forEach(child => {
    if (child.type === 'declaration') {
      let typeNode = child.children.find(c => c.type === 'primitive_type' || c.type === 'type_identifier');
      let initDecl = child.children.find(c => c.type === 'init_declarator' || c.type === 'identifier');
      
      let name = null;
      let val = "";
      if (initDecl && initDecl.type === 'init_declarator') {
        let ident = initDecl.children.find(c => c.type === 'identifier');
        let valNode = initDecl.children[initDecl.children.length - 1];
        if (ident) name = ident.text;
        if (valNode && valNode.text !== name) val = valNode.text;
      } else if (initDecl && initDecl.type === 'identifier') {
        name = initDecl.text;
      }
      
      if (name) {
        mapData.globals.push({ name, type: typeNode ? typeNode.text : 'auto', value: val });
      }
    }
  });

  // 2. AST'de Gezin ve Fonksiyonları Bul
  function traverseForFunctions(node) {
    if (node.type === 'function_definition') {
      let typeNode = node.children.find(c => c.type === 'primitive_type' || c.type === 'type_identifier');
      let decl = node.children.find(c => c.type === 'function_declarator');
      if (decl) {
        let ident = decl.children.find(c => c.type === 'identifier');
        let paramList = decl.children.find(c => c.type === 'parameter_list');
        
        if (ident) {
          const funcName = ident.text;
          const returnType = typeNode ? typeNode.text : 'void';
          
          const params = [];
          if (paramList) {
            paramList.children.forEach(p => {
              if (p.type === 'parameter_declaration') {
                let pType = p.children.find(c => c.type === 'primitive_type' || c.type === 'type_identifier');
                let pIdent = p.children.find(c => c.type === 'identifier' || c.type === 'array_declarator');
                if (pIdent) {
                  // array_declarator ise içindeki identifier'ı al
                  let actualName = pIdent.text;
                  if (pIdent.type === 'array_declarator') {
                     let innerIdent = pIdent.children.find(c => c.type === 'identifier');
                     if (innerIdent) actualName = innerIdent.text;
                  }
                  params.push({ name: actualName, type: pType ? pType.text : '' });
                }
              }
            });
          }

          mapData.functions.push({
            id: 'node-func-' + funcName,
            name: funcName,
            returnType: returnType,
            parameters: params,
            code: node.text,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1
          });
          
          let body = node.children.find(c => c.type === 'compound_statement');
          if (body) {
            traverseForCalls(body, funcName);
            traverseForMemUsage(body, funcName);
          }
        }
      }
    }
    node.children.forEach(traverseForFunctions);
  }

  // Bir fonksiyonun içindeki çağrıları (Call Expressions) bul
  function traverseForCalls(node, callerName) {
    if (node.type === 'call_expression') {
      let funcNode = node.children.find(c => c.type === 'identifier' || c.type === 'field_expression');
      if (funcNode) {
        let calleeName = funcNode.text;
        mapData.calls.push({
          from: callerName,
          to: calleeName,
          line: node.startPosition.row + 1
        });
      }
    }
    node.children.forEach(child => traverseForCalls(child, callerName));
  }
  
  // Fonksiyon içindeki değişken kullanımlarını (Okuma/Yazma) bul
  function traverseForMemUsage(node, callerName) {
    if (node.type === 'identifier') {
      if (mapData.globals.some(g => g.name === node.text)) {
        mapData.memUsage.push({ func: callerName, var: node.text });
      }
    }
    node.children.forEach(c => traverseForMemUsage(c, callerName));
  }

  traverseForFunctions(root);
  
  // Tekrarlanan memUsage kayıtlarını temizle
  mapData.memUsage = [...new Set(mapData.memUsage.map(JSON.stringify))].map(JSON.parse);

  return mapData;
}
