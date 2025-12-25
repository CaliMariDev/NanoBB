function getKeyByValue(obj, value){
  return Object.keys(obj).find(key => obj[key] === value);
}

var tokType = {
    nil: Symbol(), //Fallback Type
    root: Symbol(), //Base Of Tree
    group: Symbol(), //Groups (Debug Type)
    str: Symbol(), //Strings
    num: Symbol(), //Numbers
    sym: Symbol(), //Symbols
    call: Symbol(), //Function Call (S-Expression)
    func: Symbol(), //Lambda Function
    code: Symbol(), //Code Block
    arr: Symbol(), //Array (Quote)
    delim: Symbol(), //Delimiter
}

class astToken {
    constructor(type,val,...toks){
        this.isToken = true;
        this.type = type;
        this.val = val;
        this.children = [];
        for(let i = 0; i < toks.length; i++){
            this.push(toks[i]);
        }
        this.cleanValues();
    }

    stringifyType(){
        return getKeyByValue(tokType, this.type);
    }

    setType(type){
        //Safely Change Type
        this.type = type;
        this.cleanValues();
    }

    get size(){
        return this.children.length;
    }
    set size(x){}

    get hasBody(){
        return this.children.length > 0;
    }
    set hasBody(x){}

    push(a){
        if(!a.isToken){ return; }
        this.children.push(a);
    }

    pop(id){
        if(!(this.children[id]??"").isToken){ return new astToken(); }
        return this.children.splice(id,1)[0];
    }

    getChild(id){
        if(!(this.children[id]??"").isToken){ return new astToken(); }
        return this.children[id];
    }

    getRef(dat){
        return dat[this.val];
    }

    toRawData(dat){

    }

    checkSpecs(specs){
        //Check Token Specifications
        specs = specs ?? {};
        if(specs.type && this.type != specs.type) return false; 
        if(specs.val && this.val != specs.val) return false; 
        if(specs.minsize && this.size < specs.minsize) return false;
        if(specs.maxsize && this.size > specs.maxsize) return false;
        if(specs.size && this.size != specs.size) return false; 
        return true;
    }

    checkAllSpecs(specs){
        //Shallow | Check Children Token Specifications
        for(let i = 0; i < this.children.length; i++){
            if(!this.children[i].checkSpecs(specs)) return false;
        }
        return true;
    }

    cleanValues(){
        //Cleans Values In astToken For Them To Safely Be Their Specific Type
        if(!Object.values(tokType).includes(this.type)){
            this.type = tokType.nil;
        }
        this.filter(x=>x.isToken);
    }

    map(fn){
        //Maps Children To New Token Through Function
        for(let i = 0; i < this.children.length; i++){
            this.children[i] = fn(this.children[i], i, this);
        }
        this.cleanValues();
    }

    filter(fn){
        //Filters Children Through Function
        this.children.filter((x,i)=>{
            return fn(x,i,this);
        });
    }

    split(specs){
        //Shallow | Splits Tokens Into Group ASTTokens
        let ret = [];
        let c = [];
        for(let i = 0; i < this.children.length; i++){
            if(this.children[i].checkSpecs(specs)){
                if(c.length > 0){ret.push(new astToken(tokType.group,undefined,...c)); c = [];}
            }else {
                c.push(this.children[i]);
            };
        }
        if(c.length > 0){ret.push(new astToken(tokType.group,undefined,...c)); c = [];}
        return ret;
    }

    recurse(fn,dat){
        //Recursive | Runs A Function That Executes Through Self And All Children
        for(let i = 0; i < this.children.length; i++){
            this.children[i].recurse(fn, dat);
        }
        fn(this, dat);
    }

    forEach(fn){
        for(let i = 0; i < this.children.length; i++){
            fn(this,this.children[i],i);
        }
    }

    stringify(indent){
        let noIndent = false;
        if(indent == -1){ indent = 0; noIndent = true; }
        indent = indent ?? 0;
        let ret = `${" ".repeat(indent)}(${[this.stringifyType(),`${this.val==undefined?"":'"'+String(this.val.stringify?this.val.stringify(-1):this.val)+'"'}`,this.hasBody?`[\n${[...this.children].map(x=>x.stringify(indent+(noIndent?-1:1))).join(noIndent?" ":"\n")}\n${" ".repeat(indent)}]`:""].filter(x=>String(x??"").length>0).join(" ")})`;
        if(noIndent){ ret = ret.replaceAll("\n",""); }
        return ret;
    }
}

var nanolib = new (class {
    constructor(){

    }

    downloadTextFile(filename, text) {
        // 1. Create a Blob object from the text content
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        
        // 2. Create a temporary anchor element (<a>)
        const anchor = document.createElement('a');
        
        // 3. Set the download attribute to specify the file name
        anchor.download = filename;
        
        // 4. Create an object URL for the Blob and set it as the link's href
        anchor.href = window.URL.createObjectURL(blob);
        
        // 5. Append the anchor to the body (necessary for some browsers to trigger click)
        anchor.style.display = 'none'; // Hide the element
        document.body.appendChild(anchor);
        
        // 6. Programmatically click the link to trigger the download
        anchor.click();
        
        // 7. Clean up by removing the element and revoking the object URL
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(anchor.href); // Free up memory
    }

    parseAST(code){
        let ast = this.tokenize(code.split("\n").filter(x=>x.trim().slice(0,2)!="//").join("\n"));
        //Convert Number Symbols Into Raw Numbers
        ast.recurse((x)=>{
            if(x.type == tokType.sym){
                if(!Number.isNaN(Number(x.val))){
                    x.setType(tokType.num);
                    x.val = Number(x.val);
                }
            }
        });
        //Create Lambda Functions
        ast.recurse((x)=>{
            if(x.hasBody){
                x.forEach((self,e,id)=>{
                    if(e.type == tokType.code && self.getChild(id-1).type == tokType.call){
                        e.val = self.pop(id-1);
                        e.setType(tokType.func);
                    }
                });
            }
        });
        return ast;
    }

    tokenize(code,type,ret){
        //Return astToken But As Raw Token Heirarchy
        code = String(code);
        type = type ?? "sym";
        ret = ret ?? new astToken(tokType.root);
        ret.children = [];
        let c = new astToken();
        let pack;
        let pushC = false;
        let pushC_Req = false;
        for(let it = 0; it <= code.length; it++){
            let ch = code[it] ?? " ";
            switch(type){
                case("sym"):
                    if("\n\t ".includes(ch)){
                        c.setType(tokType.sym);
                        pushC = true;
                        pushC_Req = true;
                    }else if(ch == "("){
                        c.setType(tokType.sym);
                        pushC = true;
                        pushC_Req = true;
                        //Make A Call
                        pack = 0;
                        type = "call";
                    }else if(ch == "["){
                        c.setType(tokType.sym);
                        pushC = true;
                        pushC_Req = true;
                        //Make A Call
                        pack = 0;
                        type = "arr";
                    }else if(ch == "{"){
                        c.setType(tokType.sym);
                        pushC = true;
                        pushC_Req = true;
                        //Make A Call
                        pack = 0;
                        type = "code";
                    }else if("\"'`".includes(ch)){
                        c.setType(tokType.sym);
                        pushC = true;
                        pushC_Req = true;
                        //Make A Call
                        pack = ch;
                        type = "str";
                    }else {
                        c.val = `${c.val??""}${ch}`;
                    }
                    break;
                case("str"):
                    if(ch == pack){
                        c.setType(tokType[type]);
                        pushC = true;
                        type = "sym";
                    }else if(ch == "\\"){
                        it++;
                        ch = code[it];
                        switch(ch){
                            case("n"):
                                c.val = `${c.val??""}\n`;
                                break;
                            case("t"):
                                c.val = `${c.val??""}\t`;
                                break;
                            case("r"):
                                c.val = `${c.val??""}\r`;
                                break;
                            case("\\"):
                                c.val = `${c.val??""}\\`;
                                break;
                            default:
                                c.val = `${c.val??""}${ch}`;
                                break;
                        } 
                    }else {
                        c.val = `${c.val??""}${ch}`;
                    }
                    break;
                case("call"):
                    if(ch == "("){
                        pack++;
                    }else if(ch == ")"){
                        pack--;
                    }
                    if(pack < 0){
                        this.tokenize(c.val??"",null,c);
                        c.setType(tokType[type]);
                        c.val = undefined;
                        pushC = true;
                        type = "sym";
                    }else {
                        c.val = `${c.val??""}${ch}`;
                    }
                    break;
                case("arr"):
                    if(ch == "["){
                        pack++;
                    }else if(ch == "]"){
                        pack--;
                    }
                    if(pack < 0){
                        this.tokenize(c.val??"",null,c);
                        c.setType(tokType[type]);
                        c.val = undefined;
                        pushC = true;
                        type = "sym";
                    }else {
                        c.val = `${c.val??""}${ch}`;
                    }
                    break;
                case("code"):
                    if(ch == "{"){
                        pack++;
                    }else if(ch == "}"){
                        pack--;
                    }
                    if(pack < 0){
                        this.tokenize(c.val??"",null,c);
                        c.setType(tokType[type]);
                        c.val = undefined;
                        pushC = true;
                        type = "sym";
                    }else {
                        c.val = `${c.val??""}${ch}`;
                    }
                    break;
                default:
                    throw "Tokenizer Error: Unknown Type";
            }
            if(pushC){
                if(!pushC_Req || (c.val??"") != ""){
                    ret.push(c);
                }
                c = new astToken();
            }
            pushC_Req = false;
            pushC = false;
        }
        return ret;
    }

    safeString(txt){
        //Makes A String That's JS Safe
        return `"${String(txt).replaceAll("\\","\\\\").replaceAll("\n","\\n").replaceAll("\t","\\t").replaceAll("\r","\\r").replaceAll("\"","\\\"")}"`;
    }

    safeSym(sym){
        //Makes A Symbol That Represents The Same Value But Is Safe
        let ret = [...String(sym)].map(x=>x.charCodeAt(0).toString(32)).join("");
        return `v${ret}`;
    }
})();

class NanoBB_instance {
    constructor(code, io, flags){
        this.io = io ?? (()=>{});
        if(code){
            this.compile(code, flags);
        }
    }

    err(loc,info,dat){
        dat = dat ?? {};
        return `NanoBB Encountered ${loc} Error: ${info}${dat.at?` at "${dat.at}"`:""}`
    }

    malloc(name,mem){
        if(mem[name] == undefined){
            mem[name] = {};
            mem[name].ref = `"${nanolib.safeSym(name)}"`;
        }
        return mem[name];
    }

    getRef(name,mem){
        if(mem[name]){ return mem[name]; }
        return this.malloc(name,mem);
    }

    getRawRef(name,mem){
        let ref = this.getRef(name,mem);
        return `mem[${ref.ref}]`;
    }

    isRef(name,mem){
        return mem[name] != undefined;
    }

    valueify(nd,mem,flags){
        flags = flags ?? {};
        if(flags.strictType && flags.strictType != nd.type){ throw this.err("Valueify","Strict Type Had Invalid Type",{at: nd.stringifyType()}); }
        if(flags.strictTypes && flags.strictTypes.includes(nd.type)){ throw this.err("Valueify","Strict Type Had Invalid Type",{at: nd.stringifyType()}); }
        let t;
        if(flags.fallback != undefined && nd.type == tokType.nil){ return flags.fallback; }
        switch(nd.type){
            case(tokType.call):
                return `${this.callFunc(nd,mem,true)}`;
                break;
            case(tokType.sym):
                t = this.getRef(nd.val,mem);
                if(t.literal != undefined){
                    return t.literal;
                }else if(t.fn){
                    throw this.err("Valueify","Value Is Builtin Function. Cannot Be Passed.");
                }
                return `mem[${this.getRef(nd.val,mem).ref}]`;
            case(tokType.num):
                return nd.val;
            case(tokType.str):
                return nanolib.safeString(nd.val);
            case(tokType.arr):
                return `({${nd.children.map(x=>this.valueify(x,mem)).map((x,i)=>`${i}:${x}`).join(",")}})`;
            case(tokType.func):
                if(!nd.val.checkAllSpecs({type: tokType.sym})){
                    throw this.err("Valueify","Found Non-Symbol Function Argument");
                }
                t = nd.val.children;
                return `((${["mem",...t.map(x=>nanolib.safeSym(x.val))].join(",")})=>{${t.map(x=>`${this.getRawRef(x.val,mem)}=${nanolib.safeSym(x.val)};`).join("")}${this._compile(nd, "run", mem)}})`;
            default:
                throw this.err("Valueify","Could Not Valueify Type",{at: nd.stringifyType()});
        }
    }

    callFunc(nd,mem,isArg){
        let cnd = nd.getChild(0);
        let opts = {native: false};
        let fn, ref;
        let args = nd.children.slice(1,nd.children.length);
        //Find The Function
        switch(cnd.type){
            case(tokType.code):
                if(nd.size != 1){
                    throw this.err("Raw Code Call","Does Not Include Further Arguments");
                }
                return this._compile(cnd,"run",mem);
            case(tokType.call):
                fn = `(${this.valueify(cnd,mem)})`;
                break;
            case(tokType.sym):
                ref = this.getRef(cnd.val,mem);
                if((ref.argSize??args.length) != args.length){
                    throw this.err("Function Call","Invalid Argument Length");
                }
                if(ref.native){
                    if(ref.enforcecol && isArg){ throw this.err("Function Call","Function Cannot Be Passed As Value Argument"); }
                    if(ref.noautocol){ isArg = true; }
                    return `${ref.fn(this,new astToken(tokType.group,null,...args),mem)??""}${isArg?"":";"}`;
                }else if(ref.literal != undefined){
                    fn = ref.literal;
                }else {
                    fn = this.valueify(cnd,mem);
                }
                //throw this.err("Function Call","Cannot Execute Function");
                break;
            case(tokType.func):
                fn = this.valueify(cnd,mem);
                break;
            default:
                throw this.err("Function Call","Invalid Function Type",{at: cnd.stringifyType()});
        }
        return `${fn}(${["mem",...args.map(x=>this.valueify(x,mem,true))].join(",")})${isArg?"":";"}`;
    }

    _compile(ast, state, mem){
        state = state ?? "run";
        //Compile (Recursive)
        let ret = [];
        if(![tokType.root,tokType.group,tokType.func,tokType.code,tokType.call].includes(ast.type)){ throw this.err("Compile","Cannot Compile Invalid Token Type Encountered"); }
        if(!ast.hasBody){ throw this.err("Compile","No Script Body Or Missing Pass"); }
        for(let i = 0; i < ast.children.length; i++){
            let nd = ast.getChild(i);
            switch(state){
                case("run"):
                    //Basic Code Run State
                    switch(nd.type){
                        case(tokType.call):
                            ret.push(this.callFunc(nd,mem));
                            break;
                        default:
                            throw this.err("Compile","Cannot Execute Non-Function",{at: nd.stringifyType()});
                            break;
                    }
                    break;
                default:
                    throw this.err("Compile","Unknown Compile State",{at: state});
            }
        }
        return ret.join("");
    }

    compile(rawcode,flags){
        let premem = ["rand:(a,b)=>{return (Math.random()*(Math.abs(a-b)+1))+a;}"];
        flags = flags??{};
        this.rawcode = rawcode;
        this.mem = {
            "true": {literal: "true"},
            "false": {literal: "false"},
            "nil": {literal: "undefined"},
            "builtin_mem": {literal: "mem"},
            "builtin_io": {literal: "io"},
            "pass": {native: true, fn: (lib,args,mem)=>{
                //Pass Function
                if(args.size !== 0){throw lib.err("Pass","Invalid Arguments");}
                return "";
            }},
            "enum": {native: true, fn: (lib,args,mem)=>{
                //Define Enums
                if(!args.checkAllSpecs({type: tokType.sym})){throw lib.err("Enum Definition","Invalid Definition Arguments");}
                return args.children.map(x=>`${lib.valueify(x,mem)}=Symbol()`).join(";");
            }, enforcecol: true},
            "=": {native: true, fn: (lib,args,mem)=>{
                //Define Variable
                if(args.size !== 2){throw lib.err("Definition","Invalid Definition Arguments");}
                return `${lib.valueify(args.getChild(0),mem,{strictType: tokType.sym})}=${lib.valueify(args.getChild(1),mem)}`;
            }, enforcecol: true},
            ".=": {native: true, fn: (lib,args,mem)=>{
                //Define Variable
                if(args.size !== 3){throw lib.err("Definition","Invalid Definition Arguments");}
                return `${lib.valueify(args.getChild(0),mem)}[${lib.valueify(args.getChild(1),mem)}]=${lib.valueify(args.getChild(2),mem)}`;
            }, enforcecol: true},
            "if": {native: true, fn: (lib,args,mem)=>{
                //If Statement
                if(args.size !== 2 && args.size !== 3){throw lib.err("If Statement","Invalid Arguments");}
                return `if(${lib.valueify(args.getChild(0),mem)}){${lib.valueify(args.getChild(1),mem,{strictType: tokType.call})}}${args.getChild(2).type != tokType.nil?`else{${lib.valueify(args.getChild(2),mem,{strictType: tokType.call})}}`:""}`;
            }, enforcecol: true},
            "?": {native: true, fn: (lib,args,mem)=>{
                //Terenary Operation
                if(args.size !== 3){throw lib.err("Terenary","Invalid Arguments");}
                return `((${lib.valueify(args.getChild(0),mem)})?(${lib.valueify(args.getChild(1),mem)}):(${lib.valueify(args.getChild(2),mem)}))`;
            }},
            "io_req":{native: true, fn: (lib,args,mem)=>{
                if(args.size < 1){throw lib.err("IO Request","Invalid Arguments");}
                return `io(${args.children.map(x=>lib.valueify(x,mem)).join(",")})`;
            }},
            "print":{native: true, fn: (lib,args,mem)=>{
                if(args.size < 1){throw lib.err("IO Request","Invalid Arguments");}
                return `console.log(${args.children.map(x=>lib.valueify(x,mem)).join(",")})`;
            }},
            "return":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Return","Invalid Arguments");}
                return `return(${lib.valueify(args.getChild(0),mem)})`;
            }, enforcecol: true},
            "str+":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Concat","Invalid Arguments");}
                return `String(${lib.valueify(args.getChild(0),mem)})+String(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "??":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Nullish Fallback","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} ?? ${lib.valueify(args.getChild(1),mem)})`;
            }},
            "exists":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Is Exists","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} != undefined)`;
            }},
            "not":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Comparison","Invalid Arguments");}
                return `(!${lib.valueify(args.getChild(0),mem)})`;
            }},
            "rand_int":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Random Int","Invalid Arguments");}
                return `BigInt(Math.floor(mem.rand(${lib.valueify(args.getChild(0),mem)},${lib.valueify(args.getChild(1),mem)})))`;
            }},
            "rand":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Random","Invalid Arguments");}
                return `mem.rand(${lib.valueify(args.getChild(0),mem)},${lib.valueify(args.getChild(1),mem)})`;
            }},
            "<=":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Comparison","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} <= ${lib.valueify(args.getChild(1),mem)})`;
            }},
            ">=":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Comparison","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} >= ${lib.valueify(args.getChild(1),mem)})`;
            }},
            "<":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Comparison","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} < ${lib.valueify(args.getChild(1),mem)})`;
            }},
            ">":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Comparison","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} > ${lib.valueify(args.getChild(1),mem)})`;
            }},
            "==":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Comparison","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} === ${lib.valueify(args.getChild(1),mem)})`;
            }},
            "!=":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Comparison","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} !== ${lib.valueify(args.getChild(1),mem)})`;
            }},
            "and":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Comparison","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} && ${lib.valueify(args.getChild(1),mem)})`;
            }},
            "or":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Comparison","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)} || ${lib.valueify(args.getChild(1),mem)})`;
            }},
            "floor":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Math","Invalid Arguments");}
                return `BigInt(Math.floor(${lib.valueify(args.getChild(0),mem)}))`;
            }},
            "ceil":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Math","Invalid Arguments");}
                return `BigInt(Math.ceil(${lib.valueify(args.getChild(0),mem)}))`;
            }},
            "i+":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `BigInt(${lib.valueify(args.getChild(0),mem)})+BigInt(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "i-":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `BigInt(${lib.valueify(args.getChild(0),mem)})-BigInt(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "i*":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `BigInt(${lib.valueify(args.getChild(0),mem)})*BigInt(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "i/":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `BigInt(${lib.valueify(args.getChild(0),mem)})/BigInt(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "str":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Type Cast: String","Invalid Arguments");}
                return `String(${lib.valueify(args.getChild(0),mem)})`;
            }},
            "num":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Type Cast: Number","Invalid Arguments");}
                return `Number(${lib.valueify(args.getChild(0),mem)})`;
            }},
            "bool":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Type Cast: Boolean","Invalid Arguments");}
                return `Boolean(${lib.valueify(args.getChild(0),mem)})`;
            }},
            "int":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Type Cast: Integer","Invalid Arguments");}
                return `BigInt(${lib.valueify(args.getChild(0),mem)})`;
            }},
            "arr":{native: true, fn: (lib,args,mem)=>{
                //Make Array
                //if(args.size > 1){throw lib.err("Create Array","Invalid Arguments");}
                return `([${args.children.map(x=>lib.valueify(x,mem)).join(",")}])`;
            }},
            "push":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)}).push(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "pop":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 1){throw lib.err("Math","Invalid Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)}).pop()`;
            }},
            "+":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `Number(${lib.valueify(args.getChild(0),mem)})+Number(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "-":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `Number(${lib.valueify(args.getChild(0),mem)})-Number(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "/":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `Number(${lib.valueify(args.getChild(0),mem)})/Number(${lib.valueify(args.getChild(1),mem)})`;
            }},
            "*":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Math","Invalid Arguments");}
                return `Number(${lib.valueify(args.getChild(0),mem)})*Number(${lib.valueify(args.getChild(1),mem)})`;
            }},
            ".":{native: true, fn: (lib,args,mem)=>{
                if(args.size !== 2){throw lib.err("Get Index","Invalid Index Arguments");}
                return `(${lib.valueify(args.getChild(0),mem)}??[])[${lib.valueify(args.getChild(1),mem)}]`;
            }},
        };
        this.ast = nanolib.parseAST(rawcode);
        if(flags.esoteric){
            //Implement Meme Functions
            premem.push(`get maybe(){return Math.random()<=0.5;},set maybe(x){}`);
            this.mem = {...this.mem, 
                "maybe": {literal: "mem.maybe"}
            };
        }
        if(!flags.safe){
            //Safe Mode (No Eval Or Dom Manipulation)
            //premem.push(``);
            this.mem = {...this.mem, 
                "str_fetch": {native: true, fn: (lib,args,mem)=>{
                    //Fetch String
                    if(args.size !== 2){throw lib.err("Fetch Definition","Invalid Definition Arguments");}
                    return `${lib.valueify(args.getChild(0),mem,{strictType: tokType.sym})}=await (await fetch(${lib.valueify(args.getChild(1),mem)})).text()`;
                }},
                "$body": {literal: "document.body"},
                "$": {native: true, fn: (lib,args,mem)=>{
                    //Dom Function
                    if(args.size !== 1){throw lib.err("Dom","Invalid Arguments");}
                    return `Document.querySelector(${lib.valueify(args.getChild(0),mem)})`;
                }},
                "$byId": {native: true, fn: (lib,args,mem)=>{
                    //Dom Function
                    if(args.size !== 1){throw lib.err("Dom","Invalid Arguments");}
                    return `Document.getElementById(${lib.valueify(args.getChild(0),mem)})`;
                }},
                "$$": {native: true, fn: (lib,args,mem)=>{
                    //Dom Function
                    if(args.size !== 1){throw lib.err("Dom","Invalid Arguments");}
                    return `Document.querySelectorAll(${lib.valueify(args.getChild(0),mem)})`;
                }},
                "onEvent": {native: true, fn: (lib,args,mem)=>{
                    //Dom Function
                    if(args.size !== 2){throw lib.err("Dom","Invalid Arguments");}
                    return `(${lib.valueify(args.getChild(0),mem)}).addEventListener(${lib.valueify(args.getChild(1),mem)})`;
                }},
                "onInterval": {native: true, fn: (lib,args,mem)=>{
                    //Dom Function
                    if(args.size !== 2){throw lib.err("Dom","Invalid Arguments");}
                    return `setInterval(${lib.valueify(args.getChild(0),mem)},${lib.valueify(args.getChild(1),mem,{fallback: 0})})`;
                }},
                "dom": {native: true, fn: (lib,args,mem)=>{
                    //Dom Function
                    if(args.size !== 1){throw lib.err("Dom","Invalid Arguments");}
                    return `document.createElement(${lib.valueify(args.getChild(0),mem)})`;
                }},
                "append": {native: true, fn: (lib,args,mem)=>{
                    //Dom Function
                    if(args.size !== 2){throw lib.err("Dom","Invalid Arguments");}
                    return `${lib.valueify(args.getChild(0),mem)}.append(${lib.valueify(args.getChild(1),mem)})`;
                }},
                "unsafe_js": {native: true, fn: (lib,args,mem)=>{
                    //Inline Javascript
                    if(args.size !== 1){throw lib.err("Unsafe Eval","Invalid Arguments");}
                    return `${args.getChild(0).val??""}`;
                }},
                "alert":{native: true, fn: (lib,args,mem)=>{
                    if(args.size !== 1){throw lib.err("Alert","Invalid Arguments");}
                    return `alert(${lib.valueify(args.getChild(0),mem)})`;
                }},
                "print":{native: true, fn: (lib,args,mem)=>{
                    if(args.size !== 1){throw lib.err("print","Invalid Arguments");}
                    return `console.log(${lib.valueify(args.getChild(0),mem)})`;
                }},
            };
        }
        if(flags.builtin){
            if(flags.builtin.premem){
                premem = [...premem,...flags.builtin.premem];
            }
            if(flags.builtin.mem){
                this.mem = {...this.mem,...flags.builtin.mem};
            }
        }
        this.code = `(async (io)=>{'use strict';io=io??(()=>{});let mem={${premem.join(",")}};${this._compile(this.ast,"run",this.mem)}${this.getRawRef("main",this.mem)}(mem);${this.isRef("update",this.mem)?`setInterval(${this.getRawRef("update",this.mem)},1);`:""}})`;
        if(!this.isRef("main",this.mem)){
            throw this.err("Compile","Missing Program Enterance 'main'");
        }
        return this;
    }

    downloadExec(name){
        nanolib.downloadTextFile(`${name??"nanobb_compiled"}.js`,`${this.code}();`);
    }

    async exec(flags){
        flags = flags ?? {};
        //this.io(`${this.code}\n`);
        try {
            return await (eval(this.code)(flags.noio?undefined:this.io));
        }catch(err){
            if(flags.alert){
                alert(err);
            }
            if(flags.throw){ throw err; }
            return {isErr: true, err};
        }
    }
}