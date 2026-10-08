let parser;
let CppLanguage;

// Initialize Tree-sitter and load the WASM
async function initParser() {
  console.log("Tree-Sitter yükleniyor...");
  await TreeSitter.init();
  parser = new TreeSitter();
  
  // Yüklediğimiz wasm dosyasından C++ dil gramerini al
  CppLanguage = await TreeSitter.Language.load('tree-sitter-cpp.wasm');
  parser.setLanguage(CppLanguage);
  
  console.log("Tree-Sitter C++ ayrıştırıcı hazır!");
}

// Ham kodu AST'ye (Abstract Syntax Tree) çevirip fonksiyonları ve çağrılarını (Call Graph) çıkarır
function parseCodeToMindmap(code) {
  if (!parser) {
    console.error("Parser henüz yüklenmedi!");
    return null;
  }

  const tree = parser.parse(code);
  const root = tree.rootNode;
  
  const mapData = {
    functions: [],
    calls: [] // Kim kimi çağırıyor
  };

  // 1. AST'de Gezin ve Fonksiyonları Bul
  function traverseForFunctions(node) {
    if (node.type === 'function_definition') {
      // Fonksiyon adını bul (type -> function_declarator -> identifier)
      let decl = node.children.find(c => c.type === 'function_declarator');
      if (decl) {
        let ident = decl.children.find(c => c.type === 'identifier');
        if (ident) {
          const funcName = ident.text;
          mapData.functions.push({
            id: 'node-func-' + funcName,
            name: funcName,
            code: node.text,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1
          });
          
          // 2. Bu fonksiyonun içindeki çağrıları (Call Expressions) bul
          let body = node.children.find(c => c.type === 'compound_statement');
          if (body) {
            traverseForCalls(body, funcName);
          }
        }
      }
    }
    
    node.children.forEach(traverseForFunctions);
  }

  // 2. Bir fonksiyonun (body) içindeki diğer fonksiyon çağrılarını bul
  function traverseForCalls(node, callerName) {
    if (node.type === 'call_expression') {
      // call_expression -> function -> identifier
      let funcNode = node.children.find(c => c.type === 'identifier' || c.type === 'field_expression');
      if (funcNode) {
        let calleeName = funcNode.text;
        
        // Sadece kendi fonksiyonlarımız arasındaki çağrıları kaydet (ileride tüm kütüphaneler de eklenebilir)
        mapData.calls.push({
          from: callerName,
          to: calleeName,
          line: node.startPosition.row + 1
        });
      }
    }
    
    node.children.forEach(child => traverseForCalls(child, callerName));
  }

  traverseForFunctions(root);
  return mapData;
}
