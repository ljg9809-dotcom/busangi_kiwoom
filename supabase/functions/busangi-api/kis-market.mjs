const BASE='https://openapi.koreainvestment.com:9443';
const ROUTES={price:'/uapi/domestic-stock/v1/quotations/inquire-price',info:'/uapi/domestic-stock/v1/quotations/search-stock-info'};
const vault=()=>{throw Error('Cloud vault required')};
class KisMarket {
  constructor({fetchImpl=fetch,vaultImpl=vault,now=Date.now}={}){
    this.fetch=fetchImpl;this.vault=vaultImpl;this.now=now;this.token=null;this.authPending=null;this.infos=new Map();this.tail=Promise.resolve();
  }
  async init(){
    this.envMode=false;this.keys=await this.vault('credentials');
    if(!this.keys.appKey||!this.keys.appSecret)throw Error('증권 시세 연결 설정을 확인해줘.');
  }
  async tokenValue(){
    if(this.token?.expiresAt>this.now()+60000)return this.token.value;
    if(this.authPending)return this.authPending;
    this.authPending=(async()=>{
      const saved=this.envMode?{}:await this.vault('token-read');
      if(saved.expiresAt>this.now()+60000&&typeof saved.value==='string'){this.token=saved;return saved.value;}
      let response,data;
      try {response=await this.fetch(BASE+'/oauth2/tokenP',{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey:this.keys.appKey,appsecret:this.keys.appSecret}),signal:AbortSignal.timeout(15000)});data=await response.json();}
      catch {throw Error('한국투자증권 인증 서버에 연결하지 못했어.');}
      if(!response.ok||!data.access_token)throw Error('API 인증에 실패했어. 실전용 키와 신청 상태를 확인해줘.');
      const duration=Math.min(Number(data.expires_in)||0,86400);
      if(duration<120)throw Error('인증 토큰 유효기간을 확인할 수 없어.');
      this.token={value:data.access_token,expiresAt:this.now()+duration*1000};
      if(!this.envMode)await this.vault('token-write',JSON.stringify(this.token));return this.token.value;
    })();
    try{return await this.authPending;}finally{this.authPending=null;}
  }
  async request(kind,params,tr){
    // Only these two read-only quote routes are supported. No order/account API.
    if(!Object.hasOwn(ROUTES,kind))throw Error('허용되지 않은 API 요청이야.');
    const token=await this.tokenValue();
    const url=new URL(ROUTES[kind],BASE);url.search=new URLSearchParams(params).toString();
    let response,data;
    try{for(let attempt=0;attempt<3;attempt++){response=await this.fetch(url,{redirect:'error',headers:{authorization:'Bearer '+token,appkey:this.keys.appKey,appsecret:this.keys.appSecret,tr_id:tr,custtype:'P'},signal:AbortSignal.timeout(15000)});data=await response.json();if(data.msg_cd!=='EGW00201'||attempt===2)break;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}}
    catch{throw Error('시세 서버 응답을 받지 못했어. 잠시 후 다시 조회해줘.');}
    if(!response.ok||data.rt_cd!=='0'){
      const code=/^[A-Z0-9]{3,20}$/.test(data.msg_cd||'')?' ('+data.msg_cd+')':'';
      throw Error('시세 조회가 거절됐어. 종목코드·API 이용 상태를 확인해줘.'+code);
    }
    return data.output;
  }
  getQuote(code){
    if(!/^\d{6}$/.test(code))return Promise.reject(Error('종목코드는 숫자 6자리로 입력해줘.'));
    const work=this.tail.then(()=>this.loadQuote(code));
    // Serialize requests and leave a small interval within broker rate limits.
    this.tail=work.catch(()=>{}).then(()=>new Promise(r=>setTimeout(r,250)));return work;
  }
  async loadQuote(code){
    let info=this.infos.get(code);
    if(!info){info=await this.request('info',{PRDT_TYPE_CD:'300',PDNO:code},'CTPF1002R');if(Array.isArray(info))info=info[0];if(!info)throw Error('종목 정보를 찾지 못했어.');this.infos.set(code,info);await new Promise(r=>setTimeout(r,250));}
    const p=await this.request('price',{FID_COND_MRKT_DIV_CODE:'J',FID_INPUT_ISCD:code},'FHKST01010100');
    const market=p?.rprs_mrkt_kor_name||'';
    const exchange=/코스닥|KOSDAQ/i.test(market)?'KOSDAQ':/코스피|KOSPI|유가증권/i.test(market)?'KOSPI':null;
    const price=Number(p?.stck_prpr);
    if(!exchange||!Number.isSafeInteger(price)||price<=0)throw Error('유효한 코스피·코스닥 시세가 아니야.');
    return {code,name:info.prdt_abrv_name||info.prdt_name||code,exchange,price,timestamp:this.now(),
      realtime:false,executionModel:'game-current-price',tradable:p.temp_stop_yn!=='Y'&&info.tr_stop_yn!=='Y',
      change:Number(p.prdy_vrss)||0,changePercent:Number(p.prdy_ctrt)||0,source:'한국투자증권 · KRX 현재가 조회'};
  }
}

export {KisMarket};
