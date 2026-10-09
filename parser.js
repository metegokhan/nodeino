let parser;
let CppLanguage;

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

function parseCodeToMindmap(code) {
  if (!parser) return null;
  const tree = parser.parse(code);
  const root = tree.rootNode;
  
  const mapData = {
    functions: [],
    calls: [],
    globals: [],
    funcWrites: [], // func -> var
    funcReads: []   // var -> func
  };

  // 1. Global Değişkenleri Bul
  root.children.forEach(child => {
    if (child.type === 'declaration') {
      let typeNode = child.children.find(c => c.type === 'primitive_type' || c.type === 'type_identifier');
      let initDecl = child.children.find(c => c.type === 'init_declarator' || c.type === 'identifier');
      
      let name = null, val = "";
      if (initDecl && initDecl.type === 'init_declarator') {
        let ident = initDecl.children.find(c => c.type === 'identifier');
        let valNode = initDecl.children[initDecl.children.length - 1];
        if (ident) name = ident.text;
        if (valNode && valNode.text !== name) val = valNode.text;
      } else if (initDecl && initDecl.type === 'identifier') {
        name = initDecl.text;
      }
      if (name) mapData.globals.push({ name, type: typeNode ? typeNode.text : 'auto', value: val });
    }
  });

  // 2. Fonksiyonları ve Gövdelerini İncele
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
            analyzeBody(body, funcName);
          }
        }
      }
    }
    node.children.forEach(traverseForFunctions);
  }

  // Fonksiyon gövdesi analizi: Atamalar, Çağrılar, Kullanımlar
  function analyzeBody(bodyNode, callerName) {
    function walk(node) {
      // a) Değişken Ataması (var = func() veya var = x)
      if (node.type === 'assignment_expression' || node.type === 'declaration') {
        let varName = null;
        let rightSide = null;
        
        if (node.type === 'assignment_expression') {
          let left = node.children[0];
          if (left && left.type === 'identifier') varName = left.text;
          rightSide = node.children[2];
        } else if (node.type === 'declaration') {
          let initDecl = node.children.find(c => c.type === 'init_declarator');
          if (initDecl) {
             let left = initDecl.children.find(c => c.type === 'identifier');
             if (left) varName = left.text;
             rightSide = initDecl.children[initDecl.children.length - 1];
          }
        }

        // Eğer atanılan değişken Global ise ve sağ taraf bir fonksiyon çağrısı ise:
        if (varName && rightSide && rightSide.type === 'call_expression') {
           let fn = rightSide.children.find(c => c.type === 'identifier' || c.type === 'field_expression');
           let funcName = fn ? fn.text : null;
           
           if (funcName && mapData.globals.some(g => g.name === varName)) {
             // Caller -> Func, Func -> Var
             mapData.calls.push({ from: callerName, to: funcName, line: rightSide.startPosition.row + 1 });
             mapData.funcWrites.push({ func: funcName, var: varName, line: node.startPosition.row + 1 });
             
             let argList = rightSide.children.find(c => c.type === 'argument_list');
             if (argList) processArguments(argList, funcName);
             return; // Dalı burada kes
           }
        }
        // Atanılan değişken global ama sağ taraf basit bir değerse:
        if (varName && mapData.globals.some(g => g.name === varName)) {
           mapData.funcWrites.push({ func: callerName, var: varName, line: node.startPosition.row + 1 });
        }
      }

      // b) Basit Fonksiyon Çağrısı (Örn: stopMotors())
      if (node.type === 'call_expression') {
         let fn = node.children.find(c => c.type === 'identifier' || c.type === 'field_expression');
         if (fn) {
            let funcName = fn.text;
            mapData.calls.push({ from: callerName, to: funcName, line: node.startPosition.row + 1 });
            let argList = node.children.find(c => c.type === 'argument_list');
            if (argList) processArguments(argList, funcName);
         }
         return; // Dalı kes
      }

      // c) Diğer kullanımlar (if (clean < 20) gibi)
      if (node.type === 'identifier') {
         let varName = node.text;
         if (mapData.globals.some(g => g.name === varName)) {
            // Sadece Read olarak kabul ediyoruz
            mapData.funcReads.push({ func: callerName, var: varName, argIndex: -1 });
         }
      }

      node.children.forEach(walk);
    }
    
    function processArguments(argList, targetFuncName) {
      let argIndex = 0;
      argList.children.forEach(c => {
        if (c.type === 'identifier') {
          let varName = c.text;
          if (mapData.globals.some(g => g.name === varName)) {
             mapData.funcReads.push({ func: targetFuncName, var: varName, argIndex: argIndex });
          }
          argIndex++;
        } else if (c.type !== '(' && c.type !== ')' && c.type !== ',') {
          argIndex++;
          walk(c); // Argüman içindeki karmaşık ifadeleri incele
        }
      });
    }

    walk(bodyNode);
  }

  traverseForFunctions(root);
  
  // Tekrar edenleri temizle
  mapData.funcWrites = [...new Set(mapData.funcWrites.map(JSON.stringify))].map(JSON.parse);
  mapData.funcReads = [...new Set(mapData.funcReads.map(JSON.stringify))].map(JSON.parse);
  mapData.calls = [...new Set(mapData.calls.map(JSON.stringify))].map(JSON.parse);

  return mapData;
}
