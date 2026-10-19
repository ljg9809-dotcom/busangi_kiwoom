/* 사용자가 제공한 장소 사진을 부산기 그림체로 재해석한 컬러 배경. 원본 보존. */
(function(root){
  'use strict';
  const characters={
    idle:'assets/busangi-character.png',
    eat:'assets/actions/busangi-eat.png',drink:'assets/actions/busangi-drink.png',
    view:'assets/actions/busangi-view.png',study:'assets/actions/busangi-study.png',
    rest:'assets/actions/busangi-rest.png',pc:'assets/actions/busangi-pc-clean.png',
    karaoke:'assets/actions/busangi-karaoke-clean.png',movie:'assets/actions/busangi-movie.png',
    park:'assets/actions/busangi-park-clean.png'
  };
  const backgrounds=Object.fromEntries(['station','gwangalli','haeundae','gamcheon','songdo','huinnyeoul','nampo','dadaepo','lotteworld']
    .map(id=>[id,{default:'assets/backgrounds/'+id+'.png'}]));
  // 제공되지 않은 실내 공간에 관광지 배경을 잘못 재사용하지 않는다.
  for(const id of ['home','study-room'])backgrounds[id]={default:null};
  for(const id of ['pc-room','karaoke-room','cinema'])backgrounds[id]={default:'assets/backgrounds/'+id+'.png'};
  const layouts={
    'pc-room':{x:76,height:66,bottom:52,backgroundPosition:'center 58%'},
    'karaoke-room':{x:77,height:66,bottom:52,backgroundPosition:'center 56%'},
    cinema:{x:77,height:65,bottom:52,backgroundPosition:'center 58%'},
    station:{x:80,height:66,bottom:52,backgroundPosition:'center 56%'},
    gwangalli:{x:77,height:63,bottom:52,backgroundPosition:'center 56%'},
    haeundae:{x:79,height:62,bottom:52,backgroundPosition:'center 62%'},
    gamcheon:{x:76,height:64,bottom:52,backgroundPosition:'center 58%'},
    songdo:{x:78,height:62,bottom:52,backgroundPosition:'center 60%'},
    huinnyeoul:{x:76,height:64,bottom:52,backgroundPosition:'center 56%'},
    nampo:{x:75,height:64,bottom:52,backgroundPosition:'center 60%'},
    dadaepo:{x:80,height:61,bottom:52,backgroundPosition:'center 56%'},
    lotteworld:{x:77,height:68,bottom:52,backgroundPosition:'center 52%'}
  };
  const actions={
    idle:{label:'부산에서 보내는 하루',alt:'인사하는 부산기'},
    eat:{label:'밥 먹는 중',alt:'작은 식탁에서 국밥을 떠먹는 부산기'},
    drink:{label:'음료 마시는 중',alt:'컵의 빨대로 음료를 마시는 부산기'},
    view:{label:'경치 구경 중',alt:'손으로 햇빛을 가리며 경치를 구경하는 부산기'},
    study:{label:'공부하는 중',alt:'책상에 앉아 책을 읽고 필기하는 부산기'},
    rest:{label:'편안하게 쉬는 중',alt:'벤치에 기대어 쉬는 부산기'},
    pc:{label:'PC방에서 게임 중',alt:'컴퓨터 앞에서 게임하는 부산기'},
    karaoke:{label:'노래방에서 노래하는 중',alt:'마이크를 들고 노래하는 부산기'},
    movie:{label:'영화 보는 중',alt:'팝콘을 먹으며 영화를 보는 부산기'},
    park:{label:'놀이공원에서 노는 중',alt:'놀이기구에서 두 손을 들고 즐거워하는 부산기'}
  };
  function resolve(state){
    let action='idle',location=state.location,activity=state.activity;
    if(state.study.running||activity==='study'){action='study';location='study-room';activity='study';}
    else if(state.rest.running||activity==='rest'){action='rest';location='home';activity='rest';}
    else if(activity==='meal')action='eat';
    else if(activity==='cafe')action='drink';
    else if(activity==='view')action='view';
    else if(activity==='leisure'){
      action=({pc:'pc','coin-song':'karaoke',karaoke:'karaoke',movie:'movie',park:'park'})[state.lastConsumed]||'rest';
      location=({pc:'pc-room',karaoke:'karaoke-room',movie:'cinema',park:'lotteworld'})[action]||location;
    }
    const backdrop=backgrounds[location]||{};
    const layout={...(layouts[location]||{x:50,height:66,bottom:52,backgroundPosition:'center'})};
    if(action==='eat')layout.height=Math.min(layout.height,61);
    return {action,location,activity,src:characters[action],...actions[action],layout,
      venue:({pc:'PC방',karaoke:'노래방',movie:'영화관'})[action]||null,
      background:backdrop[activity]||backdrop.default||null};
  }
  const API={characters,backgrounds,layouts,resolve};
  root.BusangiScenes=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
