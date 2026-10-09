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
    
    // Yüklediğimiz wasm dosyasından C++ dil gramerini al (CDN üzerinden)
    CppLanguage = await TreeSitter.Language.load('https://unpkg.com/tree-sitter-wasms@0.1.11/out/tree-sitter-cpp.wasm');
    parser.setLanguage(CppLanguage);
    
    console.log("Tree-Sitter C++ ayrıştırıcı hazır!");
  } catch(e) {
    console.error("Tree-Sitter yüklenirken hata oluştu:", e);
  }
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
