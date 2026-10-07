import assert from 'node:assert/strict';
const base=process.env.TEST_BASE??'http://localhost:5173';
const players=Array.from({length:5},()=>({cookie:'',state:null}));
async function request(i,action,extra={},expected=200){const p=players[i];const s=p.state;const response=await fetch(`${base}/api/game`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(p.cookie?{Cookie:p.cookie}:{})},body:JSON.stringify({action,room:s?.room,version:s?.version,turnKey:s?.turnKey,...extra})});if(response.headers.get('set-cookie'))p.cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));if(response.ok)p.state=data;return data;}
async function read(i,room=players[0].state.room){const p=players[i];const r=await fetch(`${base}/api/game?room=${room}`,{headers:p.cookie?{Cookie:p.cookie}:{}});const j=await r.json();if(r.ok)p.state=j;return {status:r.status,state:j};}
await request(0,'create',{},201);const room=players[0].state.room;assert.equal((await read(4,room)).status,401);
for(let i=1;i<4;i++)await request(i,'join',{room});await request(4,'join',{room},400);
for(let i=0;i<4;i++)await request(i,'choose',{team:i<2?'A':'B'});
await read(0);assert.deepEqual(players[0].state.words,[]);await read(1);await request(1,'start',{},400);await request(0,'start');await read(0);const before=[...players[0].state.words];await request(0,'replace',{index:1});assert.equal(players[0].state.words[0],before[0]);assert.notEqual(players[0].state.words[1],before[1]);
// Stale readiness cannot lock words a player has not seen.
await request(1,'ready',{ready:true},409);
for(let i=0;i<4;i++){await read(i);await request(i,'ready',{ready:true});}
for(let round=1;round<=3;round++)for(const team of ['A','B']){
 const giver=(team==='A'?0:2)+(round-1)%2,answerer=(team==='A'?0:2)+1-(round-1)%2,opponent=(team==='A'?2:0)+(round-1)%2;
 await read(giver);const state=players[giver].state;assert.equal(state.phase,'clues');const code=state.code;
 for(let i=0;i<4;i++){await read(i);assert.equal(players[i].state.code!==null,i===giver);assert.equal(JSON.stringify(players[i].state).includes('"hash"'),false);if(players[i].state.team!==team)for(const word of state.words)assert.ok(!players[i].state.words.includes(word));}
 await request(answerer,'clues',{clues:['越权','越权二','越权三']},400);
 await request(giver,'clues',{clues:[`${round}${team}线索甲`,`${round}${team}线索乙`,`${round}${team}线索丙`]});
 if(round>1){await read(opponent);await request(opponent,'draft',{numbers:[1,2,0]});await read(answerer);assert.equal(players[answerer].state.draft,null);if(round===2){await read(answerer);await request(answerer,'guess',{numbers:code});await read(opponent);assert.equal(players[opponent].state.answer,null);}if(round===3){await read(answerer);await Promise.all([request(opponent,'guess',{numbers:code}),request(answerer,'guess',{numbers:code})]);}else await request(opponent,'guess',{numbers:code});await read(answerer);}else assert.equal(players[giver].state.phase,'guess');
 await read(answerer);if(round===1)await request(answerer,'guess',{numbers:code});const revealed=players[answerer].state;assert.equal(revealed.phase,round===3&&team==='B'?'tiebreak':'reveal');assert.equal(revealed.history.length,(round-1)*2+(team==='A'?1:2));
 // Duplicate confirmation must not score twice.
 await request(answerer,'guess',{numbers:code},400);
 const other=await read(opponent);assert.deepEqual(other.state.history,revealed.history);assert.deepEqual(other.state.code,code);
 if(revealed.phase==='reveal')await request(answerer,'next');
}
await read(0);assert.equal(players[0].state.phase,'tiebreak');assert.equal(players[0].state.scores.A.interceptions,2);assert.equal(players[0].state.scores.B.interceptions,2);
const wordsA=players[0].state.words;await read(2);const wordsB=players[2].state.words;
assert.deepEqual(players[0].state.opponentWordLengths,wordsB.map(w=>Array.from(w).length));
await request(0,'tie',{words:wordsB});await read(2);assert.equal(players[2].state.tieAnswers,null);await request(2,'tie',{words:wordsA});assert.equal(players[2].state.winner,'draw');await read(0);await request(0,'rematch');assert.equal(players[0].state.phase,'setup');assert.equal(players[0].state.history.length,0);
// The server persists expiration even when nobody submits an answer.
await request(0,'settings',{guessSeconds:10});
await request(0,'start');for(let i=0;i<4;i++){await read(i);await request(i,'ready',{ready:true});}
await read(0);await request(0,'clues',{clues:['超时甲','超时乙','超时丙']});assert.ok(players[0].state.deadline);
await new Promise(resolve=>setTimeout(resolve,10100));await read(1);assert.equal(players[1].state.phase,'reveal');assert.equal(players[1].state.scores.A.mistakes,1);await read(2);assert.equal(players[2].state.history.length,1);
const csrf=await fetch(`${base}/api/game`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example',Cookie:players[0].cookie},body:JSON.stringify({action:'create'})});assert.equal(csrf.status,403);
await request(3,'leave');assert.equal((await read(0)).state.players.length,3);for(let i=0;i<3;i++)await request(i,'leave');assert.equal((await read(0,room)).status,404);
console.log('PASS: four independent sessions, secrecy, replacement, stale writes, simultaneous submissions, server timeout, six turns, automatic round settlement, tiebreak hints, rematch, unauthorized actions, CSRF.');
// Intentional simultaneous guesses must apply only once.
