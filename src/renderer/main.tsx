import React from 'react';
import { createRoot } from 'react-dom/client';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import { App } from './App';
import './style.css';
(globalThis as typeof globalThis & {MonacoEnvironment: unknown}).MonacoEnvironment={getWorker:(_module: string,label: string)=>label==='json'?new JsonWorker():new EditorWorker()};
loader.config({monaco});
monaco.languages.register({id:'verilog',extensions:['.v','.sv','.vh','.svh']});
monaco.languages.setMonarchTokensProvider('verilog',{
  keywords:['module','endmodule','input','output','inout','wire','reg','logic','always','always_ff','always_comb','initial','assign','begin','end','if','else','case','endcase','default','for','while','generate','endgenerate','parameter','localparam','integer','posedge','negedge','or','task','endtask','function','endfunction','repeat'],
  tokenizer:{root:[[/\/\/.*$/,'comment'],[/\/\*/,'comment','@comment'],[/\$[\w]+/,'predefined'],[/`\w+/,'keyword'],[/\b\d+'[sS]?[bBoOdDhH][\da-fA-F_xXzZ]+/,'number'],[/\b\d+(\.\d+)?\b/,'number'],[/[a-zA-Z_][\w$]*/,{cases:{'@keywords':'keyword','@default':'identifier'}}],[/"([^"\\]|\\.)*"/,'string']],comment:[[/[^/*]+/,'comment'],[/\*\//,'comment','@pop'],[/[/*]/,'comment']]}
});
monaco.languages.setLanguageConfiguration('verilog',{comments:{lineComment:'//',blockComment:['/*','*/']},brackets:[['{','}'],['[',']'],['(',')']],autoClosingPairs:[{open:'(',close:')'},{open:'[',close:']'},{open:'{',close:'}'},{open:'"',close:'"'}]});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
