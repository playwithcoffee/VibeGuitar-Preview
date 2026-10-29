/** No dependencies, network, storage, music calculations or audio in the renderer. */
import {V,planSurface,coordinate} from './core.js';
const NS='http://www.w3.org/2000/svg';
const s=(tag,attrs={},text)=>{
  const n=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));
  if(text!==undefined)n.textContent=String(text);
  return n;
};
function targetAttrs(el,entry,kind){
  el.setAttribute('data-vg-target',entry.mark.id);
  el.setAttribute('data-vg-intent',kind);
  el.setAttribute('role','button');el.setAttribute('tabindex','0');
  el.setAttribute('aria-label',entry.mark.ariaLabel||entry.mark.label||entry.mark.id);
  el.classList.add('vg-action');
}
export function renderFretSurface(spec,viewState={},onIntent=()=>{}){
  const plan=planSurface(spec);if(!plan.ok)throw Error(plan.code+':'+plan.detail);
  const b=plan.board,canvasHeight=Math.max(V.height,V.top+b.fretCount*V.stepY+35),root=s('svg',{viewBox:`0 0 ${V.width} ${canvasHeight}`,class:'vg-fretboard',role:'group','aria-label':`Guitar fretboard, strings 6 through 1, frets ${b.firstFret} through ${b.firstFret+b.fretCount-1}`});
  const grid=s('g',{'aria-hidden':'true',class:'vg-grid'});
  for(let i=0;i<6;i++)grid.append(s('line',{x1:V.left+i*V.stepX,x2:V.left+i*V.stepX,y1:V.top,y2:V.top+b.fretCount*V.stepY,class:'vg-string '+(i<3?'vg-string-bass':'')}));
  for(let i=0;i<=b.fretCount;i++)grid.append(s('line',{x1:V.left,x2:V.left+5*V.stepX,y1:V.top+i*V.stepY,y2:V.top+i*V.stepY,class:i===0&&b.firstFret===1?'vg-nut':'vg-fret'}));
  if(b.firstFret!==1)grid.append(s('text',{x:22,y:V.top+28,'text-anchor':'middle',class:'vg-fret-label'},`${b.firstFret}fr`));
  for(let i=0;i<6;i++)grid.append(s('text',{x:V.left+i*V.stepX,y:V.top+b.fretCount*V.stepY+23,'text-anchor':'middle',class:'vg-string-label'},['E','A','D','G','B','e'][i]));
  root.append(grid);
  // Empty-cell targets are lower than mark/span targets. Disabled by default.
  if(b.blankCellActions){
    let covered=new Set();for(let e of plan.marks)if(e.interactive && e.mark.kind!=='span' && e.mark.kind!=='mute')covered.add(`${e.mark.string}:${e.mark.fret}`);
    const cells=s('g',{class:'vg-cells'});
    for(let str=6;str>=1;str--)for(let fret=b.firstFret;fret<b.firstFret+b.fretCount;fret++){
      if(covered.has(`${str}:${fret}`))continue;
      const p=coordinate(b,str,fret),el=s('rect',{x:p.x-18,y:p.y-16,width:36,height:32,fill:'transparent'});
      let id=`cell:${str}:${fret}`;el.setAttribute('data-vg-target',id);el.setAttribute('data-vg-intent','cell.activate');el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label',`String ${str}, fret ${fret}`);el.classList.add('vg-action');cells.append(el);
    }
    root.append(cells);
  }
  // Layer composition: barres behind point labels. Rings are decorative and never intercept interaction.
  for(const entry of plan.marks.filter(e=>e.mark.kind==='span')){
    const e=s('g',{class:'vg-barre-wrap'}),m=entry.mark;
    e.append(s('line',{x1:entry.start.x,y1:entry.start.y,x2:entry.end.x,y2:entry.end.y,class:'vg-barre'}));
    if(entry.interactive){e.append(s('line',{x1:entry.start.x,y1:entry.start.y,x2:entry.end.x,y2:entry.end.y,class:'vg-span-hit'}));targetAttrs(e,entry,'span.activate');}
    else e.setAttribute('pointer-events','none');
    root.append(e);
  }
  const visual=new Map();
  // Unlike HTML string injection, all labels are literal text nodes.
  for(const entry of plan.marks.filter(e=>e.mark.kind!=='span')){
    const m=entry.mark,p=entry.start,g=s('g',{class:'vg-mark-wrap'});
    if(m.kind==='point'){
      if(m.glyph==='ring')g.append(s('circle',{cx:p.x,cy:p.y,r:18,class:'vg-decorative-ring'}));
      else if(m.glyph==='diamond')g.append(s('rect',{x:p.x-11,y:p.y-11,width:22,height:22,transform:`rotate(45 ${p.x} ${p.y})`,class:'vg-dot'}));
      else if(m.glyph==='square')g.append(s('rect',{x:p.x-12,y:p.y-12,width:24,height:24,rx:3,class:'vg-dot'}));
      else g.append(s('circle',{cx:p.x,cy:p.y,r:14.5,class:'vg-dot'}));
      if(m.label)g.append(s('text',{x:p.x,y:p.y+5.2,'text-anchor':'middle',class:'vg-dot-text'},m.label));
    }else if(m.kind==='open')g.append(s('circle',{cx:p.x,cy:29,r:9,class:'vg-open'}));
    else if(m.kind==='mute')g.append(s('text',{x:p.x,y:39,'text-anchor':'middle',class:'vg-mute'},'×'));
    if(entry.interactive){
      const hit=s('circle',{cx:p.x,cy:m.kind==='open'?29:m.kind==='mute'?29:p.y,r:17,fill:'transparent',class:'vg-mark-hit'});
      g.append(hit);targetAttrs(g,entry,'mark.activate');
    }else g.setAttribute('pointer-events','none');
    root.append(g);visual.set(m.id,g);
  }
  // No touch/pointer listener: the browser's click event covers mouse, tap and assistive activation.
  // Keydown only handles the SVG role=button nodes, which have no native keyboard activation.
  const resolve=(node)=>{const t=node?.closest?.('[data-vg-target]');return t&&root.contains(t)?t:null;};
  const emit=(t,modality)=>{
    const id=t.getAttribute('data-vg-target'),kind=t.getAttribute('data-vg-intent');
    let mark=plan.marks.find(e=>e.mark.id===id)?.mark;
    const cell=/^cell:(\d+):(\d+)$/.exec(id);
    const location=cell?{string:Number(cell[1]),fret:Number(cell[2])}:
      mark?.kind==='span'?{fret:mark.fret,fromString:mark.fromString,toString:mark.toString}:
      mark?{string:mark.string,...(mark.kind==='mute'?{}:{fret:mark.fret})}:undefined;
    onIntent({kind,cardId:spec.cardId,boardId:b.boardId,targetId:id,location,context:{...plan.context},modality});
  };
  root.addEventListener('click',ev=>{let t=resolve(ev.target);if(t)emit(t,'pointer');});
  root.addEventListener('keydown',ev=>{if(ev.key!=='Enter'&&ev.key!==' ')return;let t=resolve(ev.target);if(!t || t!==ev.target)return;ev.preventDefault();emit(t,'keyboard');});
  let active=new Set();
  const update=(state)=>{
    let next=new Set([...(state?.playingMarkIds||[]),...(state?.selectedMarkIds||[])]);
    for(let id of active)if(!next.has(id))visual.get(id)?.classList.remove('vg-active');
    for(let id of next)if(!active.has(id))visual.get(id)?.classList.add('vg-active');
    active=next;
  };
  update(viewState);
  return {element:root,update,plan};
}
