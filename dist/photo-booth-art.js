(() => {
  // The two lines identify each city's local setting in the finished photo.
  const locations = {
    bay:['Golden Gate','Bay Bridge'], nyc:['Brooklyn Bridge','Times Square'], la:['Hollywood Hills','Sunset Boulevard'],
    atl:['Peachtree Street','Sweet Auburn'], chi:['The Loop','Lake Michigan'], hou:['Downtown Houston','Buffalo Bayou'],
    phl:['Broad Street','South Street'], dfw:['Deep Ellum','Fort Worth Stockyards'], dc:['National Mall','U Street'],
    mia:['Ocean Drive','Biscayne Bay'], det:['Motown','Woodward Avenue'], bos:['Back Bay','Boston Harbor'],
    sea:['Space Needle','Pike Place'], phx:['Camelback Mountain','Roosevelt Row'], den:['Rocky Mountains','Five Points'],
    sd:['Balboa Park','Ocean Beach'], bal:['Inner Harbor','Pennsylvania Avenue'], lv:['Fremont Street','The Strip'],
    pdx:['St. Johns Bridge','Burnside'], msp:['Stone Arch Bridge','First Avenue'], stl:['Gateway Arch','Delmar Loop'],
    cle:['Lake Erie','Euclid Avenue'], nola:['French Quarter','Bourbon Street'], mem:['Beale Street','South Main'],
    sac:['Tower Bridge','Old Sacramento'], sat:['The Alamo','River Walk'], atx:['Congress Avenue','Sixth Street'],
    orl:['Lake Eola','Church Street'], tpa:['Ybor City','Tampa Riverwalk'], clt:['Uptown','NoDa'],
    rdu:['City of Oaks','Durham Bull City'], bna:['Broadway','Music Row'], ind:['Monument Circle','Mass Ave'],
    cmh:['Short North','Scioto Mile'], mke:['Third Ward','Lake Michigan'], jax:['Main Street Bridge','Riverside'],
    kc:['18th & Vine','Crossroads'], hnl:['Diamond Head','Waikiki'], okc:['Bricktown','Scissortail Park'],
    slc:['Wasatch Range','Temple Square'], pit:['Three Rivers','Strip District'], orf:['Hampton Roads Harbor','The 757'],
    fresno:['Tower District','San Joaquin Valley'], cin:['Roebling Bridge','Over-the-Rhine']
  };
  const scenes = [
    {name:'Blacklight Graffiti', colors:['#140723','#fa3899','#60f7ff']},
    {name:'Airbrush Sunset', colors:['#472668','#ffad60','#ffd8ba']},
    {name:'Chrome After Dark', colors:['#081a42','#8677ff','#bcfffa']}
  ];
  const bridge = new Set(['bay','nyc','pdx','msp','sac','jax','cin','pit']);
  const mountains = new Set(['la','phx','den','hnl','slc','fresno']);
  const water = new Set(['chi','hou','mia','bos','sd','bal','cle','sat','orl','tpa','mke','orf']);

  function silhouette(context, station, color) {
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = 7;
    const line = points => {
      context.beginPath();
      for (const [x,y] of points) context.lineTo(x,y);
      context.stroke();
    };
    if (bridge.has(station.id)) {
      line([[0,602],[720,602]]);
      for (const x of [150,560]) line([[x,670],[x,440],[x+21,440],[x+21,670]]);
      line([[0,594],[150,449],[245,542],[360,573],[465,542],[560,449],[720,594]]);
    } else if (mountains.has(station.id)) {
      context.beginPath();
      for (const [x,y] of [[0,675],[0,577],[93,486],[171,546],[270,463],[305,501],[407,416],[540,538],[615,471],[720,570],[720,675]]) context.lineTo(x,y);
      context.fill();
    } else if (station.id === 'stl') {
      context.lineWidth = 18;
      context.beginPath();
      context.moveTo(130,665);
      context.bezierCurveTo(236,360,486,360,590,665);
      context.stroke();
    } else if (station.id === 'sea') {
      line([[360,650],[360,440]]);
      context.beginPath();
      context.ellipse(360,452,55,12,0,0,Math.PI*2);
      context.fill();
      line([[360,452],[360,402]]);
    } else {
      let seed = [...station.id].reduce((value,char) => value * 33 + char.charCodeAt(0), 7);
      for (let x = 0; x < 720; x += 44) {
        seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
        const height = 33 + seed % 121;
        context.fillRect(x,650-height,39,height);
        if (seed % 3 === 0) context.fillRect(x+15,635-height,3,15);
      }
      if (water.has(station.id)) {
        for (let i=0;i<4;i++) line([[23+i*110,671+i%2*9],[90+i*110,671+i%2*9]]);
      }
    }
  }

  function draw(canvas, station, index, texture) {
    const context = canvas.getContext('2d');
    const [base, accent, light] = scenes[index].colors;
    context.save();
    context.scale(canvas.width/720,canvas.height/900);
    context.fillStyle = base;
    context.fillRect(0,0,720,900);
    if (texture) context.drawImage(texture,0,0,720,900);
    const glow = context.createRadialGradient(360,460,15,360,460,500);
    glow.addColorStop(0,accent+'70');
    glow.addColorStop(1,base+'76');
    context.fillStyle = glow;
    context.fillRect(0,0,720,900);
    silhouette(context,station,light+'82');
    const shade = context.createLinearGradient(0,0,0,900);
    shade.addColorStop(0,base+'da');
    shade.addColorStop(.22,base+'08');
    shade.addColorStop(.67,base+'00');
    shade.addColorStop(1,base+'ff');
    context.fillStyle = shade;
    context.fillRect(0,0,720,900);

    context.strokeStyle = light+'ac';
    context.lineWidth = 3;
    context.strokeRect(19,19,682,862);
    context.textAlign = 'center';
    context.lineJoin = 'round';
    context.font = 'italic 900 82px "Arial Black", system-ui, sans-serif';
    context.strokeStyle = base;
    context.lineWidth = 13;
    const name = station.city.toUpperCase();
    context.strokeText(name,360,133,642);
    const ink = context.createLinearGradient(0,69,0,140);
    ink.addColorStop(0,light);
    ink.addColorStop(.53,'#fffaf4');
    ink.addColorStop(1,accent);
    context.fillStyle = ink;
    context.fillText(name,360,133,642);
    context.font = '800 27px system-ui, sans-serif';
    const [first, second] = locations[station.id];
    context.fillStyle = light;
    context.fillText(index === 0 ? first : index === 1 ? second : first+' / '+second,360,795,630);
    context.font = '700 16px system-ui, sans-serif';
    context.fillStyle = '#ffffff';
    context.fillText('ONLINE CLUBING  /  '+station.code,360,838);
    context.restore();
  }
  window.clubBoothArt = {scenes, draw};
})();
