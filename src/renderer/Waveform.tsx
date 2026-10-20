import { useMemo, useState } from 'react';
import type { Waveform as WaveData, WaveSignal } from '../shared/types';
import { formatValue, valueAt } from '../core/vcd';

export function Waveform({wave}:{wave?:WaveData}) {
  const [filter,setFilter]=useState(''),[selected,setSelected]=useState<string[]|undefined>(),[zoom,setZoom]=useState(1),[start,setStart]=useState(0),[a,setA]=useState(0),[b,setB]=useState(0),[cursor,setCursor]=useState<'A'|'B'>('A'),[radix,setRadix]=useState<'binary'|'hex'>('hex');
  const signals=useMemo(()=>wave?.signals.filter(s=>s.name.toLowerCase().includes(filter.toLowerCase())) ?? [],[wave,filter]);
  if(!wave) return <div className="empty-panel"><strong>No waveform yet</strong><span>Run a testbench with $dumpfile("wave.vcd") and $dumpvars.</span><span>F5 simulates the configured top module.</span></div>;
  const ids=selected ?? wave.signals.slice(0,12).map(s=>s.id);
  const visible=wave.signals.filter(s=>ids.includes(s.id)).slice(0,32);
  const duration=Math.max(1,wave.endTime/zoom),offset=Math.min(start,Math.max(0,wave.endTime-duration));
  const x=(time:number)=>(time-offset)/duration*1000;
  const clamp=(time:number)=>Math.max(0,Math.min(wave.endTime,Math.round(time)));
  function points(s:WaveSignal) {
    return [[offset,valueAt(s,offset)],...s.changes.filter(([t])=>t>offset && t<offset+duration),[offset+duration,valueAt(s,offset+duration)]] as [number,string][];
  }
  return <div className="wave-root">
    <div className="wave-tools">
      <label>Values <select aria-label="Waveform value format" value={radix} onChange={e=>setRadix(e.target.value as typeof radix)}><option value="hex">Hexadecimal</option><option value="binary">Binary</option></select></label>
      <button title="Zoom in" disabled={zoom>=64} onClick={()=>setZoom(Math.min(64,zoom*2))}>＋</button><button title="Zoom out" disabled={zoom<=1} onClick={()=>{setZoom(Math.max(1,zoom/2));setStart(0);}}>−</button>
      <button onClick={()=>{setZoom(1);setStart(0);}}>Fit</button><span className="muted">{zoom}×</span>
      <label>Move cursor <select aria-label="Active cursor" value={cursor} onChange={e=>setCursor(e.target.value as 'A'|'B')}><option>A</option><option>B</option></select></label>
      <label>A <input aria-label="Cursor A time" type="number" min="0" max={wave.endTime} value={a} onChange={e=>setA(clamp(Number(e.target.value)))}/></label>
      <label>B <input aria-label="Cursor B time" type="number" min="0" max={wave.endTime} value={b} onChange={e=>setB(clamp(Number(e.target.value)))}/></label>
      <span className="mono muted">Δ {Math.abs(b-a)} ticks · {wave.timescale}/tick</span>
    </div>
    {wave.truncated && <div className="notice">Waveform display reached its signal/transition limit. Shorten the testbench for a complete view.</div>}
    <div className="wave-body">
      <aside className="signal-picker"><input aria-label="Filter signals" placeholder="Filter signals…" value={filter} onChange={e=>setFilter(e.target.value)}/><div className="signal-count">{ids.length} selected · maximum 32</div>
        {signals.map(s=><label key={s.id} title={s.name}><input type="checkbox" checked={ids.includes(s.id)} disabled={!ids.includes(s.id) && ids.length>=32} onChange={e=>setSelected(e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/><span>{s.name}</span><small>{s.width}</small></label>)}
      </aside>
      <div className="wave-traces"><div className="wave-row wave-ruler"><span>Signal</span><span>A / B</span><svg viewBox="0 0 1000 28" preserveAspectRatio="none" aria-hidden="true">{Array.from({length:11},(_,i)=><g key={i}><line x1={i*100} y1="19" x2={i*100} y2="28"/><text x={i*100+3} y="14">{Math.round(offset+i*duration/10)}</text></g>)}</svg></div>
        {visible.map(s=>{ const samples=points(s); return <div className="wave-row" key={s.id}><span className="wave-name" title={s.name}>{s.name}</span><span className="wave-value" title={`A: ${valueAt(s,a)} / B: ${valueAt(s,b)}`}>{formatValue(valueAt(s,a),radix)} / {formatValue(valueAt(s,b),radix)}</span>
          <svg role="slider" aria-label={`${s.name} cursor ${cursor}`} aria-valuemin={0} aria-valuemax={wave.endTime} aria-valuenow={cursor==='A'?a:b} tabIndex={0} viewBox="0 0 1000 32" preserveAspectRatio="none"
            onClick={e=>{const bounds=e.currentTarget.getBoundingClientRect(); const time=clamp(offset+(e.clientX-bounds.left)/bounds.width*duration); if(cursor==='A')setA(time);else setB(time);}}
            onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault(); const current=cursor==='A'?a:b;const time=e.key==='Home'?0:e.key==='End'?wave.endTime:clamp(current+(e.key==='ArrowLeft'?-1:1)*Math.max(1,Math.round(duration/100)));if(cursor==='A')setA(time);else setB(time);}}}>
            {Array.from({length:11},(_,i)=><line className="gridline" key={`g${i}`} x1={i*100} y1="0" x2={i*100} y2="32"/>)}
            {samples.length>4000?<text x="16" y="20" fill="currentColor" fontSize="11">Dense transitions — zoom in to inspect</text>:samples.slice(0,-1).map(([time,value],i)=>{
              const next=samples[i+1][0],left=x(time),right=x(next),unknown=/[xz]/.test(value);
              if(s.width===1)return <path key={i} className={unknown?'trace unknown':'trace'} d={unknown?`M${left},16H${right}`:`M${left},${value==='1'?7:25}H${right}V${value==='1'?25:7}`}/>;
              return <g key={i} className={unknown?'bus unknown':'bus'}><path d={`M${left},16L${left+Math.min(4,(right-left)/2)},6H${right-Math.min(4,(right-left)/2)}L${right},16L${right-Math.min(4,(right-left)/2)},26H${left+Math.min(4,(right-left)/2)}Z`}/>{right-left>40&&<text x={(left+right)/2} y="20" textAnchor="middle">{formatValue(value,radix)}</text>}</g>;
            })}
            {a>=offset&&a<=offset+duration&&<line className="cursor-a" x1={x(a)} x2={x(a)} y1="0" y2="32"/>}{b>=offset&&b<=offset+duration&&<line className="cursor-b" x1={x(b)} x2={x(b)} y1="0" y2="32"/>}
          </svg>
        </div>;})}
        {!visible.length&&<div className="empty-panel">Select signals to inspect their waveforms.</div>}
      </div>
    </div>
    <div className="wave-pan"><label>Pan <input aria-label="Pan waveform" type="range" min="0" max={Math.max(0,wave.endTime-duration)} step="1" value={offset} disabled={zoom===1} onChange={e=>setStart(Number(e.target.value))}/></label><span>{Math.round(offset)} – {Math.round(offset+duration)} ticks</span></div>
  </div>;
}
