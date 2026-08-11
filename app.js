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

function choosePuzzle(){
  const order=shuffle(BANK);
  for(const b of order){
    const sig=b.mask+'|'+b.words.join(',');
    if(recent.has(sig))continue;
    const {g,slots}=makeGrid(MASKS[b.mask],b.words);
    if(validPuzzle(g))return {mask:MASKS[b.mask],words:b.words,g,slots,sig};
  }
  /* Recent bank exhaustion is extremely unlikely; permit reuse rather than fail. */
  const b=order[0], x=makeGrid(MASKS[b.mask],b.words);
  return {mask:MASKS[b.mask],words:b.words,g:x.g,slots:x.slots,sig:b.mask+'|'+b.words.join(',')};
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
function renderAll(){renderGrid();renderControl();renderHints();}

function selectCode(code){
  selectedCode=code;selectedCodeEl.textContent=code;
  const hint=puzzle.hints.find(h=>h.code===code);
  letterInput.value=(userMap[code]||(hint?hint.letter:'' )).toUpperCase();
  decoderMsg.textContent='';
  renderGrid();renderControl();letterInput.focus();
}
function setLetter(){
  if(selectedCode==null){decoderMsg.textContent='Select a numbered square first.';return}
  const ch=letterInput.value.trim().toLowerCase();
  if(!/^[a-z]$/.test(ch)){decoderMsg.textContent='Enter one letter.';return}
  const hint=puzzle.hints.find(h=>h.code===selectedCode);
  if(hint&&hint.letter!==ch){decoderMsg.textContent='That number is a supplied clue.';return}
  for(const [n,l] of Object.entries(userMap))if(Number(n)!==selectedCode&&l===ch){decoderMsg.textContent=`${ch.toUpperCase()} is already assigned to ${n}.`;return}
  userMap[selectedCode]=ch;decoderMsg.textContent=`${selectedCode} = ${ch.toUpperCase()}`;renderAll();
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
  const start=performance.now();userMap={};selectedCode=null;solutionEl.classList.add('hidden');
  const chosen=choosePuzzle();const c=cipher();
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
//document.getElementById('alphabet').textContent=ALPHABET.toUpperCase().split('').join('  ');
newPuzzle();
})();