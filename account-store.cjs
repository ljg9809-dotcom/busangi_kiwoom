'use strict';
const {DatabaseSync}=require('node:sqlite');
const {randomBytes,scrypt,timingSafeEqual,createHash}=require('node:crypto');
const {promisify}=require('node:util');const derive=promisify(scrypt);
const gameAPI=require('./busangi-game.js');
const digest=value=>createHash('sha256').update(value).digest('hex');
class AccountStore{
  constructor(file=':memory:'){
    this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,nickname TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS saves(user_id TEXT PRIMARY KEY REFERENCES users(id),state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);');
    this.validator=gameAPI.create({storage:null,load:false});
  }
  validName(name){if(typeof name!=='string'||!name.trim()||Array.from(name.trim()).length>80)throw Error('닉네임은 1~80자로 입력해줘.');return name.trim().normalize('NFC');}
  async register(name,password){
    const nickname=this.validName(name);if(typeof password!=='string'||password.length<8||password.length>256)throw Error('비밀번호는 8~256자로 입력해줘.');
    if(this.db.prepare('SELECT id FROM users WHERE nickname=?').get(nickname))throw Error('이미 사용 중인 닉네임이야.');
    const salt=randomBytes(16).toString('hex'),hash=Buffer.from(await derive(password,salt,64)).toString('hex'),id=randomBytes(16).toString('hex');
    try{this.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,nickname,salt,hash);}catch{throw Error('이미 사용 중인 닉네임이야.');}
    return {id,nickname};
  }
  async login(name,password){
    const nickname=this.validName(name);if(typeof password!=='string'||password.length>256)throw Error('닉네임과 비밀번호를 확인해줘.');
    const row=this.db.prepare('SELECT * FROM users WHERE nickname=?').get(nickname);
    const hash=await derive(password,row?.salt||'missing-user-fixed-salt',64);
    if(!row||!timingSafeEqual(Buffer.from(row.password_hash,'hex'),Buffer.from(hash)))throw Error('닉네임과 비밀번호를 확인해줘.');
    return {id:row.id,nickname:row.nickname};
  }
  session(user){const token=randomBytes(32).toString('hex');this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),user.id,Date.now()+7*86400000);return token;}
  user(token){if(!token)return null;const row=this.db.prepare('SELECT users.id,users.nickname FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?').get(digest(token),Date.now());return row?{...row}:null;}
  logout(token){if(token)this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
  load(user){const row=this.db.prepare('SELECT state,revision FROM saves WHERE user_id=?').get(user.id);return row?{state:JSON.parse(row.state),revision:row.revision}:{state:null,revision:0};}
  validate(state){this.validator.validateSave(state);if(JSON.stringify(state).length>250000)throw Error('저장 데이터가 너무 커.');return state;}
  save(user,state,revision){
    this.validate(state);state={...state,nickname:user.nickname};const json=JSON.stringify(state);
    if(revision===0){try{this.db.prepare('INSERT INTO saves VALUES(?,?,1)').run(user.id,json);return 1;}catch{throw Error('SAVE_CONFLICT');}}
    const result=this.db.prepare('UPDATE saves SET state=?,revision=revision+1 WHERE user_id=? AND revision=?').run(json,user.id,revision);
    if(!result.changes)throw Error('SAVE_CONFLICT');return revision+1;
  }
  rankingRows(){return this.db.prepare('SELECT users.id,users.nickname,saves.state FROM users JOIN saves ON saves.user_id=users.id').all();}
  ranking(user,page=1,quotes={}){
    const rows=this.db.prepare('SELECT users.id,users.nickname,saves.state FROM users JOIN saves ON saves.user_id=users.id').all();
    return require('./ranking.cjs').leaderboard(rows,user?.id,page,quotes);
  }
  close(){this.db.close();}
}
module.exports={AccountStore};
