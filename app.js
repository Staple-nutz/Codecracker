(()=>{'use strict';
const N=13, ALPHABET='abcdefghijklmnopqrstuvwxyz';
const MASKS=window.CODECRACKER_MASKS||[], BANK=window.CODECRACKER_PUZZLES||[];
const WORDS=new Set((window.CODECRACKER_WORDS||[]).map(x=>String(x).toLowerCase()));

const gridEl=document.getElementById('grid'), controlEl=document.getElementById('controlGrid');
const hintsEl=document.getElementById('hints'), statusEl=document.getElementById('status');
const statsEl=document.getElementById('stats'), selectedCodeEl=document.getElementById('selectedCode');
const letterInput=document.getElementById('letterInput'), decoderMsg=document.getElementById('decoderMsg');
const solutionEl=document.getElementById('solution'), acrossEl=document.getElementById('acrossWords'), downEl=document.getElementById('downWords');
let puzzle=null, selectedCode=null, userMap={}, recent=new Set();

const rnd=n=>Math.floor(Math.random()*n);
const shuffle=a=>{const x=a.slice();for(let i=x.length-1;i>0;i--){const j=rnd(i+1);[x[i],x[j]]=[x[j],x[i]]}return x};

function buildSlots(mask){
  const g=mask.split('').map(Number), slots=[];
  const at=(r,c)=>g[r*N+c]===1;
  for(let r=0;r<N;r++){let c=0;while(c<N){if(!at(r,c)){c++;continue}const s=c;while(c<N&&at(r,c))c++;if(c-s>=3)slots.push({r,c:s,d:'H',len:c-s,cells:Array.from({length:c-s},(_,i)=>[r,s+i])})}}
  for(let c=0;c<N;c++){let r=0;while(r<N){if(!at(r,c)){r++;continue}const s=r;while(r<N&&at(r,c))r++;if(r-s>=3)slots.push({r:s,c,d:'V',len:r-s,cells:Array.from({length:r-s},(_,i)=>[s+i,c])})}}
  return slots;
}
function makeGrid(mask,words){
  const g=Array.from({length:N},()=>Array(N).fill(''));
  const slots=buildSlots(mask);
  slots.forEach((s,i)=>{const w=words[i];for(let k=0;k<s.len;k++)g[s.cells[k][0]][s.cells[k][1]]=w[k]});
  return {g,slots};
}
function extractRuns(g){
  const H=[],V=[];
  for(let r=0;r<N;r++){let c=0;while(c<N){if(!g[r][c]){c++;continue}const s=c;while(c<N&&g[r][c])c++;const word=g[r].slice(s,c).join('');if(word.length>=3)H.push({word,r,c:s})}}
  for(let c=0;c<N;c++){let r=0;while(r<N){if(!g[r][c]){r++;continue}const s=r;while(r<N&&g[r][c])r++;let word='';for(let k=s;k<r;k++)word+=g[k][c];if(word.length>=3)V.push({word,r:s,c})}}
  return {H,V};
}
function validPuzzle(g){
  for(let r=0;r<N-1;r++)for(let c=0;c<N-1;c++)if(g[r][c]&&g[r+1][c]&&g[r][c+1]&&g[r+1][c+1])return false;
  const used=new Set(g.flat().filter(Boolean));if(used.size!==26)return false;
  const runs=extractRuns(g);
  return [...runs.H,...runs.V].every(x=>WORDS.has(x.word));
}
function cipher(){
  const nums=shuffle(Array.from({length:26},(_,i)=>i+1)), l2n={},n2l={};
  ALPHABET.split('').forEach((l,i)=>{l2n[l]=nums[i];n2l[nums[i]]=l});
  return {l2n,n2l};
}
function signature(g){return g.map(r=>r.map(x=>x||'.').join('')).join('/')}

// v4 puzzle diversity engine -------------------------------------------------
// The original v3 bank is retained as a set of valid Shuker-style seeds, but a
// new puzzle is now made by mutating a seed with the cleaned English dictionary.
// This means New Puzzle is no longer limited to the exact pre-generated fills.
const WORD_LIST = [...WORDS].filter(w => /^[a-z]{3,13}$/.test(w));
const WORDS_BY_LEN = new Map();
const POS_INDEX = new Map();
const SESSION_WORD_USE = new Map();
const FORBIDDEN_WORDS = new Set(['azure','mexican','drubetskoy','ferapontov','pavlovna']);
for (const w of WORD_LIST) {
  if (!WORDS_BY_LEN.has(w.length)) WORDS_BY_LEN.set(w.length, []);
  WORDS_BY_LEN.get(w.length).push(w);
}
for (const [len,list] of WORDS_BY_LEN) {
  const positions=[];
  for(let p=0;p<len;p++){
    const m=new Map();
    for(const w of list){
      const ch=w[p];
      if(!m.has(ch))m.set(ch,new Set());
      m.get(ch).add(w);
    }
    positions.push(m);
  }
  POS_INDEX.set(len,positions);
}

function patternCandidates(slot, assignment, neighbors) {
  let pool=null;
  const idx=slot.index;
  for(const [nb,pi,pn] of neighbors[idx]) {
    if(!assignment.has(nb)) continue;
    const w=assignment.get(nb);
    const set=POS_INDEX.get(slot.len)?.[pi]?.get(w[pn]);
    if(!set)return [];
    if(pool===null)pool=new Set(set);
    else pool=new Set([...pool].filter(x=>set.has(x)));
    if(!pool.size)return [];
  }
  return pool ? [...pool] : (WORDS_BY_LEN.get(slot.len)||[]).slice();
}

function buildNeighborGraph(slots){
  const map=new Map();
  slots.forEach((s,i)=>s.index=i);
  slots.forEach((s,i)=>s.cells.forEach((cell,p)=>{
    const key=cell[0]+','+cell[1];
    if(!map.has(key))map.set(key,[]);
    map.get(key).push([i,p]);
  }));
  const n=slots.map(()=>[]);
  for(const items of map.values()){
    if(items.length===2){
      const [[a,pa],[b,pb]]=items;
      n[a].push([b,pa,pb]); n[b].push([a,pb,pa]);
    }
  }
  return n;
}

function mutateSeed(seed){
  const {slots}=makeGrid(MASKS[seed.mask],seed.words);
  const neighbors=buildNeighborGraph(slots);
  const original=new Map(seed.words.map((w,i)=>[i,w]));

  for(let attempt=0;attempt<24;attempt++){
    const forced=new Set();
    seed.words.forEach((w,i)=>{if(FORBIDDEN_WORDS.has(w))forced.add(i);});
    const count=8+rnd(7);
    const available=shuffle(Array.from({length:slots.length},(_,i)=>i).filter(i=>!forced.has(i)));
    for(let i=0;i<Math.min(count,available.length);i++)forced.add(available[i]);

    const assignment=new Map();
    for(let i=0;i<slots.length;i++)if(!forced.has(i))assignment.set(i,seed.words[i]);
    let nodes=0;

    function solve(){
      nodes++; if(nodes>5000)return null;
      if(assignment.size===slots.length)return new Map(assignment);
      let best=-1,bestPool=null;
      for(let i=0;i<slots.length;i++){
        if(assignment.has(i))continue;
        const pool=patternCandidates(slots[i],assignment,neighbors)
          .filter(w=>!FORBIDDEN_WORDS.has(w) && (SESSION_WORD_USE.get(w)||0)<50);
        if(!pool.length)return null;
        if(bestPool===null || pool.length<bestPool.length){best=i;bestPool=pool;}
        if(bestPool.length<=1)break;
      }
      const currentLetters=new Set([...assignment.values()].join(''));
      const missingRare=['j','q','x','z'].filter(x=>!currentLetters.has(x));
      const ranked=bestPool.map(w=>{
        let score=Math.random()*18;
        if(w===original.get(best))score-=80;
        for(const ch of new Set(w))if(missingRare.includes(ch))score+=20;
        score-=Math.min(20,(SESSION_WORD_USE.get(w)||0)*2);
        return [score,w];
      }).sort((a,b)=>b[0]-a[0]).slice(0,70);
      for(const [,w] of ranked){
        assignment.set(best,w);
        const result=solve();
        if(result)return result;
        assignment.delete(best);
      }
      return null;
    }

    const result=solve();
    if(!result)continue;
    const words=result.size===slots.length?slots.map((_,i)=>result.get(i)):null;
    if(!words)continue;
    const {g}=makeGrid(MASKS[seed.mask],words);
    if(!validPuzzle(g))continue;
    const sig=seed.mask+'|'+words.join(',');
    if(recent.has(sig))continue;
    if(words.some(w=>FORBIDDEN_WORDS.has(w)))continue;
    return {mask:MASKS[seed.mask],words,g,slots,sig};
  }
  return null;
}

function choosePuzzle(){
  const seeds=shuffle(BANK);
  // Prefer mutation; fall back to a valid seed if the browser cannot find a
  // fresh mutation quickly. The seed itself is still subject to the diversity
  // blacklist, so Azure/Mexican can never return as playable words.
  for(const b of seeds){
    const mutated=mutateSeed(b);
    if(mutated)return mutated;
  }
  for(const b of seeds){
    if(b.words.some(w=>FORBIDDEN_WORDS.has(w)))continue;
    const x=makeGrid(MASKS[b.mask],b.words);
    if(validPuzzle(x.g))return {mask:MASKS[b.mask],words:b.words,g:x.g,slots:x.slots,sig:b.mask+'|'+b.words.join(',')};
  }
  throw new Error('Unable to create a fresh puzzle. Please press New Puzzle again.');
}


function renderControl(){
  controlEl.innerHTML='';
  for(let n=1;n<=26;n++){
    const cell=document.createElement('div');cell.className='control-cell';cell.dataset.code=n;
    const num=document.createElement('div');num.className='control-num';num.textContent=n;
    const letEl=document.createElement('div');letEl.className='control-letter';
    const hint=puzzle.hints.find(h=>h.code===n);
    const val=userMap[n]||(hint?hint.letter:'');
    letEl.textContent=val.toUpperCase();
    if(hint)cell.classList.add('hint');
    if(selectedCode===n)cell.classList.add('selected');
    if(val)cell.classList.add('solved');
    cell.append(num,letEl);cell.addEventListener('click',()=>selectCode(n));
    controlEl.appendChild(cell);
  }
}
function renderGrid(){
  gridEl.innerHTML='';
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){
    const cell=document.createElement('div');cell.className='cell';
    const ch=puzzle.g[r][c];
    if(!ch){cell.classList.add('block');gridEl.appendChild(cell);continue}
    const code=puzzle.l2n[ch];cell.dataset.code=code;
    const hint=puzzle.hints.find(h=>h.code===code), val=userMap[code]||(hint?hint.letter:'');
    if(hint)cell.classList.add('hint');
    if(selectedCode===code)cell.classList.add('selected');
    if(!val)cell.classList.add('unsolved');
    const codeEl=document.createElement('span');codeEl.className='code';codeEl.textContent=code;
    const letEl=document.createElement('span');letEl.className='letter';letEl.textContent=val.toUpperCase();
    cell.append(codeEl,letEl);cell.addEventListener('click',()=>selectCode(code));gridEl.appendChild(cell);
  }
}
function renderHints(){
  hintsEl.innerHTML='<span>Starting clues:</span>';
  puzzle.hints.forEach(h=>{const x=document.createElement('span');x.className='hint-pill';x.textContent=`${h.code} = ${h.letter.toUpperCase()}`;hintsEl.appendChild(x)});
}
function renderAlphabet(){
  const el=document.getElementById('alphabet');
  el.innerHTML='';
  const used=new Set(puzzle.hints.map(h=>h.letter.toLowerCase()));
  for(const letter of Object.values(userMap)) used.add(letter.toLowerCase());
  for(const letter of ALPHABET){
    const x=document.createElement('span');
    x.className='alphabet-letter'+(used.has(letter)?' used':'');
    x.textContent=letter.toUpperCase();
    el.appendChild(x);
  }
}
function renderAll(){renderGrid();renderControl();renderHints();renderAlphabet();}

function selectCode(code){
  selectedCode=code;selectedCodeEl.textContent=code;
  const hint=puzzle.hints.find(h=>h.code===code);
  letterInput.value=(userMap[code]||(hint?hint.letter:'' )).toUpperCase();
  decoderMsg.textContent='';
  renderGrid();renderControl();letterInput.focus();
}
function isPuzzleSolved(){
  for(let n=1;n<=26;n++){
    const hint=puzzle.hints.find(h=>h.code===n);
    const answer=hint?hint.letter:userMap[n];
    if((answer||'').toLowerCase()!==puzzle.n2l[n].toLowerCase()) return false;
  }
  return true;
}
function showCongratulations(){
  document.getElementById('successMessage').classList.remove('hidden');
}
function hideCongratulations(){
  document.getElementById('successMessage').classList.add('hidden');
}
function setLetter(){
  if(selectedCode==null){decoderMsg.textContent='Select a numbered square first.';return}
  const ch=letterInput.value.trim().toLowerCase();
  if(!/^[a-z]$/.test(ch)){decoderMsg.textContent='Enter one letter.';return}
  const hint=puzzle.hints.find(h=>h.code===selectedCode);
  if(hint&&hint.letter!==ch){decoderMsg.textContent='That number is a supplied clue.';return}
  for(const [n,l] of Object.entries(userMap))if(Number(n)!==selectedCode&&l===ch){decoderMsg.textContent=`${ch.toUpperCase()} is already assigned to ${n}.`;return}
  userMap[selectedCode]=ch;decoderMsg.textContent=`${selectedCode} = ${ch.toUpperCase()}`;renderAll();if(isPuzzleSolved())showCongratulations();
}
function clearLetter(){
  if(selectedCode==null)return;
  if(puzzle.hints.some(h=>h.code===selectedCode)){decoderMsg.textContent='Starting clues cannot be cleared.';return}
  delete userMap[selectedCode];letterInput.value='';decoderMsg.textContent='Cleared.';renderAll();
}
function solve(){
  userMap={};for(let n=1;n<=26;n++)userMap[n]=puzzle.n2l[n];
  renderAll();
  const runs=extractRuns(puzzle.g);
  acrossEl.textContent=runs.H.map(x=>x.word.toUpperCase()).join(' · ');
  downEl.textContent=runs.V.map(x=>x.word.toUpperCase()).join(' · ');
  solutionEl.classList.remove('hidden');statusEl.textContent='Solved';statsEl.textContent=`${runs.H.length} across · ${runs.V.length} down`;
}
function chooseHintLetters(words){
  // Both starting clues come from the same real word, making the opening
  // deduction easier: once that word is spotted, both supplied letters
  // participate in the same word trail. Prefer longer words with more
  // distinct letters, then add a little randomness between good choices.
  const candidates=words
    .map(word=>String(word).toLowerCase())
    .filter(word=>new Set(word).size>=2)
    .sort((a,b)=>{
      const score=w=>w.length*3+new Set(w).size*4;
      return score(b)-score(a);
    });
  const top=candidates.slice(0,Math.min(8,candidates.length));
  const word=top[rnd(top.length)] || candidates[0];
  return shuffle([...new Set(word.split(''))]).slice(0,2);
}

function newPuzzle(){
  const start=performance.now();userMap={};selectedCode=null;solutionEl.classList.add('hidden');hideCongratulations();
  const chosen=choosePuzzle();const c=cipher();
  chosen.words.forEach(w=>SESSION_WORD_USE.set(w,(SESSION_WORD_USE.get(w)||0)+1));
  const letters=chooseHintLetters(chosen.words);
  puzzle={...chosen,...c,hints:letters.map(letter=>({letter,code:c.l2n[letter]}))};
  recent.add(chosen.sig);if(recent.size>100)recent.delete(recent.values().next().value);
  renderAll();statusEl.textContent='Puzzle ready';statsEl.textContent=`${chosen.g.flat().filter(Boolean).length}/169 squares · ${Math.round(chosen.g.flat().filter(Boolean).length/169*100)}% used · ${Math.round(performance.now()-start)} ms`;
}
document.getElementById('newPuzzle').addEventListener('click',newPuzzle);
document.getElementById('solvePuzzle').addEventListener('click',solve);
document.getElementById('setLetter').addEventListener('click',setLetter);
document.getElementById('clearLetter').addEventListener('click',clearLetter);
letterInput.addEventListener('keydown',e=>{if(e.key==='Enter')setLetter()});
document.addEventListener('keydown',e=>{if(selectedCode!=null&&/^[a-zA-Z]$/.test(e.key)){letterInput.value=e.key;setLetter()}});
newPuzzle();
})();