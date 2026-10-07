import { WORDS } from './words.ts';
export type Team = 'A' | 'B';
export type Phase = 'setup' | 'words' | 'clues' | 'guess' | 'intercept' | 'answer' | 'reveal' | 'tiebreak' | 'finished';
export type Player = { id:string; hash:string; team:Team|null; seat:number; ready:boolean };
export type RecordTurn = { round:number; team:Team; code:number[]; clues:string[]; intercept:number[]|null; answer:number[]; intercepted:boolean; missed:boolean };
export type Game = { guessSeconds?:number; deadline?:number|null; gameId:string; players:Player[]; words:Record<Team,string[]>; used:string[]; round:number; active:Team; phase:Phase; code:number[]; clues:string[]; draft:number[]; intercept:number[]|null; answer:number[]|null; history:RecordTurn[]; scores:Record<Team,{interceptions:number; mistakes:number}>; tie:Partial<Record<Team,string[]>>; winner:Team|'draw'|null; reason:string; notes?:Record<Team,Record<Team,string[]>> };
const emptyNotes=()=>({A:{A:['','','',''],B:['','','','']},B:{A:['','','',''],B:['','','','']}});
export class GameError extends Error { constructor(message:string,public status=400){super(message)} }
export const other = (t:Team):Team => t==='A'?'B':'A';
export const key = (g:Game) => `${g.gameId}:${g.round}:${g.active}`;
export const seatFor = (g:Game) => (g.round-1)%2;
function random(n:number) { const max=0x100000000-0x100000000%n; const b=new Uint32Array(1); do { crypto.getRandomValues(b); } while(b[0]>=max); return b[0]%n; }
export function shuffled<T>(a:T[]) {const b=[...a];for(let i=b.length-1;i>0;i--){const j=random(i+1);[b[i],b[j]]=[b[j],b[i]]}return b;}
function pick(g:Game,n:number) {let options=WORDS.filter(w=>!g.used.includes(w));if(options.length<n){g.used=[...g.words.A,...g.words.B];options=WORDS.filter(w=>!g.used.includes(w));}const words=shuffled(options).slice(0,n);g.used.push(...words);return words;}
export function newGame(player:Player):Game {const g:Game={guessSeconds:0,deadline:null,gameId:crypto.randomUUID(),players:[player],words:{A:[],B:[]},used:[],round:1,active:'A',phase:'setup',code:[],clues:[],draft:[0,0,0],intercept:null,answer:null,history:[],scores:{A:{interceptions:0,mistakes:0},B:{interceptions:0,mistakes:0}},tie:{},winner:null,reason:'',notes:emptyNotes()};g.words.A=pick(g,4);g.words.B=pick(g,4);return g;}
export const makePlayer=(hash:string):Player=>({id:crypto.randomUUID(),hash,team:null,seat:-1,ready:false});
function requireThat(value:unknown,message:string):asserts value {if(!value)throw new GameError(message);}
function numbers(value:unknown,partial=false):number[] { requireThat(Array.isArray(value)&&value.length===3,'请选择三个编号。');requireThat(value.every(v=>Number.isInteger(v)&&v>=(partial?0:1)&&v<=4),'编号须在 1 至 4 之间。');const nonzero=value.filter(v=>v!==0);requireThat(new Set(nonzero).size===nonzero.length,'同一次答案不能重复编号。');return [...value] as number[];}
function strings(value:unknown,n:number,max:number){requireThat(Array.isArray(value)&&value.length===n,'请填写全部内容。');requireThat(value.every(v=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max),`每项需要填写 1–${max} 个字符。`);return (value as string[]).map(s=>s.trim().normalize('NFKC'));}
const same=(a:number[]|null,b:number[])=>!!a&&a.join('')===b.join('');
const normalized=(s:string)=>s.normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase();
function startTurn(g:Game){g.code=shuffled([1,2,3,4]).slice(0,3);g.clues=[];g.intercept=null;g.answer=null;g.draft=[0,0,0];g.phase='clues';g.deadline=null;}
export function resolveRound(g:Game){
 const a=g.scores.A,b=g.scores.B;
 const aWins=a.interceptions>=2||b.mistakes>=2;
 const bWins=b.interceptions>=2||a.mistakes>=2;
 if(aWins!==bWins){g.winner=aWins?'A':'B';g.reason=g.scores[g.winner].interceptions>=2?'成功截获两次密码。':'对手累计两次沟通失误。';g.phase='finished';return;}
 if(!aWins&&!bWins&&g.round<8)return;
 if(aWins&&bWins){g.phase='tiebreak';g.reason='双方在本轮都触发胜负条件，进入秘密词加赛。';return;}
 const x=a.interceptions-a.mistakes,y=b.interceptions-b.mistakes;
 if(x===y){g.phase='tiebreak';g.reason='八轮结束，净得分相同，进入秘密词加赛。';return;}
 g.winner=x>y?'A':'B';g.reason='八轮结束，按「截获次数 − 沟通失误」的净得分决胜。';g.phase='finished';
}
export const guessing=(g:Game)=>['guess','intercept','answer'].includes(g.phase);
function finishGuess(g:Game){const intercepted=same(g.intercept,g.code),missed=!same(g.answer,g.code);if(intercepted)g.scores[other(g.active)].interceptions++;if(missed)g.scores[g.active].mistakes++;g.history.push({round:g.round,team:g.active,code:[...g.code],clues:[...g.clues],intercept:g.intercept,answer:g.answer??[],intercepted,missed});g.deadline=null;g.phase='reveal';if(g.active==='B')resolveRound(g);}
export function expire(g:Game,now=Date.now()){if(!guessing(g)||!g.deadline||now<g.deadline)return false;finishGuess(g);return true;}
function restart(g:Game){const fresh=newGame(g.players[0]);fresh.guessSeconds=g.guessSeconds??0;fresh.players=g.players.map(x=>({...x,ready:false}));fresh.used=g.used;fresh.words={A:[],B:[]};fresh.words.A=pick(fresh,4);fresh.words.B=pick(fresh,4);Object.assign(g,fresh);}
function regroup(g:Game){g.players.forEach(x=>{x.ready=false;});g.words.A=pick(g,4);g.words.B=pick(g,4);g.notes=emptyNotes();}
export function act(g:Game,p:Player,action:string,input:Record<string,unknown>){
 if(action==='settings'){requireThat(g.phase==='setup'&&p.id===g.players[0].id,'仅房主可在开局前设置。');requireThat(Number.isInteger(input.guessSeconds)&&(input.guessSeconds===0||Number(input.guessSeconds)>=10&&Number(input.guessSeconds)<=600),'限时为 10–600 秒，0 表示不限时。');g.guessSeconds=Number(input.guessSeconds);return;}
 if(action==='choose'){requireThat(g.phase==='setup'&&!p.team,'已选定队伍，可在大厅与对方交换。');requireThat(input.team==='A'||input.team==='B','请选择队伍。');const team=input.team;requireThat(g.players.filter(x=>x.team===team).length<2,'这队已经坐满了。');p.team=team;p.seat=g.players.some(x=>x.team===team&&x.id!==p.id&&x.seat===0)?1:0;return;}
 if(action==='leave'){g.players=g.players.filter(x=>x.id!==p.id);if(g.players.length&&g.phase!=='setup'){restart(g);g.reason='有玩家退出，本局已中止。等待补位后由房主重新开始。';}return;}
 if(action==='shuffle'){requireThat(g.phase==='setup','游戏已开始，不能重组队伍。');requireThat(g.players.length>=2,'至少两人才能重组。');const partner=(x:Player)=>g.players.find(y=>y.id!==x.id&&y.team&&y.team===x.team)?.id;const before=g.players.length===4?partner(g.players[0]):undefined;do{shuffled(g.players).forEach((x,i)=>{x.team=i%2===0?'A':'B';x.seat=Math.floor(i/2);});}while(before&&partner(g.players[0])===before);regroup(g);return;}
 requireThat(p.team,'请先选择队伍。');const team=p.team;
 if(action==='swap'){requireThat(g.phase==='setup','游戏已开始，不能换队。');if(input.target===null){requireThat(g.players.filter(x=>x.team===other(team)).length<2,'对方队已满，请选择一位交换。');p.team=other(team);p.seat=g.players.some(x=>x.id!==p.id&&x.team===p.team&&x.seat===0)?1:0;}else{const target=g.players.find(x=>x.id===input.target);requireThat(target&&target.team===other(team),'请选择对方队的一位玩家。');[p.team,target.team]=[target.team,p.team];[p.seat,target.seat]=[target.seat,p.seat];}regroup(g);return;}
 if(action==='start'){requireThat(g.phase==='setup','游戏已开始。');requireThat(p.id===g.players[0].id,'由房主开始游戏。');requireThat(g.players.length===4&&g.players.every(x=>x.team),'需要四人都选好队伍才能开始。');g.players.forEach(x=>{x.ready=false;});g.phase='words';g.reason='';return;}
 if(action==='replace'){requireThat(g.phase==='words','现在不能换词。');requireThat(!g.players.some(x=>x.team===team&&x.ready),'本队已锁定词语，请先取消锁定再换词。');if(input.index===null){g.words[team]=pick(g,4);}else{requireThat(Number.isInteger(input.index)&&Number(input.index)>=0&&Number(input.index)<4,'请选择要替换的词。');g.words[team][Number(input.index)]=pick(g,1)[0];}return;}
 if(action==='ready'){requireThat(g.phase==='words','现在不能锁定词语。');requireThat(typeof input.ready==='boolean','锁定状态不正确。');p.ready=input.ready;if(g.players.length===4&&g.players.every(x=>x.team&&x.ready))startTurn(g);return;}
 if(action==='rematch'){requireThat(g.phase==='finished'&&p.id===g.players[0].id,'游戏结束后由房主开始新一局。');restart(g);return;}
 if(action==='note'){requireThat(input.target==='A'||input.target==='B','请选择记录表。');requireThat(Number.isInteger(input.index)&&Number(input.index)>=0&&Number(input.index)<4,'请选择编号。');requireThat(typeof input.text==='string'&&input.text.length<=300,'笔记最多 300 个字符。');g.notes??=emptyNotes();g.notes[team][input.target][Number(input.index)]=input.text.normalize('NFKC');return;}
 requireThat(input.turnKey===key(g),'回合已更新，请按当前页面重新操作。');
 const giver=team===g.active&&p.seat===seatFor(g);const captain=team!==g.active&&p.seat===seatFor(g);
 if(action==='clues'){requireThat(g.phase==='clues'&&giver,'只有本轮出题人可以提交线索。');const clues=strings(input.clues,3,40);requireThat(new Set(clues.map(normalized)).size===3,'三条线索不能相同。');const prior=g.history.filter(h=>h.team===team).flatMap(h=>h.clues).map(normalized);requireThat(clues.every(c=>!prior.includes(normalized(c))&&!g.words[team].some(w=>normalized(w)===normalized(c))),'线索不能重复使用，也不能直接使用本队秘密词。');g.clues=clues;g.phase='guess';g.deadline=g.guessSeconds?Date.now()+g.guessSeconds*1000:null;return;}
 if(action==='draft'){requireThat(guessing(g)&&g.round>1&&captain&&!g.intercept,'本轮由对手队的指定提交人选择编号。');g.draft=numbers(input.numbers,true);return;}
 if(action==='guess'){requireThat(guessing(g),'当前不能提交答案。');requireThat(!g.deadline||Date.now()<g.deadline,'猜测时间已到。');const guess=numbers(input.numbers);if(captain&&g.round>1){requireThat(!g.intercept,'本队已提交。');g.intercept=guess;g.draft=guess;}else{requireThat(team===g.active&&!giver,'请由指定玩家提交。');requireThat(!g.answer,'本队已提交。');g.answer=guess;}if(g.answer&&(g.round===1||g.intercept))finishGuess(g);return;}
 if(action==='next'){requireThat(g.phase==='reveal','请先完成本次答题。');if(g.active==='B'){resolveRound(g);if(g.phase!=='reveal')return;g.round++;g.active='A';}else g.active='B';startTurn(g);return;}
 if(action==='tie'){requireThat(g.phase==='tiebreak'&&p.seat===seatFor(g),'加赛由本队本轮出题人提交。');requireThat(!g.tie[team],'本队已提交加赛答案。');g.tie[team]=strings(input.words,4,20);if(g.tie.A&&g.tie.B){const count=(t:Team)=>new Set(g.tie[t]!.map(normalized).filter(w=>g.words[other(t)].map(normalized).includes(w))).size;const a=count('A'),b=count('B');g.winner=a===b?'draw':a>b?'A':'B';g.phase='finished';g.reason=`秘密词加赛：A 队猜中 ${a} 个，B 队猜中 ${b} 个。相同词只计一次。`;}return;}
 throw new GameError('未知操作。');
}
export function view(g:Game,p:Player,room:string,version:number){const team=p.team;const revealed=g.phase==='reveal'||g.phase==='finished'||g.phase==='tiebreak';const giver=team===g.active&&p.seat===seatFor(g);return {room,version,guessSeconds:g.guessSeconds??0,deadline:g.deadline??null,serverNow:Date.now(),submitted:{intercept:!!g.intercept,answer:!!g.answer},gameId:g.gameId,turnKey:key(g),me:p.id,team,seat:p.seat,host:g.players[0].id===p.id,players:g.players.map(({id,team,seat,ready})=>({id,team,seat,ready})),words:team&&g.phase!=='setup'?g.words[team]:[],round:g.round,active:g.active,phase:g.phase,giver,code:revealed||giver?g.code:null,clues:g.clues,draft:team&&team!==g.active?g.draft:null,intercept:revealed||team&&team!==g.active?g.intercept:null,answer:revealed?g.answer:null,history:team?g.history:[],notes:team?(g.notes?.[team]??emptyNotes()[team]):null,scores:g.scores,tieSubmitted:{A:!!g.tie.A,B:!!g.tie.B},opponentWordLengths:g.phase==='tiebreak'&&team?g.words[other(team)].map(w=>Array.from(w).length):null,tieAnswers:g.phase==='finished'?g.tie:null,allWords:g.phase==='finished'?g.words:null,winner:g.winner,reason:g.reason};}
export type GameView=ReturnType<typeof view>;
