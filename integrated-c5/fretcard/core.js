/** VGFretCard C4-A geometry contract; copied from qualified C3 R7 preview, geometry retained. */
export const SCHEMA = 'vg.fretcard/1';
export const V = Object.freeze({width:300,height:270,left:50,stepX:40,top:60,stepY:35,count:5});
export const GLYPHS = new Set(['dot','ring','diamond','square']);
const KINDS = new Set(['point','open','mute','span']);
const ROLES = new Set(['primary','root','secondary','muted','open','feedback','sequence','target','ghost']);
const asciiId = x => typeof x==='string' && /^[A-Za-z0-9._:\-]{1,96}$/.test(x);
const plain = x => x!==null && typeof x==='object' && !Array.isArray(x) && Object.getPrototypeOf(x)===Object.prototype;
const shortText = (s,limit) => typeof s==='string' && [...s].length<=limit && !/[\u0000-\u001f\u007f-\u009f]/u.test(s);
const integer = (n,min,max) => Number.isInteger(n)&&n>=min&&n<=max;
const issue = (code,detail='') => ({ok:false,code,detail});

export function inspectSpec(spec) {
  if(!plain(spec) || spec.schema!==SCHEMA || !asciiId(spec.cardId) || !plain(spec.board)) return issue('BAD_SPEC');
  const b=spec.board;
  if(!asciiId(b.boardId) || b.profileId!=='guitar.standard6' || b.stringCount!==6 ||
    b.orientation!=='vertical' || b.handedness!=='right' || !integer(b.firstFret,1,24) ||
    !integer(b.fretCount,1,24) || b.firstFret+b.fretCount-1>24 ||
    (b.blankCellActions!==undefined && typeof b.blankCellActions!=='boolean')) return issue('BAD_BOARD');
  if(!Array.isArray(spec.layers)||spec.layers.length>12) return issue('BAD_LAYERS');
  if(spec.context!==undefined && (!plain(spec.context)||
     Object.entries(spec.context).some(([k,v])=>!asciiId(k)||!shortText(v,96)))) return issue('BAD_CONTEXT');
  const layerIds=new Set(),markIds=new Set(),actionable=new Set();let total=0;
  for(const layer of spec.layers){
    if(!plain(layer)||!asciiId(layer.layerId)||layerIds.has(layer.layerId)||!integer(layer.order,-999,999) ||
       typeof layer.visible!=='boolean' || typeof layer.interactive!=='boolean' ||
       !Array.isArray(layer.marks)) return issue('BAD_LAYER');
    layerIds.add(layer.layerId);total+=layer.marks.length;
    if(total>512)return issue('TOO_MANY_MARKS');
    for(const m of layer.marks){
      if(!plain(m)||!asciiId(m.id)||markIds.has(m.id)||!KINDS.has(m.kind)||
         !ROLES.has(m.role)||m.interactive!==undefined&&typeof m.interactive!=='boolean'||
         m.label!==undefined&&!shortText(m.label,80)||
         m.ariaLabel!==undefined&&!shortText(m.ariaLabel,256))return issue('BAD_MARK');
      markIds.add(m.id);
      if(m.kind==='point'){
        if(!integer(m.string,1,6)||!integer(m.fret,b.firstFret,b.firstFret+b.fretCount-1)||
            !GLYPHS.has(m.glyph||'dot')) return issue('BAD_POINT',m.id);
      }else if(m.kind==='open'){
        if(!integer(m.string,1,6)||m.fret!==0)return issue('BAD_OPEN',m.id);
      }else if(m.kind==='mute'){
        if(!integer(m.string,1,6)||('fret' in m))return issue('BAD_MUTE',m.id);
      }else if(m.kind==='span'){
        if(!integer(m.fret,b.firstFret,b.firstFret+b.fretCount-1)||!integer(m.fromString,2,6)||
          !integer(m.toString,1,5)||m.fromString<=m.toString||m.glyph!=='barre')return issue('BAD_SPAN',m.id);
      }
      if(layer.visible && layer.interactive && m.interactive===true && m.kind!=='span'){
        const key=m.string+':'+(m.kind==='mute'?0:m.fret);
        if(actionable.has(key))return issue('AMBIGUOUS_INTERACTIVE_TARGET',key);
        actionable.add(key);
      }
    }
  }
  return {ok:true,totalMarks:total};
}

export function coordinate(board,string,fret){
  if(!integer(string,1,6))throw Error('BAD_STRING');
  if(fret!==0&&!integer(fret,board.firstFret,board.firstFret+board.fretCount-1))throw Error('BAD_FRET');
  return {x:V.left+(6-string)*V.stepX,y:fret===0?V.top-31:V.top+(fret-board.firstFret+0.5)*V.stepY};
}
export function planSurface(spec){
  const result=inspectSpec(spec);if(!result.ok)return result;
  const layers=[...spec.layers].sort((a,b)=>a.order-b.order);
  let marks=[];
  for(const layer of layers)if(layer.visible){
    for(const mark of layer.marks){
      const start=mark.kind==='span'?coordinate(spec.board,mark.fromString,mark.fret):
        coordinate(spec.board,mark.string,mark.kind==='mute'?0:mark.fret);
      const end=mark.kind==='span'?coordinate(spec.board,mark.toString,mark.fret):undefined;
      marks.push({mark,layerId:layer.layerId,interactive:layer.interactive&&mark.interactive===true,start,end});
    }
  }
  return {ok:true,marks,board:spec.board,cardId:spec.cardId,context:spec.context||{}};
}
